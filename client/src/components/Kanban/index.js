import { useState, useEffect, useRef } from "react";
import "./styles.css";

const STAGES = ["Unassigned", "Assigned", "OnTheWay", "Arrived", "Completed"];

const PAYMENT_METHOD_LABELS = {
  cash: "Cash",
  card: "Card",
  zelle: "Zelle",
  venmo: "Venmo",
  bank_transfer: "Bank transfer",
  other: "Other",
};

const formatCurrency = (value, currency = "USD") => {
  if (value == null) return "-";
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(num);
  } catch (_) {
    return num.toFixed(2);
  }
};

const formatDateTime = (value) => {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch (_) {
    return new Date(value).toLocaleString();
  }
};

const methodLabel = (method) =>
  method ? PAYMENT_METHOD_LABELS[method] || method : "-";

export default function Kanban({ jobs = [], onUpdateJob, onCompleteJob }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(8);
  const [expandedCard, setExpandedCard] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("priority");
  const cardRefs = useRef({});

  const normalizedJobs = Array.isArray(jobs) ? jobs : [];

  const filteredJobs = normalizedJobs.filter((job) => {
    const haystack = [
      job.serviceType,
      job.pickupAddress,
      job.dropoffAddress,
      job.notes,
      job.status,
      job.vendorName,
      job.vendorPhone,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(searchQuery.trim().toLowerCase());
  });

  const sortedJobs = [...filteredJobs].sort((a, b) => {
    if (sortBy === "priority") {
      const aPriority = (a.priority || "").toLowerCase();
      const bPriority = (b.priority || "").toLowerCase();
      if (aPriority === "urgent" && bPriority !== "urgent") return -1;
      if (aPriority !== "urgent" && bPriority === "urgent") return 1;
      return 0;
    }
    if (sortBy === "service") {
      return (a.serviceType || "").localeCompare(b.serviceType || "");
    }
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(sortedJobs.length / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * itemsPerPage;
  const paginatedJobs = sortedJobs.slice(startIndex, startIndex + itemsPerPage);

  const move = (job, status, extra = {}) => {
    if (status === "Completed" && typeof onCompleteJob === "function") {
      onCompleteJob(job);
      return;
    }
    if (typeof onUpdateJob === "function") {
      onUpdateJob(job._id, { status, ...extra });
    }
  };

  const nextOf = (status) => {
    const index = STAGES.indexOf(status);
    return index >= 0 && index < STAGES.length - 1 ? STAGES[index + 1] : null;
  };

  const prevOf = (status) => {
    const index = STAGES.indexOf(status);
    return index > 0 ? STAGES[index - 1] : null;
  };

  const createRipple = (event) => {
    const button = event.currentTarget;
    const circle = document.createElement("span");
    const diameter = Math.max(button.clientWidth, button.clientHeight);
    const radius = diameter / 2;

    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${
      event.clientX - button.getBoundingClientRect().left - radius
    }px`;
    circle.style.top = `${
      event.clientY - button.getBoundingClientRect().top - radius
    }px`;
    circle.className = "kanban-ripple";

    const ripple = button.getElementsByClassName("kanban-ripple")[0];
    if (ripple) ripple.remove();

    button.appendChild(circle);

    setTimeout(() => {
      if (circle.parentNode === button) {
        button.removeChild(circle);
      }
    }, 600);
  };

  const setCardUrgency = (jobId, urgent) => {
    const card = cardRefs.current[jobId];
    if (card) {
      card.classList.toggle("urgent", !!urgent);
    }
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && expandedCard) {
        setExpandedCard(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [expandedCard]);

  return (
    <div className="kanban-container">
      {/* Controls */}
      <div className="kanban-controls">
        <div className="kanban-search">
          <span className="kanban-search-icon"></span>
          <input
            type="text"
            placeholder="Search jobs..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="kanban-search-input"
          />
        </div>

        <div className="kanban-sort">
          <label>Sort by:</label>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
            className="kanban-sort-select"
          >
            <option value="priority">Priority</option>
            <option value="service">Service Type</option>
          </select>
        </div>

        <div className="kanban-pagination">
          <button
            className="kanban-pagination-btn"
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={safeCurrentPage === 1}
          >
            -
          </button>
          <span className="kanban-pagination-info">
            Page {safeCurrentPage} of {totalPages || 1}
          </span>
          <button
            className="kanban-pagination-btn"
            onClick={() =>
              setCurrentPage((prev) => Math.min(prev + 1, totalPages))
            }
            disabled={safeCurrentPage === totalPages || totalPages === 0}
          >
            >
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="kanban-board">
        {STAGES.map((stage) => {
          const items = paginatedJobs.filter((job) => job.status === stage);
          const allItems = sortedJobs.filter((job) => job.status === stage);

          return (
            <div key={stage} className="kanban-column" data-stage={stage}>
              <div className="kanban-column-header">
                <h3 className="kanban-column-title">{stage}</h3>
                <span className="kanban-column-count">
                  {items.length} of {allItems.length}
                </span>
              </div>

              <div className="kanban-cards">
                {items.length === 0 ? (
                  <div className="kanban-empty-state">
                    <div className="kanban-empty-icon">o</div>
                    <p>No jobs in this stage</p>
                  </div>
                ) : (
                  items.map((j) => {
                    const next = nextOf(j.status);
                    const prev = prevOf(j.status);
                    const isUrgent = (j.priority || "").toLowerCase() === "urgent";
                    const isExpanded = expandedCard === j._id;

                    return (
                      <div
                        key={j._id}
                        className={`kanban-card ${
                          isUrgent ? "urgent" : ""
                        } ${j.flags?.underReport ? "flagged" : ""} ${
                          j.reportedPayment?.amount ? "has-report" : ""
                        } ${isExpanded ? "expanded" : ""}`}
                        onClick={() =>
                          setExpandedCard(isExpanded ? null : j._id)
                        }
                        ref={(element) => (cardRefs.current[j._id] = element)}
                      >
                        {/* Card Header */}
                        <div className="kanban-card-header">
                          <div className="kanban-card-badges">
                            <span className="kanban-card-service">
                              {j.serviceType || "Service"}
                            </span>
                            {isUrgent && (
                              <span className="kanban-card-priority urgent">
                                URGENT
                              </span>
                            )}
                          </div>

                          {j.quotedPrice && (
                            <div className="kanban-card-price">
                              {formatCurrency(j.quotedPrice, j.currency || "USD")}
                            </div>
                          )}
                        </div>

                        {/* Card Content */}
                        <div className="kanban-card-content">
                          <div
                            className="kanban-card-address"
                            title={j.pickupAddress}
                          >
                            {j.pickupAddress}
                          </div>

                          {j.dropoffAddress && (
                            <div
                              className="kanban-card-address dropoff"
                              title={j.dropoffAddress}
                            >
                              {j.dropoffAddress}
                            </div>
                          )}

                          {j.notes && (
                            <div className="kanban-card-notes">
                              <p>{j.notes}</p>
                            </div>
                          )}

                          {j.reportedPayment?.amount > 0 && (
                            <div className="kanban-card-metrics">
                              <span className="kanban-card-metric">
                                Received {formatCurrency(j.reportedPayment.amount, j.currency || "USD")}
                              </span>
                              <span
                                className={`kanban-card-metric status-${
                                  j.commission?.status || "pending"
                                }`}
                              >
                                Commission {formatCurrency(j.commission?.amount || 0, j.currency || "USD")}
                              </span>
                            </div>
                          )}

                          {j.flags?.underReport && (
                            <div className="kanban-card-flag warning">
                               {j.flags.reason || "Reported below expected amount"}
                            </div>
                          )}
                        </div>

                        {/* Expanded Details */}
                        {isExpanded && (
                          <div className="kanban-card-details">
                            <div className="kanban-card-detail-grid">
                              <div>
                                <strong>Customer:</strong> {j.custName || "N/A"}
                              </div>
                              <div>
                                <strong>Phone:</strong> {j.custPhone || "N/A"}
                              </div>
                              <div>
                                <strong>Created:</strong>{" "}
                                {j.createdAt
                                  ? new Date(j.createdAt).toLocaleDateString()
                                  : "N/A"}
                              </div>
                              <div>
                                <strong>Status:</strong> {j.status}
                              </div>
                            </div>

                            <div className="kanban-card-financials">
                              <div className="kanban-card-financial">
                                <span className="label">Reported</span>
                                <span className="value">
                                  {formatCurrency(j.reportedPayment?.amount || 0, j.currency || "USD")}
                                </span>
                                <span className="meta">
                                  {methodLabel(j.reportedPayment?.method)} | {formatDateTime(j.reportedPayment?.reportedAt)}
                                </span>
                              </div>
                              <div className="kanban-card-financial">
                                <span className="label">Commission</span>
                                <span className="value">
                                  {formatCurrency(j.commission?.amount || 0, j.currency || "USD")}
                                </span>
                                <span className={`status-pill status-${j.commission?.status || "pending"}`}>
                                  {j.commission?.status || "pending"}
                                </span>
                                {j.commission?.chargeId && (
                                  <span className="meta">Ref {j.commission.chargeId}</span>
                                )}
                                {j.commission?.failureReason && (
                                  <span className="meta warning">{j.commission.failureReason}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Card Actions */}
                        <div className="kanban-card-actions">
                          <div className="kanban-action-group">
                            {prev && (
                              <button
                                className="kanban-action-btn back"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  createRipple(event);
                                  move(j, prev);
                                }}
                              >
                                - Back
                              </button>
                            )}

                            {next && (
                              <button
                                className="kanban-action-btn next"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  createRipple(event);
                                  move(j, next);
                                }}
                              >
                                Next >
                              </button>
                            )}
                          </div>

                          <div className="kanban-action-group">
                            {j.status !== "Completed" && (
                              <button
                                className="kanban-action-btn complete"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  createRipple(event);
                                  move(j, "Completed");
                                }}
                              >
                                 Complete
                              </button>
                            )}

                            {j.vendorId ? (
                              <button
                                className="kanban-action-btn unassign"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  createRipple(event);
                                  move(j, "Unassigned", { vendorId: null });
                                }}
                              >
                                 Unassign
                              </button>
                            ) : (
                              <span className="kanban-no-driver">No vendor</span>
                            )}
                          </div>

                          <div className="kanban-action-group">
                            {!isUrgent ? (
                              <button
                                className="kanban-action-btn escalate"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  createRipple(event);
                                  setCardUrgency(j._id, true);
                                  onUpdateJob?.(j._id, { priority: "urgent" });
                                }}
                                type="button"
                                title="Escalate this job to urgent priority"
                                aria-label="Escalate job to urgent priority"
                              >
                                Escalate to urgent
                              </button>
                            ) : (
                              <button
                                className="kanban-action-btn deescalate"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  createRipple(event);
                                  setCardUrgency(j._id, false);
                                  onUpdateJob?.(j._id, { priority: "normal" });
                                }}
                                type="button"
                                title="Return this job to normal priority"
                                aria-label="Return job to normal priority"
                              >
                                Clear escalation
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile Navigation */}
      <div className="kanban-mobile-nav">
        <button
          className="kanban-mobile-nav-btn"
          onClick={() => {
            const kanbanBoard = document.querySelector(".kanban-board");
            kanbanBoard?.scrollBy({ left: -300, behavior: "smooth" });
          }}
        >
          -
        </button>

        <div className="kanban-mobile-indicators">
          {STAGES.map((stage, index) => (
            <span
              key={stage}
              className="kanban-mobile-indicator"
              onClick={() => {
                const columns = document.querySelectorAll(".kanban-column");
                columns[index]?.scrollIntoView({
                  behavior: "smooth",
                  inline: "start",
                });
              }}
            />
          ))}
        </div>

        <button
          className="kanban-mobile-nav-btn"
          onClick={() => {
            const kanbanBoard = document.querySelector(".kanban-board");
            kanbanBoard?.scrollBy({ left: 300, behavior: "smooth" });
          }}
        >
          >
        </button>
      </div>
    </div>
  );
}





