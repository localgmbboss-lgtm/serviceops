import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useNotifications } from "../contexts/NotificationsContext";
import "./ReviewHub.css";

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "triage", label: "Triage" },
  { value: "responding", label: "Responding" },
  { value: "resolved", label: "Resolved" },
  { value: "archived", label: "Archived" },
];

const VISIBILITY_OPTIONS = [
  { value: "public", label: "Public" },
  { value: "private", label: "Private" },
];

function RatingStars({ rating }) {
  const rounded = Math.round((rating || 0) * 2) / 2;
  return (
    <span className="rh-rating">
      {[1, 2, 3, 4, 5].map((index) => (
        <span key={index} className={rounded >= index ? "filled" : rounded >= index - 0.5 ? "half" : ""}>
          ★
        </span>
      ))}
    </span>
  );
}

export default function ReviewHub() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("new");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [activeReply, setActiveReply] = useState({});
  const { publish } = useNotifications();

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const params = {};
      if (statusFilter !== "all") params.status = statusFilter;
      if (visibilityFilter !== "all") params.visibility = visibilityFilter;
      const { data } = await api.get("/api/crm/reviews", { params });
      setReviews(data?.results || []);
      setError("");
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load reviews");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, visibilityFilter]);

  const bySeverity = useMemo(
    () =>
      [...reviews].sort((a, b) => {
        if (a.rating === b.rating) {
          return new Date(b.createdAt) - new Date(a.createdAt);
        }
        return a.rating - b.rating; // lowest rating first
      }),
    [reviews]
  );

  const updateReview = async (reviewId, payload, message) => {
    try {
      await api.patch(`/api/crm/reviews/${reviewId}`, payload);
      if (message) {
        publish({ title: "Review updated", body: message, severity: "info" });
      }
      fetchReviews();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to update review");
    }
  };

  const submitResponse = async (reviewId) => {
    const text = activeReply[reviewId];
    if (!text || !text.trim()) return;
    try {
      await api.post(`/api/crm/reviews/${reviewId}/respond`, {
        body: text,
        channel: "public",
      });
      publish({
        title: "Reply sent",
        body: "Public response posted.",
        severity: "success",
      });
      setActiveReply((prev) => ({ ...prev, [reviewId]: "" }));
      fetchReviews();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to respond");
    }
  };

  return (
    <div className="rh">
      <header className="rh-header">
        <div>
          <h1>Review Hub</h1>
          <p>Centralize public and private feedback, assign follow ups, and publish responses.</p>
        </div>
        <div className="rh-filters">
          <label>
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Visibility</span>
            <select
              value={visibilityFilter}
              onChange={(event) => setVisibilityFilter(event.target.value)}
            >
              <option value="all">All</option>
              {VISIBILITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {error ? <div className="rh-error">{error}</div> : null}

      <div className="rh-list">
        {loading ? (
          <p className="muted">Loading reviews…</p>
        ) : bySeverity.length === 0 ? (
          <p className="muted">No reviews match this filter.</p>
        ) : (
          bySeverity.map((review) => (
            <article key={review._id} className="rh-card">
              <header>
                <div>
                  <RatingStars rating={review.rating} />
                  <h2>{review.comment || "No comment left"}</h2>
                </div>
                <div className="rh-card__meta">
                  <span>{new Date(review.createdAt).toLocaleString()}</span>
                  <span className={`rh-tag rh-tag--${review.visibility}`}>
                    {review.visibility}
                  </span>
                </div>
              </header>
              <div className="rh-card__grid">
                <div>
                  <span className="rh-label">Job</span>
                  <strong>
                    {review.job
                      ? `${review.job.serviceType || "Service"} • ${review.job.status}`
                      : "Unknown job"}
                  </strong>
                  {review.job?.pickupAddress ? (
                    <p className="muted">{review.job.pickupAddress}</p>
                  ) : null}
                </div>
                <div>
                  <span className="rh-label">Vendor</span>
                  <p>{review.vendor ? review.vendor.name : "—"}</p>
                </div>
                <div>
                  <span className="rh-label">Customer</span>
                  <p>{review.customer ? review.customer.name : "—"}</p>
                </div>
              </div>
              <div className="rh-card__status">
                <label>
                  <span>Status</span>
                  <select
                    value={review.status}
                    onChange={(event) =>
                      updateReview(
                        review._id,
                        { status: event.target.value },
                        "Status updated"
                      )
                    }
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Visibility</span>
                  <select
                    value={review.visibility}
                    onChange={(event) =>
                      updateReview(
                        review._id,
                        { visibility: event.target.value },
                        "Visibility updated"
                      )
                    }
                  >
                    {VISIBILITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="rh-reply">
                <textarea
                  rows={2}
                  placeholder="Craft a public reply or internal note..."
                  value={activeReply[review._id] || ""}
                  onChange={(event) =>
                    setActiveReply((prev) => ({ ...prev, [review._id]: event.target.value }))
                  }
                />
                <button type="button" className="btn secondary" onClick={() => submitResponse(review._id)}>
                  Respond
                </button>
              </div>
              {Array.isArray(review.responseLog) && review.responseLog.length > 0 ? (
                <details className="rh-history">
                  <summary>Response history ({review.responseLog.length})</summary>
                  <ul>
                    {review.responseLog.map((entry, index) => (
                      <li key={`${review._id}-${index}`}>
                        <span className="rh-history__meta">
                          {new Date(entry.at).toLocaleString()} — {entry.actor} ({entry.channel})
                        </span>
                        <p>{entry.body}</p>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </article>
          ))
        )}
      </div>
    </div>
  );
}
