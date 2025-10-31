import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../lib/api";
import { useNotifications } from "../contexts/NotificationsContext";
import { FaStar, FaStarHalfAlt, FaRegStar } from "react-icons/fa";
import { LuBriefcase, LuBuilding2, LuCalendarDays, LuEye, LuMapPin, LuShield, LuTag, LuUser } from "react-icons/lu";
import { useWorkflowFlag } from "../contexts/SettingsContext";
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
  const numericRating = Number(rating);
  const isValid = Number.isFinite(numericRating);
  const safeRating = isValid ? Math.min(Math.max(numericRating, 0), 5) : 0;
  const rounded = Math.round(safeRating * 2) / 2;
  const label = isValid ? `${safeRating.toFixed(safeRating % 1 === 0 ? 0 : 1)} out of 5` : "Not yet rated";

  return (
    <span className="rh-rating" aria-label={`Rating ${label}`}>
      {[1, 2, 3, 4, 5].map((index) => {
        const isFilled = rounded >= index;
        const isHalf = !isFilled && rounded >= index - 0.5;
        const Icon = isFilled ? FaStar : isHalf ? FaStarHalfAlt : FaRegStar;
        const state = isFilled ? "filled" : isHalf ? "half" : "empty";

        return (
          <span key={index} className={`rh-rating__star ${state}`} aria-hidden="true">
            <Icon className="rh-rating__icon" />
          </span>
        );
      })}
    </span>
  );
}


export default function ReviewHub() {
  const allowReviews = useWorkflowFlag("enableReviewFunnel", true);
  if (!allowReviews) {
    return <Navigate to="/admin" replace />;
  }
  return <ReviewHubContent />;
}

function ReviewHubContent() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("new");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [activeReply, setActiveReply] = useState({});
  const [expandedReviews, setExpandedReviews] = useState({});
  const [assistantReviewId, setAssistantReviewId] = useState(null);
  const [assistantGuidance, setAssistantGuidance] = useState("");
  const [assistantDraft, setAssistantDraft] = useState("");
  const [guidanceVisible, setGuidanceVisible] = useState(false);
  const [toast, setToast] = useState(null);
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
        return a.rating - b.rating;
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

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const buildSuggestedReply = (review) => {
    const name = review.customer?.name?.split(" ")[0] || "there";
    const jobLabel = review.job?.serviceType || "the job";
    const isPositive = (review.rating || 0) >= 4;
    const baseline = isPositive
      ? `Hi ${name}, thanks a ton for sharing this review! We're thrilled that ${jobLabel.toLowerCase()} went well.`
      : `Hi ${name}, thank you for letting us know about ${jobLabel.toLowerCase()}. We're already reviewing your feedback so we can improve right away.`;
    return `${baseline} Please let me know if there's anything else I can do for you right now.`;
  };

  const openAssistant = (review) => {
    setAssistantReviewId(review._id);
    setAssistantGuidance("");
    setAssistantDraft(buildSuggestedReply(review));
    setGuidanceVisible(false);
  };

  const closeAssistant = () => {
    setAssistantReviewId(null);
    setAssistantGuidance("");
    setAssistantDraft("");
    setGuidanceVisible(false);
  };

  const currentAssistantReview = useMemo(
    () => reviews.find((review) => review._id === assistantReviewId) || null,
    [assistantReviewId, reviews]
  );

  const handleGenerateDraft = () => {
    if (!currentAssistantReview) return;
    setAssistantDraft(buildSuggestedReply(currentAssistantReview));
  };

  const handleUseSuggestion = () => {
    if (!assistantReviewId || !assistantDraft.trim()) return;
    setActiveReply((prev) => ({ ...prev, [assistantReviewId]: assistantDraft }));
    setToast({ type: "success", message: "Draft inserted into reply box." });
  };

  const handleCopySuggestion = async () => {
    if (!assistantDraft.trim()) return;
    try {
      await navigator.clipboard.writeText(assistantDraft);
      setToast({ type: "success", message: "Draft copied to clipboard." });
    } catch (err) {
      setToast({ type: "error", message: "Unable to copy on this device." });
    }
  };

  return (
    <div className="rh">
      {toast && (
        <div className={`rh-toast rh-toast--${toast.type}`} role="status">
          <span>{toast.message}</span>
          <button
            type="button"
            className="rh-toast__close"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
          >
            {"\u00D7"}
          </button>
        </div>
      )}
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
          <p className="muted">Loading reviews...</p>
        ) : bySeverity.length === 0 ? (
          <p className="muted">No reviews match this filter.</p>
        ) : (
          bySeverity.map((review) => {
            const fullComment = review.comment || "No comment left";
            const summary =
              fullComment.length > 160 ? `${fullComment.slice(0, 160)}...` : fullComment;
            const isExpanded = !!expandedReviews[review._id];
            const numericRating = Number.isFinite(Number(review.rating)) ? Number(review.rating) : null;
            const ratingDisplay =
              numericRating === null ? "--" : numericRating.toFixed(numericRating % 1 === 0 ? 0 : 1);
            const statusLabel =
              STATUS_OPTIONS.find((option) => option.value === review.status)?.label ||
              review.status ||
              "Unknown";
            const createdAt = review.createdAt ? new Date(review.createdAt) : null;
            const formattedDate = createdAt
              ? createdAt.toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })
              : "Date unavailable";

            return (
              <article key={review._id} className={`rh-card${isExpanded ? " is-open" : ""}`}>
                <div className="rh-card__hero">
                  <div className="rh-card__hero-main">
                    <div className="rh-card__score">
                      <span className="rh-card__score-value">{ratingDisplay}</span>
                      <RatingStars rating={numericRating ?? 0} />
                      <span className="rh-card__score-label">Customer rating</span>
                    </div>
                    <div className="rh-card__title">
                      <h2>{summary}</h2>
                      <div className="rh-card__meta">
                        <span className="rh-card__meta-item">
                          <LuCalendarDays aria-hidden="true" />
                          {formattedDate}
                        </span>
                        <span className="rh-card__meta-item">
                          <LuShield aria-hidden="true" />
                          {statusLabel}
                        </span>
                        <span className={`rh-tag rh-tag--${review.visibility}`}>
                          <LuEye aria-hidden="true" />
                          {review.visibility}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`rh-card__toggle ${isExpanded ? "open" : ""}`}
                    onClick={() =>
                      setExpandedReviews((prev) => ({
                        ...prev,
                        [review._id]: !prev[review._id],
                      }))
                    }
                  >
                    {isExpanded ? "Hide details" : "View full thread"}
                  </button>
                </div>

                {isExpanded ? (
                  <div className="rh-card__body">
                    <p className="rh-comment-full">{fullComment}</p>
                    <div className="rh-card__sections">
                      <div className="rh-section">
                        <span className="rh-section__icon" aria-hidden="true">
                          <LuBriefcase />
                        </span>
                        <div>
                          <span className="rh-section__label">Job</span>
                          <strong>
                            {review.job
                              ? `${review.job.serviceType || "Service"} - ${review.job.status || "Unknown"}`
                              : "Unmatched job"}
                          </strong>
                          {review.job?.pickupAddress ? (
                            <span className="rh-section__muted">
                              <LuMapPin aria-hidden="true" />
                              {review.job.pickupAddress}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="rh-section">
                        <span className="rh-section__icon" aria-hidden="true">
                          <LuBuilding2 />
                        </span>
                        <div>
                          <span className="rh-section__label">Vendor</span>
                          <strong>{review.vendor ? review.vendor.name : "Not assigned"}</strong>
                          <span className="rh-section__muted">
                            <LuTag aria-hidden="true" />
                            {review.vendor?.category || "Category pending"}
                          </span>
                        </div>
                      </div>
                      <div className="rh-section">
                        <span className="rh-section__icon" aria-hidden="true">
                          <LuUser />
                        </span>
                        <div>
                          <span className="rh-section__label">Customer</span>
                          <strong>{review.customer ? review.customer.name : "Anonymous"}</strong>
                          <span className="rh-section__muted">
                            <LuMapPin aria-hidden="true" />
                            {review.customer?.city || "Location unknown"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="rh-card__controls">
                      <label className="rh-control">
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
                      <label className="rh-control">
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

                    <div className="rh-card__reply">
                      <div className="rh-reply__input">
                        <textarea
                          rows={4}
                          placeholder="Draft a public response or internal note..."
                          value={activeReply[review._id] || ""}
                          onChange={(event) =>
                            setActiveReply((prev) => ({ ...prev, [review._id]: event.target.value }))
                          }
                        />
                        <button
                          type="button"
                          className={`rh-ai-trigger${assistantReviewId === review._id ? " is-active" : ""}`}
                          onClick={() => openAssistant(review)}
                          aria-label="Open AI response assistant"
                          aria-expanded={assistantReviewId === review._id}
                        >
                          <span aria-hidden="true">AI</span>
                        </button>
                      </div>
                      <button
                        type="button"
                        className="rh-card__respond"
                        onClick={() => submitResponse(review._id)}
                      >
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
                                {new Date(entry.at).toLocaleString()} - {entry.actor} ({entry.channel})
                              </span>
                              <p>{entry.body}</p>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </div>

      {assistantReviewId && currentAssistantReview ? (
        <div className="rh-ai-overlay" role="dialog" aria-modal="true">
          <div className="rh-ai-panel">
            <div className="rh-ai-panel__head">
              <span className="rh-ai-panel__icon" aria-hidden="true">
                AI
              </span>
              <strong>AI response assistant</strong>
              <button
                type="button"
                className="rh-ai-panel__close"
                onClick={closeAssistant}
                aria-label="Close AI assistant"
              >
                {"\u00D7"}
              </button>
            </div>
            {currentAssistantReview ? (
              <div className="rh-ai-panel__context">
                <RatingStars rating={currentAssistantReview.rating} />
                <p className="rh-comment-full">{currentAssistantReview.comment || "No comment left"}</p>
              </div>
            ) : null}
            <button
              type="button"
              className="rh-ai-panel__note-toggle"
              onClick={() => setGuidanceVisible((open) => !open)}
            >
              {guidanceVisible ? "Hide personal note" : "Add personal note (not added to reply)"}
            </button>
            {guidanceVisible ? (
              <label className="rh-ai-panel__field">
                <span>Personal note</span>
                <textarea
                  rows={3}
                  value={assistantGuidance}
                  onChange={(event) => setAssistantGuidance(event.target.value)}
                  placeholder="Remind yourself about tone or key points."
                />
              </label>
            ) : null}
            <div className="rh-ai-panel__actions">
              <button type="button" onClick={handleGenerateDraft}>
                Generate draft
              </button>
              <button type="button" onClick={handleUseSuggestion} disabled={!assistantDraft.trim()}>
                Use in reply
              </button>
              <button type="button" onClick={handleCopySuggestion} disabled={!assistantDraft.trim()}>
                Copy text
              </button>
            </div>
            <div className="rh-ai-panel__draft">
              {assistantDraft || "Tap \"Generate draft\" to produce a suggestion."}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
