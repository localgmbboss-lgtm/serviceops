import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import "./CustomerBids.css";

export default function CustomerBids() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [selecting, setSelecting] = useState("");

  const load = async () => {
    try {
      const r = await api.get(`/api/public/customer/${token}/bids`);
      setData(r.data);
      setErr("");
    } catch (e) {
      setErr(e?.response?.data?.message || "Link invalid");
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [token]);

  const selectBid = async (bidId) => {
    try {
      setSelecting(bidId);
      await api.post(`/api/public/customer/${token}/select`, { bidId });
      await load();
    } catch (e) {
      setErr(e?.response?.data?.message || "Failed to select bid");
    } finally {
      setSelecting("");
    }
  };

  if (err)
    return (
      <div className="container">
        <div className="card">
          <p className="error">{err}</p>
        </div>
      </div>
    );
  if (!data)
    return (
      <div className="container">
        <p>Loading...</p>
      </div>
    );

  return (
    <div className="container custbids">
      <div className="card">
        <h2>Choose Your Tow</h2>
        <p>
          <strong>Service:</strong> {data.job.serviceType || "Tow"}
        </p>
        <p>
          <strong>Pickup Area:</strong> {data.job.pickupHint}
        </p>
        {data.job.dropoffHint && (
          <p>
            <strong>Drop-off:</strong> {data.job.dropoffHint}
          </p>
        )}
      </div>

      <div className="card">
        <h3>Bids</h3>
        {data.bids.length === 0 && <p className="muted">Waiting for bids...</p>}
        <ul className="bidlist">
          {data.bids.map((b) => (
            <li
              key={b._id}
              className={
                "bid " + (data.selectedBidId === b._id ? "selected" : "")
              }
            >
              <div className="left">
                <div className="name">{b.label}</div>
                <div className="muted small">ETA {b.etaMinutes} min</div>
              </div>
              <div className="right">
                <div className="price">${Number(b.price).toFixed(0)}</div>
                {data.selectedBidId === b._id ? (
                  <span className="chip ok">Selected</span>
                ) : (
                  <button
                    disabled={!!data.selectedBidId || selecting === b._id}
                    onClick={() => selectBid(b._id)}
                  >
                    {selecting === b._id ? "Selecting..." : "Select"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        {data.selectedBidId && (
          <p className="muted small">
            We'll notify the selected operator. You'll receive ETA & contact
            next.
          </p>
        )}
      </div>
    </div>
  );
}

