import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import GMap from "../components/GMap";

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

const toCoords = (lat, lng) => {
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null;
  return { lat: latNum, lng: lngNum };
};

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
  const vendor = payload?.vendor;
  const nexts = useMemo(() => (job ? ALLOWED_NEXT[job.status] || [] : []), [job]);

  const pickupCoords = useMemo(() => toCoords(job?.pickupLat, job?.pickupLng), [job?.pickupLat, job?.pickupLng]);
  const dropoffCoords = useMemo(
    () => toCoords(job?.dropoffLat, job?.dropoffLng),
    [job?.dropoffLat, job?.dropoffLng]
  );
  const vendorCoords = useMemo(() => toCoords(vendor?.lat, vendor?.lng), [vendor?.lat, vendor?.lng]);
  const mapDrivers = useMemo(() => {
    if (!vendorCoords) return [];
    const initials = vendor?.name
      ? vendor.name
          .trim()
          .split(/\s+/)
          .map((part) => part[0])
          .filter(Boolean)
          .join("")
          .slice(0, 3)
          .toUpperCase()
      : "BASE";
    return [
      {
        lat: vendorCoords.lat,
        lng: vendorCoords.lng,
        label: initials || "BASE",
        title: vendor?.baseAddress || vendor?.name || "Vendor base",
        color: "#1f2937",
        textColor: "#ffffff",
      },
    ];
  }, [vendorCoords, vendor?.name, vendor?.baseAddress]);

  const mapDestination = useMemo(
    () =>
      pickupCoords
        ? {
            position: pickupCoords,
            role: "customer",
            title: job?.pickupAddress || "Pickup location",
            label: "Pickup",
          }
        : null,
    [pickupCoords, job?.pickupAddress]
  );

  const mapLandmarks = useMemo(() => {
    if (!dropoffCoords) return [];
    return [
      {
        position: dropoffCoords,
        label: "Drop",
        title: job?.dropoffAddress || "Drop-off",
        color: "#0ea5e9",
        textColor: "#0f172a",
      },
    ];
  }, [dropoffCoords, job?.dropoffAddress]);

  const mapCenter = useMemo(() => vendorCoords || pickupCoords || null, [vendorCoords, pickupCoords]);
  const canShowRoute = Boolean(vendorCoords && pickupCoords);

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

          <section className="vp-map">
            <h3 className="section-title">Route preview</h3>
            {pickupCoords || vendorCoords ? (
              <>
                <GMap
                  center={mapCenter || undefined}
                  drivers={vendorCoords ? mapDrivers : []}
                  destination={mapDestination}
                  landmarks={mapLandmarks}
                  showRoute={canShowRoute}
                />
                <div className="vp-map-legend">
                  {vendor?.baseAddress && (
                    <div className="vp-map-row">
                      <strong>Base</strong>
                      <span>{vendor.baseAddress}</span>
                    </div>
                  )}
                  {job.pickupAddress && (
                    <div className="vp-map-row">
                      <strong>Pickup</strong>
                      <span>{job.pickupAddress}</span>
                    </div>
                  )}
                  {job.dropoffAddress && (
                    <div className="vp-map-row">
                      <strong>Drop-off</strong>
                      <span>{job.dropoffAddress}</span>
                    </div>
                  )}
                </div>
                {!pickupCoords && (
                  <p className="muted small">
                    The pickup address is set, but we are waiting on precise GPS coordinates for routing.
                  </p>
                )}
                {!vendorCoords && (
                  <p className="muted small">
                    Add your base location in the vendor profile to unlock turn-by-turn directions.
                  </p>
                )}
              </>
            ) : (
              <p className="muted small">
                Waiting on precise pickup details. The map will appear as soon as the location is confirmed.
              </p>
            )}
          </section>

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








