import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import "./CustomerHome.css";

export default function CustomerHome() {
  const [me, setMe] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [activeTab, setActiveTab] = useState("active");
  const nav = useNavigate();
  const { logout } = useAuth();

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
          <div className="error-icon">⚡</div>
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
            <h1>Welcome back{me?.name ? `, ${me.name}` : ""}</h1>
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
          <div className="stat-icon">🔥</div>
        </div>
        <div className="stat-card completed">
          <div className="stat-content">
            <span className="stat-number">{grouped.Completed.length}</span>
            <span className="stat-label">Completed</span>
          </div>
          <div className="stat-icon">✅</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs-container">
        <button
          className={`tab ${activeTab === "active" ? "active" : ""}`}
          onClick={() => setActiveTab("active")}
        >
          <span className="tab-icon">⏳</span>
          Active
          <span className="tab-badge">{grouped.Active.length}</span>
        </button>
        <button
          className={`tab ${activeTab === "history" ? "active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          <span className="tab-icon">📊</span>
          History
          <span className="tab-badge">{grouped.Completed.length}</span>
        </button>
      </div>

      {/* Content */}
      <div className="jobs-grid">
        {activeTab === "active" ? (
          grouped.Active.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🚀</div>
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
            <div className="empty-icon">🏆</div>
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
    Unassigned: { color: "#FF9500", bg: "#FFF4E6", icon: "⏳" },
    Assigned: { color: "#007AFF", bg: "#E6F2FF", icon: "✅" },
    OnTheWay: { color: "#5856D6", bg: "#F0F0FF", icon: "🚗" },
    Arrived: { color: "#AF52DE", bg: "#F6F0FF", icon: "📍" },
    Completed: { color: "#34C759", bg: "#E6F7ED", icon: "🎉" },
  };

  const status = statusConfig[job.status] || statusConfig.Unassigned;

  return (
    <div className="job-card">
      <div className="job-header">
        <div className="service-info">
          <span className="service-icon">🔧</span>
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
          <span className="detail-icon">📌</span>
          <span className="detail-text">{job.pickupAddress}</span>
        </div>
        {job.dropoffAddress && (
          <div className="detail-item">
            <span className="detail-icon">🎯</span>
            <span className="detail-text">{job.dropoffAddress}</span>
          </div>
        )}
        {job.createdAt && (
          <div className="detail-item">
            <span className="detail-icon">📅</span>
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
            <span className="action-icon">💰</span>
            View Bids
          </Link>
        ) : (
          <Link
            to={`/status/${job._id}`}
            className={`btn ${isCompleted ? "secondary" : "primary"} small`}
          >
            <span className="action-icon">{isCompleted ? "👁️" : "📱"}</span>
            {isCompleted ? "Details" : "Track"}
          </Link>
        )}
      </div>
    </div>
  );
}

