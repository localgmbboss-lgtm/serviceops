import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import GMap from "../components/GMap";
import LiveMap from "../components/LiveMap";
import { GOOGLE_MAPS_KEY } from "../config/env.js";
import "./AdminLiveMap.css";

export default function AdminLiveMap() {
  const [drivers, setDrivers] = useState([]);
  const [onlyAvailable, setOnlyAvailable] = useState(true);
  const [city, setCity] = useState("");
  const [pollMs, setPollMs] = useState(5000);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get("/api/settings")
      .then((response) => {
        if (!alive) return;
        const ms = Number(response.data?.intervals?.mapPollMs);
        if (Number.isFinite(ms) && ms >= 1000) setPollMs(ms);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const loadDrivers = useCallback(async () => {
    setBusy(true);
    try {
      const endpoint = onlyAvailable
        ? "/api/drivers?available=true"
        : "/api/drivers";
      const { data } = await api.get(endpoint);
      setDrivers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Unable to load drivers", error);
    } finally {
      setBusy(false);
    }
  }, [onlyAvailable]);

  useEffect(() => {
    let cancelled = false;
    loadDrivers();
    const timer = setInterval(() => {
      if (!cancelled) loadDrivers();
    }, pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [loadDrivers, pollMs]);

  const cities = useMemo(
    () =>
      [...new Set(drivers.map((d) => d.city).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [drivers]
  );

  const hasGoogle = Boolean(GOOGLE_MAPS_KEY);

  const filteredDrivers = useMemo(
    () =>
      drivers.filter((driver) => {
        if (!city) return true;
        return driver.city === city;
      }),
    [drivers, city]
  );

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
          Updates every {Math.round(pollMs / 100) / 10}s | Showing {filteredDrivers.length} of {drivers.length} drivers
        </p>
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



