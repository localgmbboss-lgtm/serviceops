import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";

const ALLOWED_NEXT = {
  Unassigned: ["Assigned"],
  Assigned: ["OnTheWay"],
  OnTheWay: ["Arrived"],
  Arrived: [],
  Completed: [],
};

const PAYMENT_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "zelle", label: "Zelle" },
  { value: "venmo", label: "Venmo" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "other", label: "Other" },
];

const methodLabel = (value) =>
  PAYMENT_OPTIONS.find((opt) => opt.value === value)?.label || "-";

const formatCurrency = (value) => {
  if (value == null) return "-";
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(num);
};

export default function VendorPortal() {
  const { token } = useParams();
  const [payload, setPayload] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completeBusy, setCompleteBusy] = useState(false);
  const [completeErr, setCompleteErr] = useState("");
  const [completeForm, setCompleteForm] = useState({
    amount: "",
    method: PAYMENT_OPTIONS[0].value,
    note: "",
  });

  const load = useCallback(async () => {
    if (!token) {
      setErr("Invalid link");
      setPayload(null);
      return;
    }

    try {
      const res = await api.get(`/api/vendor/${encodeURIComponent(token)}`);
      setPayload(res.data);
      setErr("");
    } catch (error) {
      setErr(error?.response?.data?.message || "Not found");
    }
  }, [token]);

  useEffect(() => {
    load();
    if (!token) return undefined;
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [load, token]);

  const setStatus = async (status) => {
    try {
      setBusy(true);
      await api.patch(`/api/vendor/${encodeURIComponent(token)}/status`, {
        status,
      });
      await load();
    } catch (error) {
      alert(error?.response?.data?.message || "Failed to update status");
    } finally {
      setBusy(false);
    }
  };

  const submitCompletion = async (event) => {
    event.preventDefault();
    if (!token) return;
    setCompleteBusy(true);
    setCompleteErr("");

    const amountNumber = Number(completeForm.amount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setCompleteErr("Enter the total amount collected from the customer.");
      setCompleteBusy(false);
      return;
    }

    try {
      await api.post(`/api/vendor/${encodeURIComponent(token)}/complete`, {
        amount: amountNumber,
        method: completeForm.method,
        note: completeForm.note || undefined,
      });
      setCompleteOpen(false);
      setCompleteForm({ amount: "", method: PAYMENT_OPTIONS[0].value, note: "" });
      await load();
    } catch (error) {
      setCompleteErr(error?.response?.data?.message || "Failed to submit completion");
    } finally {
      setCompleteBusy(false);
    }
  };

  const job = payload?.job;
  const customer = payload?.customer;
  const nexts = useMemo(() => (job ? ALLOWED_NEXT[job.status] || [] : []), [job]);

  if (err)
    return (
      <div className="card">
        <p className="error">{err}</p>
      </div>
    );

  if (!job) {
    return <p>Loading...</p>;
  }

  const completionSummary = job.reportedPayment;
  const commission = job.commission;

  return (
    <div className="card vendor-portal">
      <h2>Accepted Job</h2>
      <div className="vp-grid">
        <div className="vp-primary">
          <dl className="vp-details">
            <div>
              <dt>Service</dt>
              <dd>{job.serviceType}</dd>
            </div>
            <div>
              <dt>Pickup</dt>
              <dd>{job.pickupAddress}</dd>
            </div>
            {job.dropoffAddress && (
              <div>
                <dt>Drop-off</dt>
                <dd>{job.dropoffAddress}</dd>
              </div>
            )}
            {customer && (
              <div>
                <dt>Customer</dt>
                <dd>
                  {customer.name} - {customer.phone}
                </dd>
              </div>
            )}
            <div>
              <dt>Status</dt>
              <dd>{job.status}</dd>
            </div>
          </dl>

          {job.status !== "Completed" && (
            <div className="vp-actions">
              <div className="vp-action-buttons">
                {nexts.includes("OnTheWay") && (
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() => setStatus("OnTheWay")}
                  >
                    On the way
                  </button>
                )}
                {nexts.includes("Arrived") && (
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() => setStatus("Arrived")}
                  >
                    Arrived
                  </button>
                )}
              </div>

              <div className="vp-complete">
                <button
                  className="btn primary"
                  disabled={completeBusy}
                  onClick={() => setCompleteOpen((prev) => !prev)}
                >
                  {completeOpen ? "Cancel" : "Report completion"}
                </button>
              </div>
            </div>
          )}

          {completeOpen && (
            <form className="vp-complete-form" onSubmit={submitCompletion}>
              <h3>Report payment received</h3>
              <label>
                <span>Total collected</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={completeForm.amount}
                  onChange={(e) =>
                    setCompleteForm((prev) => ({ ...prev, amount: e.target.value }))
                  }
                  required
                />
              </label>
              <label>
                <span>Payment method</span>
                <select
                  value={completeForm.method}
                  onChange={(e) =>
                    setCompleteForm((prev) => ({ ...prev, method: e.target.value }))
                  }
                >
                  {PAYMENT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Notes (optional)</span>
                <textarea
                  value={completeForm.note}
                  onChange={(e) =>
                    setCompleteForm((prev) => ({ ...prev, note: e.target.value }))
                  }
                  placeholder="Add any quick details (cash split, receipts, etc.)"
                  rows={3}
                />
              </label>
              {completeErr && <p className="error small">{completeErr}</p>}
              <button className="btn primary" type="submit" disabled={completeBusy}>
                {completeBusy ? "Submitting..." : "Submit completion"}
              </button>
            </form>
          )}
        </div>

        <aside className="vp-summary">
          <section className="vp-summary-card">
            <h3 className="section-title">Latest payment report</h3>
            {completionSummary ? (
              <ul className="vp-summary-list">
                <li>
                  <strong>Amount</strong>
                  <span>{formatCurrency(completionSummary.amount)}</span>
                </li>
                <li>
                  <strong>Method</strong>
                  <span>{methodLabel(completionSummary.method)}</span>
                </li>
                <li>
                  <strong>Reported</strong>
                  <span>
                    {completionSummary.reportedAt
                      ? new Date(completionSummary.reportedAt).toLocaleString()
                      : "-"}
                  </span>
                </li>
                {completionSummary.note && (
                  <li>
                    <strong>Notes</strong>
                    <span>{completionSummary.note}</span>
                  </li>
                )}
              </ul>
            ) : (
              <p className="muted small">No payment reported yet.</p>
            )}
          </section>

          <section className="vp-summary-card">
            <h3 className="section-title">Commission</h3>
            {commission ? (
              <ul className="vp-summary-list">
                <li>
                  <strong>Rate</strong>
                  <span>{Math.round((commission.rate || 0) * 100)}%</span>
                </li>
                <li>
                  <strong>Amount</strong>
                  <span>{formatCurrency(commission.amount)}</span>
                </li>
                <li>
                  <strong>Status</strong>
                  <span className={`vp-pill status-${commission.status || "pending"}`}>
                    {commission.status}
                  </span>
                </li>
                {commission.chargeId && (
                  <li>
                    <strong>Reference</strong>
                    <span>{commission.chargeId}</span>
                  </li>
                )}
                {commission.failureReason && (
                  <li>
                    <strong>Notice</strong>
                    <span className="warning-text">{commission.failureReason}</span>
                  </li>
                )}
              </ul>
            ) : (
              <p className="muted small">Commission will calculate when you report payment.</p>
            )}

            {job.flags?.underReport && (
              <p className="warning-text small">
                 Report flagged for review - {job.flags.reason}
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}


