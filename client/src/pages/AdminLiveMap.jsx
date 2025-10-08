import { useMemo, useState } from "react";
import GMap from "../components/GMap";
import LiveMap from "../components/LiveMap";
import { getGoogleMapsKey } from "../config/env.js";
import { useLiveVendors } from "../contexts/LiveVendorsContext";
import "./AdminLiveMap.css";

export default function AdminLiveMap() {
  const { vendors, status, error, refresh } = useLiveVendors();
  const [onlyActive, setOnlyActive] = useState(true);
  const [city, setCity] = useState("");

  const cities = useMemo(
    () =>
      [...new Set(vendors.map((vendor) => vendor.city).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b)
      ),
    [vendors]
  );

  const filteredVendors = useMemo(
    () =>
      vendors.filter((vendor) => {
        if (onlyActive && vendor.active === false) return false;
        if (!city) return true;
        return vendor.city === city;
      }),
    [vendors, city, onlyActive]
  );

  const hasGoogle = Boolean(getGoogleMapsKey());

  let statusLabel = "Loading live data…";
  if (status === "ready" || status === "refreshing") {
    statusLabel = `Live refresh every 20s · ${filteredVendors.length} of ${vendors.length} vendors`;
  } else if (status === "error") {
    statusLabel = "Live feed unavailable";
  }

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
              checked={onlyActive}
              onChange={(event) => setOnlyActive(event.target.checked)}
            />
            <span>Only active vendors</span>
          </label>
          <button className="btn ghost" onClick={refresh}>
            Refresh now
          </button>
        </div>
        <p className={`muted ${status === "error" ? "error" : ""}`}>
          {statusLabel}
        </p>
        {error && <p className="muted error">{error}</p>}
      </div>

      <div className="card">
        {hasGoogle ? (
          <GMap vendors={filteredVendors} showRoute={false} zoom={11} />
        ) : (
          <>
            <LiveMap vendors={filteredVendors} autoFit center={[6.5244, 3.3792]} />
            <p className="muted tiny">
              Add your Google Maps API key to enable satellite view and routing.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

