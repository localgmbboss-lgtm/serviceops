import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import "./CustomerChoose.css";

export default function CustomerChoose() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState("");
  const [selecting, setSelecting] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get(`/api/bids/customer/${token}`);
      setData(data);
      setMsg("");
    } catch (e) {
      setMsg(e?.response?.data?.message || "Invalid or expired link");
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line
  }, [token]);

  const choose = async (bidId) => {
    setSelecting(true);
    try {
      await api.post(`/api/bids/customer/${token}/select`, { bidId });
      await load();
      setMsg("Vendor selected ");
    } catch (e) {
      setMsg(e?.response?.data?.message || "Failed to select");
    } finally {
      setSelecting(false);
    }
  };

  if (!data)
    return (
      <div className="cc">
        <p>Loading...</p>
      </div>
    );

  const statusPath = data?.job?._id ? `/status/${data.job._id}` : null;

  return (
    <div className="cc">
      <h1>Choose Your Tow</h1>
      {msg && <div className="alert">{msg}</div>}

      <div className="card">
        <div>
          <strong>Pickup:</strong> {data.job.pickupAddress}
        </div>
        {data.job.dropoffAddress && (
          <div>
            <strong>Drop-off:</strong> {data.job.dropoffAddress}
          </div>
        )}
        <div className="muted small">{data.job.serviceType}</div>
      </div>

      {data.job.selectedBidId ? (
        <div className="card">
          <h3>All set!</h3>
          <p>We've assigned your driver. You can track progress here:</p>
          {statusPath && (
            <Link className="btn" to={statusPath}>
              Open Status
            </Link>
          )}
        </div>
      ) : (
        <div className="card">
          <h3>Incoming Bids</h3>
          {data.bids.length === 0 && <p className="muted">Waiting for bids...</p>}
          <ul className="bidlist">
            {data.bids.map((b) => (
              <li key={b._id} className="bid">
                <div className="b-main">
                  <strong>{b.vendorName}</strong>
                  <div className="muted">{b.etaMinutes} min</div>
                </div>
                <div className="b-price">${b.price}</div>
                <button
                  className="btn"
                  disabled={selecting}
                  onClick={() => choose(b._id)}
                >
                  Select
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

