import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import GMap from "../components/GMap";
import LiveMap from "../components/LiveMap";
import { getGoogleMapsKey } from "../config/env.js";
import { useLiveDrivers } from "../contexts/LiveDriversContext";
import "./AdminLiveMap.css";

export default function AdminLiveMap() {
  const { drivers: liveDrivers, connected, connecting, status, requestSnapshot } = useLiveDrivers();
  const [drivers, setDrivers] = useState([]);
  const [onlyAvailable, setOnlyAvailable] = useState(true);
  const [city, setCity] = useState("");
  const [pollMs, setPollMs] = useState(5000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setDrivers(liveDrivers);
  }, [liveDrivers]);

  useEffect(() => {
    let alive = true;
    api
      .get("/api/settings")
      .then((response) => {
        if (!alive) return;
        const intervals = response.data?.intervals || {};
        const refreshSec = Number(
          intervals.mapRefreshSec ??
            intervals.vendorPollSec ??
            intervals.pollDriversSec ??
            5
        );
        if (Number.isFinite(refreshSec) && refreshSec >= 1) {
          setPollMs(refreshSec * 1000);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const loadDrivers = useCallback(async () => {
    if (connected) {
      setBusy(true);
      try {
        await requestSnapshot();
        setError("");
      } catch (err) {
        setError(err?.message || "Unable to refresh drivers");
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    try {
      const endpoint = onlyAvailable ? "/api/drivers?available=true" : "/api/drivers";
      const { data } = await api.get(endpoint);
      const list = Array.isArray(data) ? data : [];
      setDrivers(list);
      setError("");
    } catch (err) {
      console.error("Unable to load drivers", err);
      setError("Unable to load drivers");
    } finally {
      setBusy(false);
    }
  }, [connected, onlyAvailable, requestSnapshot]);

  useEffect(() => {
    if (connected) return undefined;

    let cancelled = false;
    loadDrivers();
    const timer = setInterval(() => {
      if (!cancelled) loadDrivers();
    }, pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [loadDrivers, pollMs, connected]);

  const cities = useMemo(
    () =>
      [...new Set(drivers.map((d) => d.city).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [drivers]
  );

  const hasGoogle = Boolean(getGoogleMapsKey());

  const filteredDrivers = useMemo(
    () =>
      drivers.filter((driver) => {
        if (onlyAvailable && driver.available === false) return false;
        if (!city) return true;
        return driver.city === city;
      }),
    [drivers, city, onlyAvailable]
  );

  const liveStatusLabel = connected
    ? "Live updates: connected"
    : connecting
    ? "Live updates: connecting"
    : status === "error"
    ? "Live updates: error"
    : "Live updates: offline (fallback to polling)";

  return (
    <div className="admin-map">
      <div className="card map-controls">
        <div className="row">
          <label className="row">
            <span>City</span>
            <select value={city} onChange={(event) => setCity(event.target.value)}>
              <option value="">All</option>
              {cities.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="row toggle">
            <input
              type="checkbox"
              checked={onlyAvailable}
              onChange={(event) => setOnlyAvailable(event.target.checked)}
            />
            <span>Only available</span>
          </label>
          <button className="btn ghost" onClick={loadDrivers} disabled={busy}>
            {busy ? "Refreshing..." : "Refresh now"}
          </button>
        </div>
        <p className="muted">
          {liveStatusLabel} | Updates via {connected ? "socket push" : `${Math.round(pollMs / 1000)}s polling`} | Showing {filteredDrivers.length} of {drivers.length} drivers
        </p>
        {error && <p className="muted error">{error}</p>}
      </div>

      <div className="card">
        {hasGoogle ? (
          <GMap
            drivers={filteredDrivers}
            showRoute={false}
            zoom={11}
            destination={filteredDrivers[0]?.location || null}
          />
        ) : (
          <>
            <LiveMap drivers={filteredDrivers} autoFit center={[6.5244, 3.3792]} />
            <p className="muted tiny">
              Add your Google Maps API key to enable satellite view and routing.
            </p>
          </>
        )}
      </div>
    </div>
  );
}



