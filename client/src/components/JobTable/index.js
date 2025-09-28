import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";
import { copyText } from "../../utils/clipboard";
import { APP_BASE_URL } from "../../config/env";
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
export default function JobTable({
  jobs,
  vendors = [],
  onUpdateJob,
  soloMode = false,
  onOpenBidding,
  onShowLinks,
  itemsPerPage = 10,
}) {
  const [openFor, setOpenFor] = useState(null);
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "ascending" });
  const [expandedRow, setExpandedRow] = useState(null);
  const [noteTranslations, setNoteTranslations] = useState({});
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
            ? Prev
          </button>
          <span className="jobtable-pagination-current">
            Page <strong>{page}</strong> of <strong>{totalPages}</strong>
          </span>
          <button className="jobtable-pagination-btn" onClick={() => handlePageChange(page + 1)} disabled={page === totalPages}>
            Next ?
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
                            {formatCurrency(job.finalPrice ?? job.quotedPrice, job.currency || "USD")}
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
                          <div className="jobtable-detail-section">
                            <h4>Job Details</h4>
                            <div className="jobtable-detail-grid">
                              <div>
                                <strong>Service Type:</strong> {job.serviceType || "N/A"}
                              </div>
                              <div>
                                <strong>Quoted Price:</strong>{" "}
                                {job.bidMode === "fixed"
                                  ? formatCurrency(
                                      job.finalPrice ?? job.quotedPrice,
                                      job.currency || "USD"
                                    )
                                  : "Set by winning bid"}
                              </div>
                              <div>
                                <strong>Status:</strong> {job.status || "Unassigned"}
                              </div>
                              <div>
                                <strong>Priority:</strong> {job.priority === "urgent" ? "Urgent" : "Normal"}
                              </div>
                            </div>
                          </div>

                          <div className="jobtable-detail-section">
                            <h4>Address Information</h4>
                            <div className="jobtable-detail-grid">
                              <div>
                                <strong>Pickup:</strong> {job.pickupAddress}
                              </div>
                              <div>
                                <strong>Drop-off:</strong> {job.dropoffAddress || "N/A"}
                              </div>
                            </div>
                          </div>

                          {job.notes && (
                            <div className="jobtable-detail-section">
                              <h4>Notes</h4>
                              <p>{job.notes}</p>
                              <button
                                type="button"
                                className="jobtable-btn jobtable-btn-ghost"
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
                              {noteTranslations[job._id]?.status === "ready" && (
                                <div className="jobtable-translation">
                                  <strong>Spanish:</strong>
                                  <p>{noteTranslations[job._id].text}</p>
                                </div>
                              )}
                              {noteTranslations[job._id]?.status === "error" && (
                                <p className="jobtable-translation-error">
                                  {noteTranslations[job._id].error}
                                </p>
                              )}
                            </div>
                          )}

                          <div className="jobtable-detail-actions">
                            <button
                              className="jobtable-btn jobtable-btn-ghost"
                              onClick={(event) => {
                                event.stopPropagation();
                                window.open(`${window.location.origin}/jobs/${job._id}`, "_blank");
                              }}
                            >
                              View Full Details
                            </button>
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
    </div>
  );
}





















