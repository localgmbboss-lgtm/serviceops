import { useState } from "react";
import { api } from "../../lib/api";
import "./styles.css";

export default function ReviewFunnel({ jobId }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    try {
      setErr("");
      await api.post("/api/feedback", { jobId, rating, comment });
      setDone(true);
    } catch (e) {
      setErr(e?.response?.data?.message || "Could not submit feedback");
    }
  };

  if (done) {
    return (
      <div className="rf card">
        <p className="rf-thanks">
          {rating >= 5
            ? "Thanks! We may feature this review on our public routes."
            : "Thanks for the feedback — we’ve saved it privately."}
        </p>
      </div>
    );
  }

  return (
    <div className="rf card">
      <div className="rf-stars" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            className={`rf-star ${n <= rating ? "on" : ""}`}
            onClick={() => setRating(n)}
            aria-pressed={n === rating}
            type="button"
          >
            ★
          </button>
        ))}
        <span className="rf-score">{rating}/5</span>
      </div>

      <label className="rf-field">
        <span>Comments (optional)</span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Tell us about your experience"
        />
      </label>

      {err && <p className="rf-error">{err}</p>}

      <button className="rf-submit" onClick={submit}>
        Submit
      </button>
    </div>
  );
}
