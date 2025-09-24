import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import useDriverLocation from "../hooks/useDriverLocation";
import "./DriverJobs.css";

export default function DriverJobs() {
  // Pick driver from localStorage or first available (DEV-friendly until auth exists)
  const [drivers, setDrivers] = useState([]);
  const [driverId, setDriverId] = useState(localStorage.getItem("driverId") || "");
  const [jobs, setJobs] = useState([]);
  const [share, setShare] = useState(localStorage.getItem("shareLocation") === "1");
  const [pushMs, setPushMs] = useState(15000); // default, can be overridden by settings
  const [loading, setLoading] = useState(true);

  // Load settings for interval override
  useEffect(() => {
    api.get("/api/settings")
      .then(r => {
        const ms = Number(r.data?.intervals?.driverPushMs);
        if (Number.isFinite(ms) && ms > 1000) setPushMs(ms);
      })
      .catch(() => {});
  }, []);

  // Load drivers initial + keep selection
  const fetchDrivers = useCallback(async () => {
    const response = await api.get("/api/drivers");
    return Array.isArray(response.data) ? response.data : [];
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await fetchDrivers();
        if (!alive) return;
        setDrivers(list);
        if (!driverId && list.length) {
          setDriverId(list[0]._id);
          localStorage.setItem("driverId", list[0]._id);
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fetchDrivers, driverId]);

  // Persist preferences
  useEffect(() => {
    if (driverId) localStorage.setItem("driverId", driverId);
  }, [driverId]);
  useEffect(() => {
    localStorage.setItem("shareLocation", share ? "1" : "0");
  }, [share]);

  // Location hook (pushes to API on interval or movement)
  const loc = useDriverLocation({ driverId, enabled: share, pushMs });

  // Poll jobs (7s) and filter for this driver
  useEffect(() => {
    let alive = true;
    const fetchJobs = async () => {
      try {
        const r = await api.get("/api/jobs");
        if (!alive) return;
        setJobs(r.data || []);
      } catch (e) {
        console.error(e);
      }
    };
    fetchJobs();
    const t = setInterval(fetchJobs, 7000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const myJobs = useMemo(
    () => jobs.filter(j => j.driverId === driverId),
    [jobs, driverId]
  );
  const assigned = myJobs.filter(j => j.status === "Assigned");
  const progress = myJobs.filter(j => j.status === "OnTheWay" || j.status === "Arrived");
  const done     = myJobs.filter(j => j.status === "Completed");

  async function move(id, status) {
    try {
      const { data } = await api.patch(`/api/jobs/${id}`, { status });
      setJobs(prev => prev.map(j => (j._id === id ? data : j)));
    } catch (e) {
      console.error(e);
      alert(e?.response?.data?.message || "Failed to update job");
    }
  }

  async function accept(id) { await move(id, "OnTheWay"); }
  async function arrived(id) { await move(id, "Arrived"); }
  async function complete(id) { await move(id, "Completed"); }

  return (
    <div className="driver-page">
      <div className="card driver-controls">
        <div className="row">
          <label className="row">
            <span>Driver</span>
            <select
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
            >
              {drivers.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name} ({d.city})
                </option>
              ))}
            </select>
          </label>

          <label className="row">
            <input
              type="checkbox"
              checked={share}
              onChange={(e) => setShare(e.target.checked)}
            />
            <span>Share live location</span>
          </label>

          <div className="muted small">
            {share ? (
              loc.error ? <>GPS error: {loc.error}</> :
              (Number.isFinite(loc.lat) ? <>Sending every ~{Math.round(pushMs/1000)}s (lat {loc.lat.toFixed(5)}, lng {loc.lng.toFixed(5)})</> : <>Waiting for GPS...</>)
            ) : (
              <>Location sharing is OFF</>
            )}
          </div>
        </div>
      </div>

      {loading && <p>Loading...</p>}

      <section className="grid2">
        <div className="card">
          <h3>Assigned</h3>
          {assigned.length === 0 && <p className="muted">No assigned jobs.</p>}
          <ul className="dlist">
            {assigned.map(j => (
              <li key={j._id} className="dcard">
                <div className="dtitle">{j.serviceType || "Service"}</div>
                <div className="dsub">{j.pickupAddress}</div>
                <div className="row">
                  <button className="btn" onClick={() => accept(j._id)}>Accept / On The Way</button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h3>In Progress</h3>
          {progress.length === 0 && <p className="muted">No active job.</p>}
          <ul className="dlist">
            {progress.map(j => (
              <li key={j._id} className="dcard">
                <div className="dtitle">{j.serviceType || "Service"}</div>
                <div className="dsub">{j.pickupAddress}</div>
                <div className="row">
                  {j.status === "OnTheWay" && (
                    <button className="btn" onClick={() => arrived(j._id)}>Arrived</button>
                  )}
                  {(j.status === "OnTheWay" || j.status === "Arrived") && (
                    <button className="btn primary" onClick={() => complete(j._id)}>Complete</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="card">
        <h3>History</h3>
        {done.length === 0 && <p className="muted">No completed jobs yet.</p>}
        <ul className="dlist">
          {done.map(j => (
            <li key={j._id} className="dcard">
              <div className="dtitle">{j.serviceType || "Service"}</div>
              <div className="dsub">{j.pickupAddress}</div>
              <div className="muted small">Earnings split: {j.earningsSplit ?? "—"}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
