import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import "./AdminOpsCenter.css";

const STATUS_LABEL = {
  Unassigned: "Matching",
  Assigned: "Assigned",
  OnTheWay: "En route",
  Arrived: "On site",
};

const URGENCY_LABEL = {
  emergency: "Emergency",
  urgent: "Urgent",
  standard: "Standard",
};

const QUEUE_PAGE_SIZE = 8;
const ESCALATION_PAGE_SIZE = 6;
const COMPLIANCE_PAGE_SIZE = 6;
const SCORECARD_PAGE_SIZE = 6;

const formatSlaBadge = (minutesRemaining) => {
  if (!Number.isFinite(minutesRemaining)) return "--";
  if (minutesRemaining > 0) return `-${minutesRemaining}m`;
  if (minutesRemaining === 0) return "Due";
  return `+${Math.abs(minutesRemaining)}m`;
};

function Pagination({ total, page, pageSize, onChange, label }) {
  if (total <= pageSize) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, start + pageSize - 1);
  const goTo = (next) => {
    const clamped = Math.min(totalPages, Math.max(1, next));
    if (clamped !== page) onChange(clamped);
  };
  return (
    <div className="ops-pagination" role="navigation" aria-label={label}>
      <span className="ops-pagination__meta">
        Showing {start}-{end} of {total}
      </span>
      <div className="ops-pagination__controls">
        <button
          type="button"
          className="ops-pagination__btn"
          onClick={() => goTo(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          Prev
        </button>
        <span className="ops-pagination__summary" aria-hidden="true">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          className="ops-pagination__btn"
          onClick={() => goTo(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function useMissionControl() {
  const [state, setState] = useState({
    queue: [],
    escalations: [],
    vendorScorecards: [],
    complianceTasks: [],
    generatedAt: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/api/ops/mission-control");
      setState(data || {});
      setError("");
    } catch (err) {
      setError(
        err?.response?.data?.message || "Failed to load mission control"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { state, loading, error, reload: load };
}

function QueueRow({ item }) {
  const atRisk = item.atRisk || item.severe;
  const minutesRemaining = item.minutesRemaining;
  const badge = formatSlaBadge(minutesRemaining);

  return (
    <tr
      className={
        atRisk ? "ops-queue__row ops-queue__row--risk" : "ops-queue__row"
      }
    >
      <td data-col="Job">
        <span className="ops-chip">
          {String(item.jobId).slice(-6).toUpperCase()}
        </span>
        <div className="ops-queue__meta">
          <strong>{item.serviceType}</strong>
          <span>{item.pickupAddress || "No pickup listed"}</span>
        </div>
      </td>
      <td data-col="Priority">
        <span className={`ops-pill ops-pill--${item.priority}`}>
          {URGENCY_LABEL[item.urgency] || "Standard"}
        </span>
      </td>
      <td data-col="Status">
        <span className="ops-queue__status">
          {STATUS_LABEL[item.status] || item.status}
        </span>
        <span className="ops-queue__timer">
          Open <strong>{item.openMinutes}m</strong>
        </span>
      </td>
      <td data-col="SLA">
        <div className="ops-queue__sla">
          <span className="ops-badge">{badge}</span>
          <span className="ops-queue__sla-caption">SLA {item.slaMinutes}m</span>
        </div>
      </td>
      <td data-col="Vendor">
        {item.vendorName ? (
          <div className="ops-queue__vendor">
            <strong>{item.vendorName}</strong>
            <span>{item.sinceAssignedMinutes || 0}m since assign</span>
          </div>
        ) : (
          <span className="muted">Unassigned</span>
        )}
      </td>
    </tr>
  );
}

function VendorScorecard({ card }) {
  return (
    <article className="ops-scorecard">
      <header>
        <div>
          <h3>{card.name}</h3>
          <span className="muted">{card.city || ""}</span>
        </div>
        <span
          className={`ops-badge ops-badge--${
            card.stats.slaHitRate >= 80 ? "good" : "warn"
          }`}
        >
          {card.stats.slaHitRate != null
            ? `${card.stats.slaHitRate}% SLA`
            : "No data"}
        </span>
      </header>
      <div className="ops-scorecard__grid">
        <div>
          <span className="ops-label">Completed (45d)</span>
          <strong>{card.stats.completed}</strong>
        </div>
        <div>
          <span className="ops-label">Avg arrival</span>
          <strong>
            {card.stats.avgArrivalMinutes != null
              ? `${card.stats.avgArrivalMinutes}m`
              : ""}
          </strong>
        </div>
        <div>
          <span className="ops-label">Avg rating</span>
          <strong>
            {card.stats.avgRating != null ? card.stats.avgRating : ""}
          </strong>
        </div>
        <div>
          <span className="ops-label">Gross</span>
          <strong>${Math.round(card.stats.gross || 0).toLocaleString()}</strong>
        </div>
      </div>
      {Array.isArray(card.compliance?.issues) &&
      card.compliance.issues.length > 0 ? (
        <div className="ops-scorecard__issues">
          <span className="ops-label">Compliance</span>
          <ul>
            {card.compliance.issues.map((issue) => (
              <li key={issue.key || issue.label}>{issue.label}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

export default function AdminOpsCenter() {
  const { state, loading, error, reload } = useMissionControl();
  const navigate = useNavigate();

  const handleViewJob = useCallback(
    (jobId) => {
      if (!jobId) return;
      navigate(`/jobs/${jobId}`);
    },
    [navigate]
  );

  const handleCallVendor = useCallback((phone) => {
    if (!phone) return;
    const normalized = String(phone).replace(/[^\d+]/g, "");
    if (!normalized) return;
    if (typeof window !== "undefined") {
      window.location.href = `tel:${normalized}`;
    }
  }, []);

  const handleEmailVendor = useCallback((email) => {
    if (!email) return;
    if (typeof window !== "undefined") {
      window.location.href = `mailto:${email}`;
    }
  }, []);

  const handleOpenDocument = useCallback((url) => {
    if (!url) return;
    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, []);

  const [queuePage, setQueuePage] = useState(1);
  const [escalationPage, setEscalationPage] = useState(1);
  const [compliancePage, setCompliancePage] = useState(1);
  const [scorecardPage, setScorecardPage] = useState(1);

  const queueItems = useMemo(() => state.queue ?? [], [state.queue]);
  const escalationItems = useMemo(
    () => state.escalations ?? [],
    [state.escalations]
  );
  const complianceItems = useMemo(
    () => state.complianceTasks ?? [],
    [state.complianceTasks]
  );
  const scorecardItems = useMemo(
    () => state.vendorScorecards ?? [],
    [state.vendorScorecards]
  );

  const queueTotal = queueItems.length;
  const escalationTotal = escalationItems.length;
  const complianceTotal = complianceItems.length;
  const scorecardTotal = scorecardItems.length;

  useEffect(() => setQueuePage(1), [queueTotal]);
  useEffect(() => setEscalationPage(1), [escalationTotal]);
  useEffect(() => setCompliancePage(1), [complianceTotal]);
  useEffect(() => setScorecardPage(1), [scorecardTotal]);

  const pagedQueueItems = useMemo(
    () =>
      queueItems.slice(
        (queuePage - 1) * QUEUE_PAGE_SIZE,
        queuePage * QUEUE_PAGE_SIZE
      ),
    [queueItems, queuePage]
  );

  const pagedEscalations = useMemo(
    () =>
      escalationItems.slice(
        (escalationPage - 1) * ESCALATION_PAGE_SIZE,
        escalationPage * ESCALATION_PAGE_SIZE
      ),
    [escalationItems, escalationPage]
  );

  const pagedCompliance = useMemo(
    () =>
      complianceItems.slice(
        (compliancePage - 1) * COMPLIANCE_PAGE_SIZE,
        compliancePage * COMPLIANCE_PAGE_SIZE
      ),
    [complianceItems, compliancePage]
  );

  const pagedScorecards = useMemo(
    () =>
      scorecardItems.slice(
        (scorecardPage - 1) * SCORECARD_PAGE_SIZE,
        scorecardPage * SCORECARD_PAGE_SIZE
      ),
    [scorecardItems, scorecardPage]
  );

  const atRiskCount = useMemo(
    () => queueItems.filter((item) => item.atRisk).length,
    [queueItems]
  );

  const queueAtRiskPercent = queueTotal
    ? Math.round((atRiskCount / queueTotal) * 100)
    : 0;
  const lastUpdatedStamp = state.generatedAt
    ? new Date(state.generatedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "--";
  const showSkeleton = loading && !state.generatedAt && !error;
  const [animateEntering, setAnimateEntering] = useState(false);
  const prevShowSkeletonRef = useRef(showSkeleton);

  useEffect(() => {
    let timer;
    if (prevShowSkeletonRef.current && !showSkeleton) {
      setAnimateEntering(true);
      timer = setTimeout(() => setAnimateEntering(false), 600);
    }
    prevShowSkeletonRef.current = showSkeleton;
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [showSkeleton]);

  const getDelayClass = (delay = 0) =>
    animateEntering ? `ops-animate-in ops-animate-delay-${delay}` : "";

  const queueStatClass = `ops-stat ${
    atRiskCount > 0 ? "ops-stat--risk" : "ops-stat--info"
  }`;
  const escalationStatClass = `ops-stat ${
    escalationTotal > 0 ? "ops-stat--warn" : "ops-stat--calm"
  }`;
  const complianceStatClass = `ops-stat ${
    complianceTotal > 0 ? "ops-stat--warn" : "ops-stat--calm"
  }`;

  return (
    <div className="ops">
      <header className="ops-header">
        <div>
          <h1>Mission Control</h1>
          <p>
            Real-time health of your field ops: dispatch queue, escalations, and
            compliance exceptions.
          </p>
        </div>
        <div className="ops-header__meta">
          <button
            className="btn ghost ops-header__refresh"
            type="button"
            onClick={reload}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <span className="ops-header__stamp">
            <span
              className={`ops-dot ${loading ? "ops-dot--pulse" : ""}`}
              aria-hidden="true"
            />
            {loading ? "Syncing mission data..." : `Updated ${lastUpdatedStamp}`}
          </span>
        </div>
      </header>

      <section className="ops-stats" aria-label="Operations summary">
        {showSkeleton
          ? [0, 1, 2].map((idx) => (
              <article
                key={`stat-skeleton-${idx}`}
                className="ops-stat ops-stat--placeholder"
              >
                <span className="ops-skeleton ops-skeleton--label ops-skeleton--w-30" />
                <strong className="ops-skeleton ops-skeleton--value ops-skeleton--w-45" />
                <span className="ops-skeleton ops-skeleton--note ops-skeleton--w-60" />
              </article>
            ))
          : [
              {
                className: queueStatClass,
                label: "Active queue",
                value: queueTotal,
                note:
                  queueTotal === 0
                    ? "All clear"
                    : `${atRiskCount} at risk (${queueAtRiskPercent}%)`,
              },
              {
                className: escalationStatClass,
                label: "Escalations",
                value: escalationTotal,
                note:
                  escalationTotal > 0
                    ? "Requires follow-up"
                    : "None open",
              },
              {
                className: complianceStatClass,
                label: "Compliance",
                value: complianceTotal,
                note:
                  complianceTotal > 0 ? "Docs flagged" : "All caught up",
              },
            ].map((stat, idx) => (
              <article
                key={stat.label}
                className={`${stat.className} ${getDelayClass(idx)}`}
              >
                <span className="ops-stat__label">{stat.label}</span>
                <strong>{stat.value}</strong>
                <span className="ops-stat__note">{stat.note}</span>
              </article>
            ))}
      </section>

      {error ? <div className="ops-error">{error}</div> : null}
      <section className="ops-grid">
        <article className={`ops-card ops-card--wide ${getDelayClass(0)}`}>
          <header>
            <div>
              <h2>Dispatch Queue</h2>
              <p>
                {queueTotal} active jobs | {atRiskCount} at risk
              </p>
            </div>
            <span className="ops-badge">{loading ? "Syncing..." : "Live"}</span>
          </header>
          <div className="ops-table-wrap">
            {showSkeleton ? (
              <div className="ops-skeleton-list">
                {[0, 1, 2, 3].map((idx) => (
                  <div key={`queue-skeleton-${idx}`} className="ops-skeleton-card">
                    <div className="ops-skeleton-row">
                      <span className="ops-skeleton ops-skeleton--chip" />
                      <div className="ops-skeleton-col">
                        <span className="ops-skeleton ops-skeleton--line ops-skeleton--w-75" />
                        <span className="ops-skeleton ops-skeleton--line ops-skeleton--w-45" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <table className="ops-queue" aria-label="Dispatch queue">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>SLA</th>
                    <th>Vendor</th>
                  </tr>
                </thead>
                <tbody>
                  {queueTotal === 0 ? (
                    <tr>
                      <td colSpan={5} className="muted">
                        All clear - no active jobs in queue.
                      </td>
                    </tr>
                  ) : (
                    pagedQueueItems.map((item) => (
                      <QueueRow key={item.jobId} item={item} />
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
          {!showSkeleton ? (
            <Pagination
              total={queueTotal}
              page={queuePage}
              pageSize={QUEUE_PAGE_SIZE}
              onChange={setQueuePage}
              label="Dispatch queue pages"
            />
          ) : null}
        </article>

        <div className="ops-grid__secondary">
          <article className={`ops-card ${getDelayClass(1)}`}>
            <header>
              <div>
                <h2>Escalations</h2>
                <p>
                  {escalationTotal}{" "}
                  {escalationTotal === 1 ? "active escalation" : "active escalations"}
                </p>
              </div>
              <span
                className={`ops-badge ${
                  escalationTotal > 0 ? "ops-badge--warn" : "ops-badge--good"
                }`}
              >
                {escalationTotal > 0 ? "Attention" : "All clear"}
              </span>
            </header>
            {showSkeleton ? (
              <div className="ops-skeleton-list">
                {[0, 1].map((idx) => (
                  <div key={`esc-skeleton-${idx}`} className="ops-skeleton-card">
                    <span className="ops-skeleton ops-skeleton--line ops-skeleton--w-60" />
                    <div className="ops-skeleton-row">
                      <span className="ops-skeleton ops-skeleton--chip" />
                      <div className="ops-skeleton-col">
                        <span className="ops-skeleton ops-skeleton--line ops-skeleton--w-75" />
                        <span className="ops-skeleton ops-skeleton--line ops-skeleton--w-40" />
                      </div>
                    </div>
                    <span className="ops-skeleton ops-skeleton--line ops-skeleton--w-50" />
                  </div>
                ))}
              </div>
            ) : escalationTotal === 0 ? (
              <p className="muted">No escalations right now.</p>
            ) : (
              <>
                <ul className="ops-escalations">
                  {pagedEscalations.map((item) => {
                    const badge = formatSlaBadge(item.minutesRemaining);
                    const itemClass = item.severe
                      ? "ops-escalations__item ops-escalations__item--severe"
                      : item.atRisk
                      ? "ops-escalations__item ops-escalations__item--risk"
                      : "ops-escalations__item";
                    return (
                      <li key={item.jobId} className={itemClass}>
                        <div className="ops-escalations__header">
                          <div className="ops-escalations__job">
                            <span className="ops-chip">
                              {String(item.jobId).slice(-6).toUpperCase()}
                            </span>
                            <div>
                              <strong>{item.serviceType}</strong>
                              <span className="muted">
                                {item.pickupAddress || "No pickup listed"}
                              </span>
                            </div>
                          </div>
                          <span className={`ops-pill ops-pill--${item.urgency}`}>
                            {URGENCY_LABEL[item.urgency] || "Standard"}
                          </span>
                        </div>
                        <div className="ops-escalations__footer">
                          <div className="ops-escalations__sla">
                            <span className="ops-badge">{badge}</span>
                            <span className="ops-escalations__note">
                              SLA {item.slaMinutes}m {"\u2022"}{" "}
                              {STATUS_LABEL[item.status] || item.status}
                            </span>
                          </div>
                          <span className="ops-escalations__vendor">
                            {item.vendorName
                              ? `Vendor ${item.vendorName}`
                              : "Unassigned"}
                            {item.vendorPhone ? (
                              <span className="ops-escalations__contact">
                                {item.vendorPhone}
                              </span>
                            ) : null}
                          </span>
                        </div>
                        <div className="ops-escalations__actions">
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => handleViewJob(item.jobId)}
                          >
                            View job
                          </button>
                          {item.vendorPhone ? (
                            <button
                              type="button"
                              className="btn ghost"
                              onClick={() => handleCallVendor(item.vendorPhone)}
                            >
                              Call vendor
                            </button>
                          ) : null}
                          {item.vendorEmail ? (
                            <button
                              type="button"
                              className="btn ghost"
                              onClick={() => handleEmailVendor(item.vendorEmail)}
                            >
                              Email vendor
                            </button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <Pagination
                  total={escalationTotal}
                  page={escalationPage}
                  pageSize={ESCALATION_PAGE_SIZE}
                  onChange={setEscalationPage}
                  label="Escalations pages"
                />
              </>
            )}
          </article>

          <article className={`ops-card ${getDelayClass(2)}`}>
            <header>
              <div>
                <h2>Compliance Watchlist</h2>
                <p>Expiring documents and missing requirements.</p>
              </div>
              <span
                className={`ops-badge ${
                  complianceTotal > 0 ? "ops-badge--warn" : "ops-badge--good"
                }`}
              >
                {complianceTotal > 0 ? `${complianceTotal} open` : "Up to date"}
              </span>
            </header>
            {showSkeleton ? (
              <div className="ops-skeleton-list">
                {[0, 1, 2].map((idx) => (
                  <div key={`comp-skeleton-${idx}`} className="ops-skeleton-card">
                    <span className="ops-skeleton ops-skeleton--line ops-skeleton--w-75" />
                    <span className="ops-skeleton ops-skeleton--line ops-skeleton--w-50" />
                    <span className="ops-skeleton ops-skeleton--line ops-skeleton--w-40" />
                  </div>
                ))}
              </div>
            ) : complianceTotal === 0 ? (
              <p className="muted">No compliance follow-ups.</p>
            ) : (
              <>
                <ul className="ops-compliance">
                  {pagedCompliance.map((task) => {
                    const key =
                      task.documentId ||
                      task.key ||
                      `${task.vendorId}-${task.title || "task"}`;
                    const isExpiry = task.type === "expiry";
                    const dueDate =
                      isExpiry && task.expiresAt
                        ? new Date(task.expiresAt).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                          })
                        : null;
                    const badgeText = isExpiry
                      ? dueDate
                        ? `Exp ${dueDate}`
                        : "Expiring"
                      : "Missing";
                    const detail = isExpiry
                      ? dueDate
                        ? `Due ${dueDate}`
                        : ""
                      : task.reason || "";
                    const hasActions =
                      Boolean(task.documentUrl) ||
                      Boolean(task.vendorPhone) ||
                      Boolean(task.vendorEmail);
                    return (
                      <li key={key}>
                        <div>
                          <strong>{task.vendorName || "Vendor"}</strong>
                          <span className="muted">
                            {isExpiry
                              ? task.title || "Document"
                              : task.label || task.title || "Requirement"}
                          </span>
                          {detail ? (
                            <span className="ops-compliance__note">{detail}</span>
                          ) : null}
                        </div>
                        <div className="ops-compliance__meta">
                          <span className="ops-badge ops-badge--warn">
                            {badgeText}
                          </span>
                          {task.status ? (
                            <span className="ops-compliance__status">
                              {task.status}
                            </span>
                          ) : null}
                          {hasActions ? (
                            <div className="ops-compliance__actions">
                              {task.documentUrl ? (
                                <button
                                  type="button"
                                  className="btn ghost"
                                  onClick={() =>
                                    handleOpenDocument(task.documentUrl)
                                  }
                                >
                                  Open doc
                                </button>
                              ) : null}
                              {task.vendorPhone ? (
                                <button
                                  type="button"
                                  className="btn ghost"
                                  onClick={() =>
                                    handleCallVendor(task.vendorPhone)
                                  }
                                >
                                  Call vendor
                                </button>
                              ) : null}
                              {task.vendorEmail ? (
                                <button
                                  type="button"
                                  className="btn ghost"
                                  onClick={() =>
                                    handleEmailVendor(task.vendorEmail)
                                  }
                                >
                                  Email vendor
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <Pagination
                  total={complianceTotal}
                  page={compliancePage}
                  pageSize={COMPLIANCE_PAGE_SIZE}
                  onChange={setCompliancePage}
                  label="Compliance task pages"
                />
              </>
            )}
          </article>
        </div>
      </section>

      <section className={`ops-card ops-card--scorecards ${getDelayClass(3)}`}>
        <header>
          <div>
            <h2>Vendor Scorecards (45 days)</h2>
            <p>
              Arrival performance, SLA compliance, and customer feedback at a
              glance.
            </p>
          </div>
        </header>
        {showSkeleton ? (
          <div className="ops-scorecards ops-scorecards--skeleton">
            {[0, 1, 2].map((idx) => (
              <div key={`scorecard-skeleton-${idx}`} className="ops-skeleton-card ops-skeleton-card--scorecard">
                <span className="ops-skeleton ops-skeleton--line ops-skeleton--w-60" />
                <span className="ops-skeleton ops-skeleton--line ops-skeleton--w-40" />
                <div className="ops-skeleton-row">
                  <span className="ops-skeleton ops-skeleton--line ops-skeleton--w-30" />
                  <span className="ops-skeleton ops-skeleton--line ops-skeleton--w-25" />
                </div>
                <span className="ops-skeleton ops-skeleton--line ops-skeleton--w-80" />
              </div>
            ))}
          </div>
        ) : scorecardTotal === 0 ? (
          <p className="muted">
            We need more job history to build meaningful scorecards.
          </p>
        ) : (
          <>
            <div className="ops-scorecards">
              {pagedScorecards.map((card) => (
                <VendorScorecard key={card.vendorId || card.name} card={card} />
              ))}
            </div>
            <Pagination
              total={scorecardTotal}
              page={scorecardPage}
              pageSize={SCORECARD_PAGE_SIZE}
              onChange={setScorecardPage}
              label="Vendor scorecard pages"
            />
          </>
        )}
      </section>
    </div>
  );
}


