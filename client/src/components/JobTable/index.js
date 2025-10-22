import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import { copyText } from "../../utils/clipboard";
import { APP_BASE_URL } from "../../config/env";
import JobChatModal from "../JobChatModal";
import "./styles.css";

const currencyFormatterCache = new Map();
const formatCurrency = (value, currency = "USD") => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "N/A";
  const code = currency || "USD";
  if (!currencyFormatterCache.has(code)) {
    try {
      currencyFormatterCache.set(
        code,
        new Intl.NumberFormat(undefined, { style: "currency", currency: code })
      );
    } catch (error) {
      currencyFormatterCache.set(
        code,
        new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" })
      );
    }
  }
  return currencyFormatterCache.get(code).format(amount);
};

const formatWindowLabel = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value.toLocaleString();
  if (typeof value === "number") {
    const numericDate = new Date(value);
    if (!Number.isNaN(numericDate.getTime())) {
      return numericDate.toLocaleString();
    }
    return String(value);
  }
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(" to ");
  }
  if (typeof value === "object") {
    const start =
      value.start || value.from || value.begin || value.opens || value.windowStart;
    const end = value.end || value.to || value.finish || value.closes || value.windowEnd;
    if (start || end) {
      return [start, end].filter(Boolean).join(" to ");
    }
    if (value.date) return String(value.date);
  }
  return String(value);
};

export default function JobTable({
  jobs,
  vendors = [],
  onUpdateJob,
  soloMode = false,
  onOpenBidding,
  onShowLinks,
  onViewJob,
  itemsPerPage = 10,
}) {
  const [openFor, setOpenFor] = useState(null);
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "ascending" });
  const [expandedRow, setExpandedRow] = useState(null);
  const [noteTranslations, setNoteTranslations] = useState({});
  const [followups, setFollowups] = useState({});
  const [followupOverlay, setFollowupOverlay] = useState(null);
  const [chatOverlayJobId, setChatOverlayJobId] = useState(null);
  const popRef = useRef(null);

  useEffect(() => {
    function handleClick(event) {
      if (!popRef.current) return;
      if (openFor && !popRef.current.contains(event.target)) {
        setOpenFor(null);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openFor]);

  const translateNotes = async (job) => {
    if (!job?.notes) return;
    setNoteTranslations((prev) => ({
      ...prev,
      [job._id]: { status: "loading" },
    }));
    try {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(job.notes)}&langpair=en|es`;
      const response = await fetch(url);
      const data = await response.json();
      const translated = data?.responseData?.translatedText;
      if (!translated) throw new Error("Translation unavailable");
      setNoteTranslations((prev) => ({
        ...prev,
        [job._id]: { status: "ready", text: translated },
      }));
    } catch (error) {
      setNoteTranslations((prev) => ({
        ...prev,
        [job._id]: {
          status: "error",
          error: error?.message || "Translation failed",
        },
      }));
    }
  };

  const handleSort = (key) => {
    if (!key) return;
    setSortConfig((prev) => {
      if (prev.key === key) {
        return {
          key,
          direction: prev.direction === "ascending" ? "descending" : "ascending",
        };
      }
      return { key, direction: "ascending" };
    });
  };

  const filteredJobs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return jobs || [];
    return (jobs || []).filter((job) => {
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
      return haystack.includes(q);
    });
  }, [jobs, query]);

  const sortedJobs = useMemo(() => {
    const list = [...filteredJobs];
    const { key, direction } = sortConfig;
    if (!key) return list;
    return list.sort((a, b) => {
      const av = a[key] ?? "";
      const bv = b[key] ?? "";
      if (av < bv) return direction === "ascending" ? -1 : 1;
      if (av > bv) return direction === "ascending" ? 1 : -1;
      return 0;
    });
  }, [filteredJobs, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(sortedJobs.length / itemsPerPage));
  const page = Math.min(currentPage, totalPages);
  const startIndex = (page - 1) * itemsPerPage;
  const paginatedJobs = sortedJobs.slice(startIndex, startIndex + itemsPerPage);

  const handlePageChange = (nextPage) => {
    const clamped = Math.max(1, Math.min(totalPages, nextPage));
    setCurrentPage(clamped);
    document.querySelector(".jobtable-wrapper")?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const copyStatusLink = async (jobId) => {
    try {
      const { data } = await api.get(`/api/jobs/${jobId}/links`);
      const link = data.statusUrl || `${APP_BASE_URL}/status/${jobId}`;
      const ok = await copyText(link);
      if (!ok) throw new Error();
    } catch (error) {
      const fallback = `${APP_BASE_URL}/status/${jobId}`;
      const ok = await copyText(fallback);
      if (!ok) {
        alert("Could not copy link. Long-press or select to copy.");
      }
    }
  };

  const copyVendorLink = async (jobId) => {
    try {
      const { data } = await api.get(`/api/jobs/${jobId}/links`);
      if (!data.vendorLink) throw new Error("No vendor link yet");
      const ok = await copyText(data.vendorLink);
      if (!ok) alert("Could not copy vendor link. Long-press or select to copy.");
    } catch (error) {
      alert(error?.response?.data?.message || error.message || "Links not available. Open bidding first.");
    }
  };

  const copyCustomerLink = async (jobId) => {
    try {
      const { data } = await api.get(`/api/jobs/${jobId}/links`);
      if (!data.customerLink) throw new Error("No customer link yet");
      const ok = await copyText(data.customerLink);
      if (!ok) alert("Could not copy customer link. Long-press or select to copy.");
    } catch (error) {
      alert(error?.response?.data?.message || error.message || "Links not available. Open bidding first.");
    }
  };

  const updateFollowupState = (jobId, audience, patch) => {
    setFollowups((prev) => {
      const current = prev[jobId] || {};
      const audienceState = current[audience] || {};
      return {
        ...prev,
        [jobId]: {
          ...current,
          [audience]: { ...audienceState, ...patch },
        },
      };
    });
  };

  const copyFollowupText = async (text, label) => {
    const value = (text || "").trim();
    if (!value) return;
    const ok = await copyText(value);
    if (!ok) alert(`Could not copy ${label}.`);
  };

  const handleFollowupInputChange = (jobId, audience, field, value) => {
    const existingInputs = followups[jobId]?.[audience]?.inputs || {};
    updateFollowupState(jobId, audience, {
      inputs: {
        ...existingInputs,
        [field]: value,
      },
    });
  };

  const requestFollowup = async (job, audience) => {
    if (!job?._id) return;
    const jobId = job._id;
    updateFollowupState(jobId, audience, {
      loading: true,
      error: "",
      draft: null,
      inputs: { message: "" },
      context: null,
      raw: null,
      sending: false,
    });
    try {
      const payload = {
        jobId,
        audience,
        vendorId: audience === "vendor" ? job.vendorId : undefined,
      };
      const { data } = await api.post("/api/ai/followups", payload);
      const draft = data?.draft || null;
      updateFollowupState(jobId, audience, {
        loading: false,
        error: "",
        draft,
        inputs: { message: draft?.message || "" },
        context: data?.context || null,
        raw: data?.raw || null,
        sending: false,
      });
    } catch (error) {
      updateFollowupState(jobId, audience, {
        loading: false,
        draft: null,
        inputs: { message: "" },
        context: null,
        raw: null,
        sending: false,
        error:
          error?.response?.data?.message ||
          error?.message ||
          "Could not generate follow-up. Try again.",
      });
    }
  };

  const openFollowupOverlay = (job, audience) => {
    if (!job?._id) return;
    setFollowupOverlay({ jobId: job._id, audience });
    requestFollowup(job, audience);
  };

  const closeFollowupOverlay = () => {
    setFollowupOverlay(null);
  };

  const openChatOverlay = (job) => {
    if (!job?._id) return;
    setChatOverlayJobId(job._id);
  };

  const closeChatOverlay = () => {
    setChatOverlayJobId(null);
  };

  const sendFollowup = async (job, audience) => {
    if (!job?._id) return;
    const jobId = job._id;
    const state = followups[jobId]?.[audience] || {};
    const message = (state.inputs?.message || "").trim();
    if (!message) {
      alert("Message cannot be empty.");
      return;
    }

    updateFollowupState(jobId, audience, {
      sending: true,
      error: "",
    });

    try {
      const payload = {
        jobId,
        audience,
        channel: "in_app",
        body: message,
      };
      const { data } = await api.post("/api/ai/followups/send", payload);
      updateFollowupState(jobId, audience, {
        sending: false,
        lastSentAt: data?.message?.createdAt || new Date().toISOString(),
        lastSentChannel: "in_app",
        sentMessage: data?.message || null,
      });
      closeFollowupOverlay();
    } catch (error) {
      updateFollowupState(jobId, audience, {
        sending: false,
        error:
          error?.response?.data?.message ||
          error?.message ||
          "Could not send follow-up. Try again.",
      });
    }
  };

  const assignVendor = async (job, vendorId) => {
    if (!vendorId) return;
    await onUpdateJob(job._id, { vendorId, status: "Assigned" });
    setOpenFor(null);
    setQuery("");
  };

  const displayVendor = (job) => {
    if (job.vendorName || job.vendorPhone) {
      return { name: job.vendorName || "Selected vendor", phone: job.vendorPhone };
    }
    if (job.vendorId) {
      const v = vendors.find((candidate) => String(candidate._id) === String(job.vendorId));
      if (v) return { name: v.name, phone: v.phone, city: v.city };
    }
    return null;
  };

  const hasPagination = totalPages > 1;

  return (
    <div className="jobtable-container">
      <div className="jobtable-controls">
        <div className="jobtable-pagination-info">
          Showing {sortedJobs.length === 0 ? 0 : startIndex + 1}-{Math.min(startIndex + itemsPerPage, sortedJobs.length)} of {sortedJobs.length} jobs
        </div>
        <div className="jobtable-pagination">
          <button className="jobtable-pagination-btn" onClick={() => handlePageChange(page - 1)} disabled={page === 1}>
            Prev
          </button>
          <span className="jobtable-pagination-current">
            Page <strong>{page}</strong> of <strong>{totalPages}</strong>
          </span>
          <button className="jobtable-pagination-btn" onClick={() => handlePageChange(page + 1)} disabled={page === totalPages}>
            Next
          </button>
        </div>
      </div>

      <div className="jobtable-wrapper">
        <table className="jobtable">
          <thead>
            <tr>
              <th></th>
              <th onClick={() => handleSort("serviceType")} className="jobtable-sortable">
                Service {sortConfig.key === "serviceType" ? (sortConfig.direction === "ascending" ? "?" : "?") : ""}
              </th>
              <th onClick={() => handleSort("pickupAddress")} className="jobtable-sortable">
                Pickup {sortConfig.key === "pickupAddress" ? (sortConfig.direction === "ascending" ? "?" : "?") : ""}
              </th>
              <th>Drop-off</th>
              <th onClick={() => handleSort("status")} className="jobtable-sortable">
                Status {sortConfig.key === "status" ? (sortConfig.direction === "ascending" ? "?" : "?") : ""}
              </th>
              <th onClick={() => handleSort("priority")} className="jobtable-sortable">
                Priority {sortConfig.key === "priority" ? (sortConfig.direction === "ascending" ? "?" : "?") : ""}
              </th>
              {!soloMode && <th>Vendor</th>}
              <th>Bidding</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedJobs.map((job) => {
              const vendor = displayVendor(job);
              const isExpanded = expandedRow === job._id;
              const numericFinalPrice = Number(job.finalPrice);
              const hasWinningPrice =
                Number.isFinite(numericFinalPrice) && numericFinalPrice > 0;
              const displayedFixedPrice = formatCurrency(
                job.finalPrice ?? job.quotedPrice,
                job.currency || "USD"
              );
              const winningBidDisplay = hasWinningPrice
                ? formatCurrency(numericFinalPrice, job.currency || "USD")
                : "Awaiting winning bid";
              const bidPriceClass = `jobtable-price jobtable-price--bid${
                hasWinningPrice ? " is-filled" : ""
              }`;
              const hasVendorContact = Boolean(
                job.vendorId || job.vendorName || job.vendorPhone
              );
              const hasCustomerContact = Boolean(job.customerId || job.customerPhone);
              const jobFollowups = followups[job._id] || {};
              const vendorFollowup = jobFollowups.vendor || {};
              const customerFollowup = jobFollowups.customer || {};
              const referenceId =
                job.jobNumber ||
                job.referenceId ||
                job.referenceCode ||
                job.displayId ||
                job.ticketId ||
                (job._id ? `#${String(job._id).slice(-6).toUpperCase()}` : "Job");
              const requestedAt =
                job.requestedAt ||
                job.requestDate ||
                job.requestedOn ||
                job.createdAt ||
                job.createdOn;
              const formattedRequestedAt = requestedAt
                ? new Date(requestedAt).toLocaleString()
                : null;
              const pickupWindow =
                job.pickupWindow ||
                job.pickupTime ||
                job.pickupWindowStart ||
                job.pickupEta ||
                job.pickupScheduledAt;
              const dropoffWindow =
                job.dropoffWindow ||
                job.dropoffTime ||
                job.dropoffWindowStart ||
                job.dropoffEta ||
                job.dropoffScheduledAt;
              const customerName =
                job.customerName ||
                job.customerFullName ||
                job.customerCompany ||
                job.customerContactName;
              const customerPhone =
                job.customerPhone ||
                job.customerMobile ||
                job.customerContact ||
                job.customerContactPhone;
              const customerEmail =
                job.customerEmail ||
                job.customerContactEmail ||
                job.customerWorkEmail;
              const pickupWindowLabel = formatWindowLabel(pickupWindow);
              const dropoffWindowLabel = formatWindowLabel(dropoffWindow);
              const vendorEmail = job.vendorEmail || vendor?.email || vendor?.contactEmail;

              return (
                <>
                  <tr
                    key={job._id}
                    className={`jobtable-row ${job.priority === "urgent" ? "urgent" : ""} ${isExpanded ? "expanded" : ""}`}
                    onClick={() => setExpandedRow(isExpanded ? null : job._id)}
                  >
                    <td className="jobtable-expand">
                      <button
                        className="jobtable-expand-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpandedRow(isExpanded ? null : job._id);
                        }}
                      >
                        {isExpanded ? "-" : "+"}
                      </button>
                    </td>
                    <td>
                      <div className="jobtable-service">
                        <div className="jobtable-service-title">
                          {job.bidMode === "open" ? "Bid Only" : job.serviceType || "Service"}
                          <span className={`jobtable-mode-tag ${job.bidMode}`}>
                            {job.bidMode === "fixed" ? "Fixed" : "Bid"}
                          </span>
                        </div>
                        {job.bidMode === "open" && job.serviceType && (
                          <div className="jobtable-service-sub">{job.serviceType}</div>
                        )}
                        {job.bidMode === "fixed" && Number.isFinite(Number(job.quotedPrice)) && (
                          <div className="jobtable-price">
                            {displayedFixedPrice}
                          </div>
                        )}
                        {job.bidMode !== "fixed" && (
                          <div className={bidPriceClass}>
                            {winningBidDisplay}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="jobtable-address" title={job.pickupAddress}>
                        {job.pickupAddress}
                      </div>
                    </td>
                    <td className="jobtable-dropoff">
                      <div className="jobtable-address" title={job.dropoffAddress}>
                        {job.dropoffAddress || "-"}
                      </div>
                    </td>
                    <td className="jobtable-status">
                      <span className={`jobtable-badge status ${job.status}`}>{job.status}</span>
                    </td>
                    <td className="jobtable-priority">
                      <span className={`jobtable-badge priority ${job.priority || "normal"}`}>
                        {job.priority === "urgent" ? "URGENT" : "Normal"}
                      </span>
                    </td>
                    {!soloMode && (
                      <td className="jobtable-vendor">
                        {vendor ? (
                          <div className="jobtable-vendor-info">
                            <div className="jobtable-vendor-name">{vendor.name}</div>
                            <div className="jobtable-vendor-details">
                              {vendor.phone}
                              {vendor.city ? ` - ${vendor.city}` : ""}
                            </div>
                            <button
                              className="jobtable-btn jobtable-btn-link"
                              onClick={(event) => {
                                event.stopPropagation();
                                setOpenFor(job._id);
                                setQuery("");
                              }}
                            >
                              Change
                            </button>
                          </div>
                        ) : (
                          <button
                            className="jobtable-btn jobtable-btn-primary"
                            onClick={(event) => {
                              event.stopPropagation();
                              setOpenFor(job._id);
                            }}
                          >
                            Assign
                          </button>
                        )}
                        {openFor === job._id && (
                          <div className="jobtable-vendor-dropdown" ref={popRef}>
                            <div className="jobtable-dropdown-header">
                              <input
                                className="jobtable-dropdown-search"
                                placeholder="Search vendor..."
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                autoFocus
                                onClick={(event) => event.stopPropagation()}
                              />
                            </div>
                            <ul className="jobtable-dropdown-list">
                              {vendors
                                .filter((candidate) => {
                                  const hay = [candidate.name, candidate.city, candidate.phone]
                                    .filter(Boolean)
                                    .join(" ")
                                    .toLowerCase();
                                  return hay.includes(query.trim().toLowerCase());
                                })
                                .slice(0, 30)
                                .map((candidate) => (
                                  <li key={candidate._id}>
                                    <button
                                      className="jobtable-dropdown-item"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        assignVendor(job, candidate._id);
                                      }}
                                    >
                                      <span className="jobtable-dropdown-item-name">{candidate.name}</span>
                                      <span className="jobtable-dropdown-item-details">
                                        {candidate.city ? `${candidate.city} - ` : ""}
                                        {candidate.phone || ""}
                                      </span>
                                    </button>
                                  </li>
                                ))}
                            </ul>
                            <div className="jobtable-dropdown-footer">
                              <button
                                className="jobtable-btn jobtable-btn-ghost"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setOpenFor(null);
                                  setQuery("");
                                }}
                              >
                                Close
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                    )}
                    <td className="jobtable-bidding">
                      {job.biddingOpen ? (
                        <div className="jobtable-bidding-actions">
                          <button
                            className="jobtable-btn jobtable-btn-ghost"
                            onClick={(event) => {
                              event.stopPropagation();
                              copyVendorLink(job._id);
                            }}
                          >
                            Vendor
                          </button>
                          <button
                            className="jobtable-btn jobtable-btn-ghost"
                            onClick={(event) => {
                              event.stopPropagation();
                              copyCustomerLink(job._id);
                            }}
                          >
                            Customer
                          </button>
                        </div>
                      ) : job.vendorId || job.vendorName ? (
                        <span className="jobtable-badge assigned">Assigned</span>
                      ) : (
                        <button
                          className="jobtable-btn jobtable-btn-primary"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenBidding?.(job._id);
                          }}
                        >
                          Open Bidding
                        </button>
                      )}
                    </td>
                    <td className="jobtable-actions">
                      <div className="jobtable-action-buttons">
                        <button
                          className="jobtable-btn jobtable-btn-success"
                          onClick={(event) => {
                            event.stopPropagation();
                            onUpdateJob(job._id, { status: "Completed" });
                          }}
                          disabled={job.status === "Completed"}
                        >
                          Complete
                        </button>
                        <button
                          className="jobtable-btn jobtable-btn-link"
                          onClick={(event) => {
                            event.stopPropagation();
                            copyStatusLink(job._id);
                          }}
                        >
                          Copy Status
                        </button>
                        {onShowLinks && (
                          <button
                            className="jobtable-btn jobtable-btn-ghost"
                            onClick={(event) => {
                              event.stopPropagation();
                              onShowLinks(job);
                            }}
                          >
                            Show Links
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="jobtable-detail-row">
                      <td colSpan={soloMode ? 8 : 9}>
                        <div className="jobtable-detail-content">
                          <header className="jobtable-detail-header">
                            <div className="jobtable-detail-title">
                              <span className="jobtable-detail-overline">{referenceId}</span>
                              <h3>{job.serviceType || "Job summary"}</h3>
                              {job.pickupAddress && (
                                <p className="jobtable-detail-subtitle">{job.pickupAddress}</p>
                              )}
                              {formattedRequestedAt && (
                                <span className="jobtable-detail-meta">
                                  Requested {formattedRequestedAt}
                                </span>
                              )}
                            </div>
                            <div className="jobtable-detail-chip-group">
                              <span className={`jobtable-detail-chip status ${String(job.status || "unassigned").toLowerCase()}`}>
                                {job.status || "Unassigned"}
                              </span>
                              <span className={`jobtable-detail-chip priority ${job.priority === "urgent" ? "urgent" : "standard"}`}>
                                {job.priority === "urgent" ? "Urgent priority" : "Standard priority"}
                              </span>
                              <span className={`jobtable-detail-chip mode ${job.bidMode === "fixed" ? "fixed" : "open"}`}>
                                {job.bidMode === "fixed" ? "Fixed price" : "Open bidding"}
                              </span>
                            </div>
                          </header>

                          <div className="jobtable-detail-body">
                            <div className="jobtable-detail-main">
                              <section className="jobtable-detail-card jobtable-detail-summary">
                                <div className="jobtable-summary-grid">
                                  <div className="jobtable-summary-item">
                                    <span className="jobtable-summary-label">Price</span>
                                    <p className="jobtable-summary-value">
                                      {job.bidMode === "fixed" ? displayedFixedPrice : winningBidDisplay}
                                    </p>
                                    <span className="jobtable-summary-hint">
                                      {job.bidMode === "fixed"
                                        ? "Customer approved fixed quote"
                                        : hasWinningPrice
                                        ? "Latest winning bid"
                                        : "Awaiting winning bid"}
                                    </span>
                                  </div>
                                  <div className="jobtable-summary-item">
                                    <span className="jobtable-summary-label">Pickup</span>
                                    <p className="jobtable-summary-value">
                                      {job.pickupAddress || "Not provided"}
                                    </p>
                                    {pickupWindowLabel && (
                                      <span className="jobtable-summary-hint">
                                        {pickupWindowLabel}
                                      </span>
                                    )}
                                  </div>
                                  <div className="jobtable-summary-item">
                                    <span className="jobtable-summary-label">Drop-off</span>
                                    <p className="jobtable-summary-value">
                                      {job.dropoffAddress || "Not provided"}
                                    </p>
                                    {dropoffWindowLabel && (
                                      <span className="jobtable-summary-hint">
                                        {dropoffWindowLabel}
                                      </span>
                                    )}
                                  </div>
                                  {formattedRequestedAt && (
                                    <div className="jobtable-summary-item">
                                      <span className="jobtable-summary-label">Created</span>
                                      <p className="jobtable-summary-value">{formattedRequestedAt}</p>
                                      <span className="jobtable-summary-hint">Local time</span>
                                    </div>
                                  )}
                                </div>
                              </section>

                              <section className="jobtable-detail-card jobtable-detail-contacts">
                                <h5>Contacts</h5>
                                <div className="jobtable-contact-grid">
                                  <div className="jobtable-contact-card">
                                    <span className="jobtable-contact-label">Vendor</span>
                                    {vendor ? (
                                      <>
                                        <span className="jobtable-contact-name">{vendor.name}</span>
                                        {vendor.phone && (
                                          <span className="jobtable-contact-meta">{vendor.phone}</span>
                                        )}
                                        {vendorEmail && (
                                          <span className="jobtable-contact-meta">{vendorEmail}</span>
                                        )}
                                        {vendor.city && (
                                          <span className="jobtable-contact-meta">{vendor.city}</span>
                                        )}
                                      </>
                                    ) : (
                                      <span className="jobtable-contact-empty">
                                        No vendor assigned yet
                                      </span>
                                    )}
                                  </div>
                                  <div className="jobtable-contact-card">
                                    <span className="jobtable-contact-label">Customer</span>
                                    {customerName || customerPhone || customerEmail ? (
                                      <>
                                        {customerName && (
                                          <span className="jobtable-contact-name">{customerName}</span>
                                        )}
                                        {customerPhone && (
                                          <span className="jobtable-contact-meta">{customerPhone}</span>
                                        )}
                                        {customerEmail && (
                                          <span className="jobtable-contact-meta">{customerEmail}</span>
                                        )}
                                      </>
                                    ) : (
                                      <span className="jobtable-contact-empty">
                                        No customer contact on file
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </section>

                              {job.notes && (
                                <section className="jobtable-detail-card jobtable-notes-card">
                                  <div className="jobtable-detail-card-header">
                                    <div>
                                      <h5>Job notes</h5>
                                      <span className="jobtable-detail-meta">Internal only</span>
                                    </div>
                                    <button
                                      type="button"
                                      className="jobtable-btn jobtable-btn-ghost jobtable-notes-translate"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        translateNotes(job);
                                      }}
                                      disabled={noteTranslations[job._id]?.status === "loading"}
                                    >
                                      {noteTranslations[job._id]?.status === "loading"
                                        ? "Translating..."
                                        : "Translate to Spanish"}
                                    </button>
                                  </div>
                                  <p className="jobtable-detail-text">{job.notes}</p>
                                  {noteTranslations[job._id]?.status === "ready" && (
                                    <div className="jobtable-translation">
                                      <span className="jobtable-translation-label">Spanish</span>
                                      <p>{noteTranslations[job._id].text}</p>
                                    </div>
                                  )}
                                  {noteTranslations[job._id]?.status === "error" && (
                                    <p className="jobtable-translation-error">
                                      {noteTranslations[job._id].error}
                                    </p>
                                  )}
                                </section>
                              )}
                            </div>

                            <aside className="jobtable-detail-sidebar">
                              <section className="jobtable-detail-card jobtable-followup-card">
                                <div className="jobtable-detail-card-header">
                                  <h5>AI Follow-up</h5>
                                </div>
                                <p className="jobtable-followup-hint">
                                  Draft and send a quick update. Messages post to the job chat so the recipient can reply immediately.
                                </p>
                                <div className="jobtable-followup-actions">
                                  <button
                                    type="button"
                                    className="jobtable-btn jobtable-btn-primary"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openFollowupOverlay(job, "vendor");
                                    }}
                                    disabled={!hasVendorContact || vendorFollowup.loading}
                                  >
                                    {vendorFollowup.loading
                                      ? "Preparing vendor draft..."
                                      : "Vendor follow-up"}
                                  </button>
                                  <button
                                    type="button"
                                    className="jobtable-btn jobtable-btn-ghost"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openFollowupOverlay(job, "customer");
                                    }}
                                    disabled={!hasCustomerContact || customerFollowup.loading}
                                  >
                                    {customerFollowup.loading
                                      ? "Preparing customer draft..."
                                      : "Customer follow-up"}
                                  </button>
                                </div>
                                {!hasVendorContact && (
                                  <p className="jobtable-followup-hint jobtable-followup-warning">
                                    Assign a vendor to enable vendor outreach.
                                  </p>
                                )}
                                {!hasCustomerContact && (
                                  <p className="jobtable-followup-hint jobtable-followup-warning">
                                    Add customer contact details to enable customer outreach.
                                  </p>
                                )}
                                {vendorFollowup.lastSentAt && (
                                  <p className="jobtable-followup-meta">
                                    Last vendor touchpoint{" "}
                                    {new Date(vendorFollowup.lastSentAt).toLocaleString()} via in-app chat
                                  </p>
                                )}
                                {customerFollowup.lastSentAt && (
                                  <p className="jobtable-followup-meta">
                                    Last customer touchpoint{" "}
                                    {new Date(customerFollowup.lastSentAt).toLocaleString()} via in-app chat
                                  </p>
                                )}
                              </section>

                              <section className="jobtable-detail-card jobtable-chat-card">
                                <div className="jobtable-detail-card-header">
                                  <h5>Job chat</h5>
                                </div>
                                <p className="jobtable-followup-hint">
                                  Open the in-app conversation to coordinate with vendors and customers in real time.
                                </p>
                                <div className="jobtable-followup-actions">
                                  <button
                                    type="button"
                                    className="jobtable-btn jobtable-btn-primary"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openChatOverlay(job);
                                    }}
                                  >
                                    Open chat
                                  </button>
                                </div>
                              </section>

                              <section className="jobtable-detail-card jobtable-detail-quick-actions">
                                <h5>Next steps</h5>
                                <p className="jobtable-detail-text">
                                  Jump into the full job workspace to adjust assignments, upload documents, and review the activity log.
                                </p>
                                <button
                                  className="jobtable-btn jobtable-btn-ghost"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (onViewJob) {
                                      onViewJob(job);
                                    } else {
                                      window.open(`${window.location.origin}/jobs/${job._id}`, "_blank");
                                    }
                                  }}
                                >
                                  View full details
                                </button>
                              </section>
                            </aside>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasPagination && (
        <div className="jobtable-controls jobtable-controls-footer">
          <div className="jobtable-pagination-info">Page {page} of {totalPages}</div>
          <div className="jobtable-pagination">
            <button className="jobtable-pagination-btn" onClick={() => handlePageChange(1)} disabled={page === 1}>
              First
            </button>
            <button className="jobtable-pagination-btn" onClick={() => handlePageChange(page - 1)} disabled={page === 1}>
              Previous
            </button>
            <span className="jobtable-pagination-current">
              Page <strong>{page}</strong> of <strong>{totalPages}</strong>
            </span>
            <button className="jobtable-pagination-btn" onClick={() => handlePageChange(page + 1)} disabled={page === totalPages}>
              Next
            </button>
            <button className="jobtable-pagination-btn" onClick={() => handlePageChange(totalPages)} disabled={page === totalPages}>
              Last
            </button>
          </div>
        </div>
      )}

      {followupOverlay && (() => {
        const { jobId, audience } = followupOverlay;
        const job = jobs.find((item) => item?._id === jobId);
        if (!job) return null;

        const state = followups[jobId]?.[audience] || {};
        const inputs = state.inputs || {};
        const messageValue = inputs.message || "";
        const sending = Boolean(state.sending);
        const disabled = state.loading || sending || !messageValue.trim();
        const audienceLabel = audience === "vendor" ? "Vendor" : "Customer";
        const dialogId = `followup-${jobId}-${audience}`;
        const contextMessages = Array.isArray(state.context?.lastMessages)
          ? state.context.lastMessages
          : [];

        return (
          <div
            className="jobtable-followup-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogId}
          >
            <div className="jobtable-followup-backdrop" onClick={closeFollowupOverlay} />
            <div
              className="jobtable-followup-dialog"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="jobtable-followup-dialog-header">
                <div>
                  <p className="jobtable-followup-overline">{audienceLabel} follow-up</p>
                  <h3 id={dialogId}>
                    {job.serviceType || "Job"} - {job.pickupAddress || "No pickup address"}
                  </h3>
                  <p className="jobtable-followup-subtitle">Status: {job.status || "Unassigned"}</p>
                </div>
                <button type="button" className="jobtable-followup-dialog-close" onClick={closeFollowupOverlay} aria-label="Close follow-up">X</button>
              </header>
              <div className="jobtable-followup-dialog-body">
                {state.loading ? (
                  <p>Generating draft...</p>
                ) : state.error ? (
                  <div className="jobtable-followup-error-pane">
                    <p>{state.error}</p>
                    <button
                      type="button"
                      className="jobtable-btn jobtable-btn-primary"
                      onClick={() => requestFollowup(job, audience)}
                      disabled={state.loading}
                    >
                      Try again
                    </button>
                  </div>
                ) : (
                  <>
                    <label className="jobtable-followup-field">
                      <span>Message</span>
                      <textarea
                        className="jobtable-followup-textarea"
                        rows={6}
                        value={messageValue}
                        onChange={(event) =>
                          handleFollowupInputChange(
                            job._id,
                            audience,
                            "message",
                            event.target.value
                          )
                        }
                        disabled={sending}
                      />
                    </label>
                    <p className="jobtable-followup-signature">
                      Signature added automatically: Best regards - Customer Service Team, ServiceOps, 1 (720) 815-7770
                    </p>
                    {Array.isArray(state.draft?.internalNotes) &&
                      state.draft.internalNotes.length > 0 && (
                        <div className="jobtable-followup-notes-block">
                          <span className="jobtable-followup-label">Internal notes</span>
                          <ul className="jobtable-followup-notes">
                            {state.draft.internalNotes.map((note, index) => (
                              <li key={`followup-note-${job._id}-${audience}-${index}`}>{note}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    {contextMessages.length > 0 && (
                      <div className="jobtable-followup-context">
                        <h5>Recent chat</h5>
                        <ul>
                          {contextMessages.map((msg, index) => (
                            <li key={`followup-context-${job._id}-${audience}-${index}`}>
                              <span className="jobtable-followup-context-meta">
                                {(msg.senderName || msg.senderRole || "Participant")} •{" "}
                                {msg.at ? new Date(msg.at).toLocaleString() : "Just now"}
                              </span>
                              <p>{msg.body || "…"}</p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
              <footer className="jobtable-followup-dialog-footer">
                <button
                  type="button"
                  className="jobtable-btn jobtable-btn-ghost"
                  onClick={() => requestFollowup(job, audience)}
                  disabled={state.loading || sending}
                >
                  Regenerate draft
                </button>
                <div className="jobtable-followup-footer-actions">
                  <button
                    type="button"
                    className="jobtable-btn jobtable-btn-link"
                    onClick={() =>
                      copyFollowupText(
                        messageValue || state.draft?.message || "",
                        "follow-up message"
                      )
                    }
                    disabled={state.loading}
                  >
                    Copy text
                  </button>
                  <button
                    type="button"
                    className="jobtable-btn jobtable-btn-success"
                    disabled={disabled}
                    onClick={() => sendFollowup(job, audience)}
                  >
                    {sending ? "Sending…" : "Send follow-up"}
                  </button>
                </div>
              </footer>
            </div>
          </div>
        );
      })()}

      {chatOverlayJobId && (() => {
        const job = (jobs || []).find((item) => item?._id === chatOverlayJobId);
        if (!job) return null;
        return <JobChatModal job={job} onClose={closeChatOverlay} />;
      })()}
    </div>
  );
}

























