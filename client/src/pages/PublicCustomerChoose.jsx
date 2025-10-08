import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import "./PublicCustomerChoose.css";

export default function PublicCustomerChoose() {
  //  read the correct route param
  const { customerToken } = useParams();
  const nav = useNavigate();

  const [bids, setBids] = useState([]);
  const [jobId, setJobId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [selecting, setSelecting] = useState(null); // bidId being selected
  const [tick, setTick] = useState(5); // countdown to next auto-refresh

  const timerRef = useRef(null);
  const pollRef = useRef(null);

  const load = async () => {
    if (!customerToken) return;
    try {
      setErr("");
      const { data } = await api.get(`/api/bids/list/${customerToken}`);
      setBids(data.bids || []);
      setJobId(data.jobId || null);
    } catch (e) {
      setErr(e?.response?.data?.message || "Invalid or expired link");
    } finally {
      setLoading(false);
      setTick(5);
    }
  };

  useEffect(() => {
    setLoading(true);
    load();
    // 5s polling + 1s countdown display
    pollRef.current = setInterval(load, 5000);
    timerRef.current = setInterval(
      () => setTick((t) => (t > 0 ? t - 1 : 0)),
      1000
    );
    return () => {
      clearInterval(pollRef.current);
      clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerToken]);

  const onRefreshNow = () => load();

  const selectBid = async (id) => {
    try {
      setSelecting(id);
      const { data } = await api.post(`/api/bids/${id}/select`);
      if (data?.statusUrl) {
        window.location.assign(data.statusUrl);
        return;
      }
      const resolvedJobId = data?.jobId || jobId;
      if (resolvedJobId) {
        nav(`/status/${resolvedJobId}`);
        return;
      }
      nav("/customer/login");
    } catch (e) {
      setErr(
        e?.response?.data?.message || e?.message || "Failed to select bid"
      );
      setSelecting(null);
    }
  };

  // Sort by price (asc), then ETA (asc) - nicer for customers
  const sortedBids = useMemo(() => {
    return [...bids].sort((a, b) => {
      const priceCmp = (a.price ?? 0) - (b.price ?? 0);
      return priceCmp !== 0
        ? priceCmp
        : (a.etaMinutes ?? 0) - (b.etaMinutes ?? 0);
    });
  }, [bids]);

  if (loading) {
    return (
      <div className="choose container">
        <div className="card">
          <h2>Choose Your Driver</h2>
          <div className="skeleton-list">
            <div className="skeleton-card" />
            <div className="skeleton-card" />
            <div className="skeleton-card" />
          </div>
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="choose container">
        <div className="card">
          <h2>Choose Your Driver</h2>
          <div className="alert error">{err}</div>
          <div className="row">
            <button className="btn" onClick={onRefreshNow}>
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="choose container">
      <div className="card">
        <div className="head">
          <h2 className="title">Choose Your Driver</h2>
          <div className="refresh">
            <button className="btn ghost tiny" onClick={onRefreshNow}>
              Refresh
            </button>
            <span className="muted tiny">Auto in {tick}s</span>
          </div>
        </div>

        {sortedBids.length === 0 ? (
          <div className="empty">
            <p className="muted">
              Waiting for bids... we've notified nearby vendors. This page updates
              automatically.
            </p>
          </div>
        ) : (
          <ul className="bids">
            {sortedBids.map((b, i) => (
              <li key={b._id} className="bid">
                <div className="bid-main">
                  <div className="vendor">
                    <span className="vendor-name">{b.vendorName}</span>
                    {i === 0 && <span className="chip best">Best value</span>}
                  </div>
                  <div className="meta">
                    <span className="price">${Number(b.price).toFixed(2)}</span>
                    <span className="dot">*</span>
                    <span className="eta">ETA {b.etaMinutes} min</span>
                  </div>
                </div>
                <div className="bid-actions">
                  <button
                    className="btn"
                    onClick={() => selectBid(b._id)}
                    disabled={!!selecting}
                  >
                    {selecting === b._id ? "Selecting..." : "Select"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="foot">
          <p className="muted tiny">
            Prices and ETAs are provided by vendors. Selecting a bid assigns
            your job to that driver.
          </p>
        </div>
      </div>
    </div>
  );
}



