import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import "./CustomerChoose.css";

export default function CustomerChoose() {
  const { token } = useParams();
  const [job, setJob] = useState(null);
  const [bids, setBids] = useState([]);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    try {
      const { data } = await api.get(`/api/bids/customer/${token}`);
      setJob(data.job);
      setBids(data.bids || []);
      setOpen(data.biddingOpen);
      setMsg("");
    } catch (e) {
      setMsg(e?.response?.data?.message || "Invalid or expired link");
    }
  };

  useEffect(() => {
    load(); /* poll for new bids */
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const select = async (bidId) => {
    try {
      await api.post(`/api/bids/customer/${token}/select`, { bidId });
      setMsg("✅ Bid selected! You’ll be contacted shortly.");
      setOpen(false);
      load();
    } catch (e) {
      setMsg(e?.response?.data?.message || "Failed to select bid");
    }
  };

  if (!job && !msg) return <p className="cc-wrap">Loading...</p>;
  return (
    <div className="cc-wrap">
      <div className="cc-card">
        <h1>Choose Your Tow</h1>
        {job && (
          <div className="cc-summary">
            <div>
              <strong>Service:</strong> {job.serviceType || "Service"}
            </div>
            <div>
              <strong>Pickup:</strong> {job.pickupAddress}
            </div>
            {job.dropoffAddress && (
              <div>
                <strong>Drop-off:</strong> {job.dropoffAddress}
              </div>
            )}
          </div>
        )}

        {open ? (
          <>
            {bids.length === 0 && <p className="muted">Waiting for bids...</p>}
            <ul className="cc-list">
              {bids.map((b) => (
                <li key={b._id} className="cc-item">
                  <div className="cc-main">
                    <strong>{b.vendorName}</strong>
                    <div className="muted small">{b.vendorPhone}</div>
                  </div>
                  <div className="cc-metrics">
                    <span className="chip">₦{Number(b.price).toFixed(0)}</span>
                    <span className="chip">{b.etaMinutes} min</span>
                  </div>
                  <div className="cc-actions">
                    <button className="btn" onClick={() => select(b._id)}>
                      Select
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="muted">
            Bidding is closed{" "}
            {job?.selectedBidId ? "— a bid was selected." : ""}
          </p>
        )}

        {msg && <p className="cc-msg">{msg}</p>}
      </div>
    </div>
  );
}
