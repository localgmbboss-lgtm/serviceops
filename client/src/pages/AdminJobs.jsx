import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import JobTable from "../components/JobTable";
import JobCreate from "../components/JobCreate";
import { copyText } from "../utils/clipboard";
import { useNotifications } from "../contexts/NotificationsContext";
import { recordAuditEvent } from "../utils/auditLog";
import "./AdminJobs.css";

const STATUSES = ["Unassigned", "Assigned", "OnTheWay", "Arrived", "Completed"];

export default function AdminJobs() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [banner, setBanner] = useState("");
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [last, setLast] = useState(null);
  const [soloMode, setSoloMode] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);
  const [links, setLinks] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const jobSnapshotRef = useRef(new Map());
  const jobsInitializedRef = useRef(false);
  const { publish } = useNotifications();

  const openCreateModal = () => setCreateOpen(true);
  const closeCreateModal = () => setCreateOpen(false);

  const withToast = (msg, ms = 2000) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), ms);
  };

  const withBanner = (msg, ms = 4000) => {
    setBanner(msg);
    window.setTimeout(() => setBanner(""), ms);
  };

  const copy = async (text, label = "Link") => {
    const ok = await copyText(text);
    if (ok) setToast(`${label} copied`);
    else setBanner(`Could not copy ${label.toLowerCase()}. Select and copy.`);
    setTimeout(() => setToast(""), 2000);
    setTimeout(() => setBanner(""), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/jobs");
      setJobs(data || []);
      setLast(new Date());
    } catch (e) {
      withBanner(e?.response?.data?.message || "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 7000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!publish) return;
    const previous = jobSnapshotRef.current;
    const next = new Map();
    const isInitial = !jobsInitializedRef.current;

    (jobs || []).forEach((job) => {
      if (!job?._id) return;
      next.set(job._id, job);
      if (isInitial) return;

      const prevJob = previous.get(job._id);
      const jobLabel = job.serviceType || "Job";
      const pickupLabel = job.pickupAddress || job.customerAddress || "Unknown pickup";

      if (!prevJob) {
        publish({
          title: "New job created",
          body: `${jobLabel} at ${pickupLabel}`,
          severity: "info",
          meta: {
            role: "admin",
            jobId: job._id,
            kind: "job",
            route: "/jobs",
          },
          dedupeKey: `admin:job:new:${job._id}`,
        });
        recordAuditEvent({
          title: "Job created",
          message: `${jobLabel} created for ${pickupLabel}.`,
          type: "info",
          meta: { jobId: job._id },
        });
        return;
      }

      if (prevJob.status !== job.status) {
        publish({
          title: "Job status update",
          body: `${jobLabel} is now ${job.status}.`,
          severity: job.status === "Completed" ? "success" : "info",
          meta: {
            role: "admin",
            jobId: job._id,
            kind: "job",
            status: job.status,
            route: "/jobs",
          },
          dedupeKey: `admin:job:${job._id}:status:${job.status}`,
        });
        recordAuditEvent({
          title: "Job status changed",
          message: `${jobLabel} moved to ${job.status}.`,
          type: job.status === "Completed" ? "success" : "info",
          meta: { jobId: job._id, status: job.status },
        });
      }

      if (prevJob.vendorId !== job.vendorId) {
        const assigned = job.vendorName || "Vendor assigned";
        const hasVendor = Boolean(job.vendorId);
        publish({
          title: hasVendor ? "Vendor assigned" : "Vendor unassigned",
          body: hasVendor
            ? `${assigned} accepted ${jobLabel}.`
            : `${jobLabel} returned to pool.`,
          severity: hasVendor ? "success" : "warning",
          meta: {
            role: "admin",
            jobId: job._id,
            kind: "job",
            vendorId: job.vendorId || null,
            route: "/jobs",
          },
          dedupeKey: `admin:job:${job._id}:vendor:${job.vendorId || "none"}`,
        });
        recordAuditEvent({
          title: hasVendor ? "Vendor assigned" : "Vendor unassigned",
          message: hasVendor
            ? `${assigned} assigned to ${jobLabel}.`
            : `${jobLabel} unassigned from vendor.`,
          type: hasVendor ? "success" : "warning",
          meta: { jobId: job._id, vendorId: job.vendorId || null },
        });
      }
    });

    if (!isInitial) {
      previous.forEach((prevJob, jobId) => {
        if (!next.has(jobId)) {
          publish({
            title: "Job removed",
            body: `${prevJob.serviceType || "Job"} was removed from the board.`,
            severity: "info",
            meta: {
              role: "admin",
              jobId,
              kind: "job",
              route: "/jobs",
            },
            dedupeKey: `admin:job:${jobId}:removed`,
          });
          recordAuditEvent({
            title: "Job removed",
            message: `${prevJob.serviceType || "Job"} removed from overview.`,
            type: "info",
            meta: { jobId },
          });
        }
      });
    }

    jobSnapshotRef.current = next;
    if (!jobsInitializedRef.current && (jobs || []).length > 0) {
      jobsInitializedRef.current = true;
    }
  }, [jobs, publish]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") {
        if (linksOpen) setLinksOpen(false);
        if (createOpen) setCreateOpen(false);
      }
    };
    if (linksOpen || createOpen) {
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
    return undefined;
  }, [linksOpen, createOpen]);

  const onUpdateJob = async (id, patch) => {
    try {
      const { data } = await api.patch(`/api/jobs/${id}`, patch);
      setJobs((prev) => prev.map((j) => (j._id === id ? data : j)));
      setBanner("");
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        (e?.response?.status === 409
          ? "Update blocked"
          : "Failed to update job");
      const reasons = e?.response?.data?.reasons;
      withBanner(reasons?.length ? `${msg}: ${reasons.join(", ")}` : msg);
    }
  };

  const counts = useMemo(() => {
    const c = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    (jobs || []).forEach((j) => (c[j.status] = (c[j.status] || 0) + 1));
    return c;
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (jobs || []).filter((j) => {
      const stOk = statusFilter === "all" || j.status === statusFilter;
      if (!stOk) return false;
      if (!q) return true;
      const hay = [
        j.serviceType,
        j.pickupAddress,
        j.dropoffAddress,
        j.notes,
        j.status,
        j.vendorName,
        j.vendorPhone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [jobs, query, statusFilter]);

  const exportCsv = () => {
    const base = api.defaults?.baseURL || "";
    const from = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const to = new Date().toISOString().slice(0, 10);
    const url = `${base}/api/exports/jobs.csv?from=${from}&to=${to}${
      statusFilter === "all"
        ? ""
        : `&status=${encodeURIComponent(statusFilter)}`
    }`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const copySelfServeLink = async () => {
    const origin =
      (typeof window !== "undefined" && window.location?.origin) ||
      "https://serviceops.app";
    const link = `${origin.replace(/\/$/, "")}/customer/login`;
    await copy(link, "Customer portal link");
  };

  const handleJobCreated = async () => {
    await load();
    withToast("Job created");
    setCreateOpen(false);
  };

  const onOpenBidding = async (jobId) => {
    try {
      const { data } = await api.post(`/api/jobs/${jobId}/open-bidding`);
      await load();
      setLinks({
        statusUrl: data.statusUrl,
        vendorLink: data.vendorLink,
        customerLink: data.customerLink,
      });
      setLinksOpen(true);
      withToast("Bidding opened");
    } catch (e) {
      withBanner(e?.response?.data?.message || "Failed to open bidding", 3000);
    }
  };

  const onShowLinks = async (job) => {
    try {
      const { data } = await api.get(`/api/jobs/${job._id}/links`);
      setLinks({
        statusUrl: data.statusUrl,
        vendorLink: data.vendorLink,
        customerLink: data.customerLink,
      });
      setLinksOpen(true);
    } catch (e) {
      withBanner(e?.response?.data?.message || "Links not available", 3000);
    }
  };

  const handleViewJob = useCallback(
    (job) => {
      if (!job?._id) return;
      navigate(`/jobs/${job._id}`);
    },
    [navigate]
  );

  return (
    <div className="admin-jobs-container" aria-busy={loading}>
      {banner && (
        <div className="admin-jobs-alert admin-jobs-alert-error" role="alert">
          {banner}
        </div>
      )}
      {toast && (
        <div className="admin-jobs-toast admin-jobs-toast-success">{toast}</div>
      )}

      {/* Board */}
      <section className="admin-jobs-board-section">
        <div className="admin-jobs-card admin-jobs-board-card">
          <div className="admin-jobs-board-header">
            <div className="admin-jobs-board-heading">
              <h2>Jobs table</h2>
              {last && (
                <span className="admin-jobs-board-updated admin-jobs-muted admin-jobs-small">
                  Updated {last.toLocaleTimeString()}
                </span>
              )}
            </div>
            <div className="admin-jobs-board-controls">
              <button
                type="button"
                className="admin-jobs-btn admin-jobs-btn-primary admin-jobs-create-btn"
                onClick={openCreateModal}
              >
                Create job
              </button>

              <div className="admin-jobs-filters">
                <div className="admin-jobs-search-container">
                  <input
                    className="admin-jobs-search"
                    placeholder="Search jobs..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Search jobs"
                  />
                </div>

                <div className="admin-jobs-select-container">
                  <select
                    className="admin-jobs-status-select"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    aria-label="Filter by status"
                  >
                    <option value="all">All statuses</option>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="admin-jobs-toggle">
                  <input
                    type="checkbox"
                    checked={soloMode}
                    onChange={(e) => setSoloMode(e.target.checked)}
                  />
                  <span className="admin-jobs-toggle-slider"></span>
                  <span className="admin-jobs-toggle-text">Solo mode</span>
                </label>

                <button
                  type="button"
                  className="admin-jobs-btn admin-jobs-btn-ghost admin-jobs-refresh-btn"
                  onClick={load}
                  disabled={loading}
                >
                  <span
                    className={`admin-jobs-btn-icon ${
                      loading ? "admin-jobs-refresh-spinner" : ""
                    }`}
                  >
                    {loading ? "" : ""}
                  </span>
                  <span className="admin-jobs-btn-text">
                    {loading ? "Refreshing..." : "Refresh"}
                  </span>
                </button>

                <div className="admin-jobs-dropdown-container">
                  <button
                    type="button"
                    className="admin-jobs-btn admin-jobs-dropdown-btn"
                  >
                    <span className="admin-jobs-btn-text">Export</span>
                    <span className="admin-jobs-dropdown-arrow">v</span>
                  </button>
                  <div className="admin-jobs-dropdown-menu">
                    <button
                      type="button"
                      className="admin-jobs-dropdown-item"
                      onClick={exportCsv}
                    >
                      Export CSV
                    </button>
                    <button
                      type="button"
                      className="admin-jobs-dropdown-item"
                      onClick={copySelfServeLink}
                    >
                      Copy customer login link
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="admin-jobs-board-chips">
            <div className="admin-jobs-chips-scroller">
              <div className="admin-jobs-chips">
                {["all", ...STATUSES].map((s) => (
                  <button
                    key={s}
                    className={`admin-jobs-chip ${
                      statusFilter === s ? "admin-jobs-chip-active" : ""
                    } ${
                      s === "Completed"
                        ? "admin-jobs-chip-green"
                        : s === "Unassigned"
                        ? "admin-jobs-chip-gray"
                        : ""
                    }`}
                    onClick={() => setStatusFilter(s)}
                    type="button"
                  >
                    <span className="admin-jobs-chip-label">
                      {s === "all" ? "All" : s}
                    </span>
                    <span className="admin-jobs-count">
                      {s === "all" ? jobs.length : counts[s] || 0}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="admin-jobs-board-body">
            <div className="admin-jobs-scroll-x">
              <JobTable
                jobs={filteredJobs}
                onUpdateJob={onUpdateJob}
                soloMode={soloMode}
                onOpenBidding={onOpenBidding}
                onShowLinks={onShowLinks}
                onViewJob={handleViewJob}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Create job modal */}
      {createOpen && (
        <div className="admin-jobs-modal-overlay" onClick={closeCreateModal}>
          <div
            className="admin-jobs-modal-content admin-jobs-create-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="admin-jobs-modal-header">
              <h3>New job</h3>
              <button
                className="admin-jobs-modal-close"
                onClick={closeCreateModal}
                aria-label="Close"
              >
                x
              </button>
            </div>
            <div className="admin-jobs-modal-body">
              <JobCreate onCreated={handleJobCreated} />
            </div>
          </div>
        </div>
      )}

      {/* Links drawer */}
      {linksOpen && links && (
        <div
          className="admin-jobs-modal-overlay"
          onClick={() => setLinksOpen(false)}
        >
          <div
            className="admin-jobs-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-jobs-modal-header">
              <h3>Bidding Links</h3>
              <button
                className="admin-jobs-modal-close"
                onClick={() => setLinksOpen(false)}
                aria-label="Close"
              >
                x
              </button>
            </div>
            <div className="admin-jobs-modal-body">
              <ul className="admin-jobs-url-list">
                {links.statusUrl && (
                  <li className="admin-jobs-url-row">
                    <label>Status Link</label>
                    <div className="admin-jobs-input-group">
                      <input
                        type="text"
                        readOnly
                        value={links.statusUrl}
                        onFocus={(e) => e.target.select()}
                      />
                      <button
                        className="admin-jobs-btn admin-jobs-btn-tiny admin-jobs-copy-btn"
                        onClick={() => copy(links.statusUrl, "Status link")}
                      >
                        Copy
                      </button>
                    </div>
                  </li>
                )}
                {links.vendorLink && (
                  <li className="admin-jobs-url-row">
                    <label>Vendor Bid Link</label>
                    <div className="admin-jobs-input-group">
                      <input
                        type="text"
                        readOnly
                        value={links.vendorLink}
                        onFocus={(e) => e.target.select()}
                      />
                      <button
                        className="admin-jobs-btn admin-jobs-btn-tiny admin-jobs-copy-btn"
                        onClick={() => copy(links.vendorLink, "Vendor link")}
                      >
                        Copy
                      </button>
                    </div>
                  </li>
                )}
                {links.customerLink && (
                  <li className="admin-jobs-url-row">
                    <label>Customer Selection Link</label>
                    <div className="admin-jobs-input-group">
                      <input
                        type="text"
                        readOnly
                        value={links.customerLink}
                        onFocus={(e) => e.target.select()}
                      />
                      <button
                        className="admin-jobs-btn admin-jobs-btn-tiny admin-jobs-copy-btn"
                        onClick={() =>
                          copy(links.customerLink, "Customer link")
                        }
                      >
                        Copy
                      </button>
                    </div>
                  </li>
                )}
              </ul>
            </div>
            <div className="admin-jobs-modal-footer">
              <button
                className="admin-jobs-btn admin-jobs-btn-ghost"
                onClick={() => setLinksOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
