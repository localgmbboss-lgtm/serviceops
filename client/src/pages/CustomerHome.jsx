import { useEffect, useState, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useNotifications } from "../contexts/NotificationsContext";
import "./CustomerHome.css";

export default function CustomerHome() {
  const [me, setMe] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const nav = useNavigate();
  const { logout } = useAuth();
  const { publish } = useNotifications();
  const jobsSnapshotRef = useRef(new Map());
  const jobsInitializedRef = useRef(false);
  const bidSnapshotRef = useRef(new Map());
  const bidsInitializedRef = useRef(false);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        setErr("");
        const meRes = await api.get("/api/customer/auth/me");
        if (!alive) return;

        const who =
          meRes.data?.customer ||
          meRes.data?.profile ||
          (meRes.data?._id ? meRes.data : null);

        if (!who?._id) throw new Error("Not signed in");
        setMe(who);

        const jobsRes = await api.get(
          `/api/customers/${who._id}/jobs?limit=50`
        );
        if (!alive) return;
        setJobs(Array.isArray(jobsRes.data) ? jobsRes.data : []);
      } catch (e) {
        setErr(
          e?.response?.data?.message ||
            e?.message ||
            "Failed to load your account"
        );
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    const t = setInterval(load, 12000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!Array.isArray(jobs)) {
      jobsSnapshotRef.current = new Map();
      return;
    }

    const previous = jobsSnapshotRef.current;
    const next = new Map();
    const isInitial = !jobsInitializedRef.current;

    jobs.forEach((job) => {
      if (!job?._id) {
        return;
      }
      next.set(job._id, job);
      const prevJob = previous.get(job._id);

      if (!prevJob) {
        if (!isInitial) {
          publish({
            title: job.serviceType
              ? `${job.serviceType} request logged`
              : "New service request",
            body: "We received your request and will keep you posted as providers respond.",
            severity: "info",
            meta: {
              role: "customer",
              jobId: job._id,
              kind: "job",
              status: job.status || "Unassigned",
              route: `/status/${job._id}`,
            },
            dedupeKey: `customer:job:${job._id}:created`,
            createdAt: job.createdAt || job.created || new Date().toISOString(),
          });
        }
        return;
      }

      if (prevJob.status !== job.status && job.status) {
        publish({
          title: `Your request is now ${job.status}`,
          body: job.serviceType
            ? `${job.serviceType} is marked as ${job.status}.`
            : `Status updated to ${job.status}.`,
          severity: job.status === "Completed" ? "success" : "info",
          meta: {
            role: "customer",
            jobId: job._id,
            kind: "status",
            status: job.status,
            route: `/status/${job._id}`,
          },
          dedupeKey: `customer:job:${job._id}:status:${job.status}`,
          createdAt:
            job.updatedAt || job.completedAt || new Date().toISOString(),
        });
      }
    });

    jobsSnapshotRef.current = next;
    if (!jobsInitializedRef.current && Array.isArray(jobs) && jobs.length > 0) {
      jobsInitializedRef.current = true;
    }
  }, [jobs, publish]);

  useEffect(() => {
    let cancelled = false;
    const activeJobs = (jobs || []).filter(
      (job) => job?.biddingOpen && job.customerToken && job._id
    );

    if (activeJobs.length === 0) {
      return () => {
        cancelled = true;
      };
    }

    const limited = activeJobs.slice(0, 5);

    const fetchBids = async () => {
      for (const job of limited) {
        try {
          const res = await api.get(`/api/bids/list/${job.customerToken}`);
          if (cancelled) {
            return;
          }
          const bids = Array.isArray(res.data?.bids) ? res.data.bids : [];
          const prev = bidSnapshotRef.current.get(job._id) || { ids: [] };
          const prevIds = new Set(prev.ids || []);
          const newBids = bids.filter((b) => !prevIds.has(String(b?._id)));

          if (bidsInitializedRef.current && newBids.length > 0) {
            newBids.forEach((bid) => {
              publish({
                title: "New bid received",
                body: `${bid.vendorName || "A vendor"} offered ${
                  Number.isFinite(bid.price)
                    ? Number(bid.price).toFixed(0)
                    : "--"
                } with an ETA of ${bid.etaMinutes || "--"} minutes.`,
                severity: "info",
                meta: {
                  role: "customer",
                  jobId: job._id,
                  kind: "bid",
                  customerToken: job.customerToken,
                  status: job.status || "Unassigned",
                  route: job.customerToken
                    ? `/choose/${job.customerToken}`
                    : `/status/${job._id}`,
                },
                dedupeKey: `customer:job:${job._id}:bid:${bid._id}`,
                createdAt: bid.createdAt || new Date().toISOString(),
              });
            });
          }

          bidSnapshotRef.current.set(job._id, {
            ids: bids.map((b) => String(b?._id)),
            count: bids.length,
          });
        } catch (e) {
          // Ignore bid polling errors
        }
      }
      if (!cancelled && !bidsInitializedRef.current) {
        bidsInitializedRef.current = true;
      }
    };

    fetchBids();

    return () => {
      cancelled = true;
    };
  }, [jobs, publish]);

  const grouped = useMemo(() => {
    const byStatus = { Active: [], Completed: [] };
    (jobs || []).forEach((j) =>
      (j.status === "Completed" ? byStatus.Completed : byStatus.Active).push(j)
    );
    return byStatus;
  }, [jobs]);

  const startNew = () => nav("/request");

  if (loading) {
    return (
      <div className="customer-home-container">
        <div className="customer-home-header loading">
          <div className="skeleton-avatar"></div>
          <div className="skeleton-text">
            <div className="skeleton-line medium"></div>
            <div className="skeleton-line short"></div>
          </div>
        </div>

        <div className="stats-grid loading">
          <div className="skeleton-stat"></div>
          <div className="skeleton-stat"></div>
        </div>

        <div className="tabs-container loading">
          <div className="skeleton-tab"></div>
          <div className="skeleton-tab"></div>
        </div>

        <div className="jobs-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="job-card loading">
              <div className="skeleton-header">
                <div className="skeleton-icon"></div>
                <div className="skeleton-badge"></div>
              </div>
              <div className="skeleton-content">
                <div className="skeleton-line"></div>
                <div className="skeleton-line short"></div>
              </div>
              <div className="skeleton-actions">
                <div className="skeleton-btn"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="customer-home-container">
        <div className="error-state">
          <div className="error-icon"></div>
          <h3>Oops! Something went wrong</h3>
          <p>{err}</p>
          <div className="error-actions">
            <button
              className="btn primary small"
              onClick={() => window.location.reload()}
            >
              Try Again
            </button>
            <button className="btn secondary small" onClick={logout}>
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="customer-home-container">
      {/* Header */}
      <header className="customer-home-header">
        <div className="user-info">
          <div className="user-avatar">
            {me?.name ? me.name.charAt(0).toUpperCase() : "U"}
          </div>
          <div className="user-details">
            <h1>Welcome{me?.name ? `, ${me.name}` : ""}</h1>
            <p className="user-email">{me?.email || "Ready to get help?"}</p>
          </div>
        </div>

        <button className="new-request-btn" onClick={startNew}>
          <span className="btn-icon">+</span>
          New Request
        </button>
      </header>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card active">
          <div className="stat-content">
            <span className="stat-number">{grouped.Active.length}</span>
            <span className="stat-label">Active Requests</span>
          </div>
          <div className="stat-icon"></div>
        </div>
        <div className="stat-card completed">
          <div className="stat-content">
            <span className="stat-number">{grouped.Completed.length}</span>
            <span className="stat-label">Completed</span>
          </div>
          <div className="stat-icon"></div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs-container">
        <button
          className={`tab ${activeTab === "active" ? "active" : ""}`}
          onClick={() => setActiveTab("active")}
        >
          <span className="tab-icon"></span>
          Active
          <span className="tab-badge">{grouped.Active.length}</span>
        </button>
        <button
          className={`tab ${activeTab === "history" ? "active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          <span className="tab-icon"></span>
          History
          <span className="tab-badge">{grouped.Completed.length}</span>
        </button>
      </div>

      {/* Content */}
      <div className="jobs-grid">
        {activeTab === "active" ? (
          grouped.Active.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"></div>
              <h3>No active requests</h3>
              <p>Ready to get started? Create your first service request</p>
              <button className="btn primary small" onClick={startNew}>
                Create Request
              </button>
            </div>
          ) : (
            grouped.Active.map((job) => <JobCard key={job._id} job={job} />)
          )
        ) : grouped.Completed.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"></div>
            <h3>No history yet</h3>
            <p>Your completed requests will appear here</p>
          </div>
        ) : (
          grouped.Completed.map((job) => (
            <JobCard key={job._id} job={job} isCompleted={true} />
          ))
        )}
      </div>
    </div>
  );
}

// Job Card Component
function JobCard({ job, isCompleted = false }) {
  const statusConfig = {
    Unassigned: { color: "#FF9500", bg: "#FFF4E6", icon: "" },
    Assigned: { color: "#007AFF", bg: "#E6F2FF", icon: "" },
    OnTheWay: { color: "#5856D6", bg: "#F0F0FF", icon: "" },
    Arrived: { color: "#AF52DE", bg: "#F6F0FF", icon: "" },
    Completed: { color: "#34C759", bg: "#E6F7ED", icon: "" },
  };

  const status = statusConfig[job.status] || statusConfig.Unassigned;

  return (
    <div className="job-card">
      <div className="job-header">
        <div className="service-info">
          <span className="service-icon"></span>
          <h3>{job.serviceType || "Service Request"}</h3>
        </div>
        <div
          className="status-badge"
          style={{
            backgroundColor: status.bg,
            color: status.color,
          }}
        >
          <span className="status-icon">{status.icon}</span>
          {job.status}
        </div>
      </div>

      <div className="job-content">
        <div className="detail-item">
          <span className="detail-icon"></span>
          <span className="detail-text">{job.pickupAddress}</span>
        </div>
        {job.dropoffAddress && (
          <div className="detail-item">
            <span className="detail-icon"></span>
            <span className="detail-text">{job.dropoffAddress}</span>
          </div>
        )}
        {job.createdAt && (
          <div className="detail-item">
            <span className="detail-icon"></span>
            <span className="detail-text">
              {new Date(job.createdAt).toLocaleDateString()}
            </span>
          </div>
        )}
      </div>

      <div className="job-actions">
        {job.biddingOpen && job.customerToken && !isCompleted ? (
          <Link
            to={`/choose/${job.customerToken}`}
            className="btn primary small"
          >
            <span className="action-icon"></span>
            View Bids
          </Link>
        ) : (
          <Link
            to={`/status/${job._id}`}
            className={`btn ${isCompleted ? "secondary" : "primary"} small`}
          >
            <span className="action-icon">{isCompleted ? "" : ""}</span>
            {isCompleted ? "Details" : "Track"}
          </Link>
        )}
      </div>
    </div>
  );
}
