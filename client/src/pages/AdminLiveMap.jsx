import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import GMap from "../components/GMap";
import LiveMap from "../components/LiveMap";
import { getGoogleMapsKey } from "../config/env.js";
import { useLiveVendors } from "../contexts/LiveVendorsContext";
import { useWorkflowFlag } from "../contexts/SettingsContext";
import { distanceBetweenPointsKm } from "../utils/geo";
import "./AdminLiveMap.css";

const HQ_STORAGE_KEY = "admin.map.hq";

const loadStoredHq = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(HQ_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      Number.isFinite(Number(parsed.lat)) &&
      Number.isFinite(Number(parsed.lng))
    ) {
      return { lat: Number(parsed.lat), lng: Number(parsed.lng) };
    }
  } catch (_error) {
    /* ignore stored HQ parse errors */
  }
  return null;
};

export default function AdminLiveMap() {
  const allowLiveMap = useWorkflowFlag("showLiveDriverMap", true);
  if (!allowLiveMap) {
    return <Navigate to="/admin" replace />;
  }
  return <AdminLiveMapContent />;
}

function AdminLiveMapContent() {
  const { vendors, status, error, refresh } = useLiveVendors();
  const [onlyActive, setOnlyActive] = useState(true);
  const [city, setCity] = useState("");
  const [hq, setHq] = useState(() => loadStoredHq());
  const [hqForm, setHqForm] = useState(() => {
    const initial = loadStoredHq();
    return {
      lat: initial?.lat?.toString() || "",
      lng: initial?.lng?.toString() || "",
    };
  });
  const [focusVendor, setFocusVendor] = useState("all");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (hq && Number.isFinite(hq.lat) && Number.isFinite(hq.lng)) {
        window.localStorage.setItem(HQ_STORAGE_KEY, JSON.stringify(hq));
      } else {
        window.localStorage.removeItem(HQ_STORAGE_KEY);
      }
    } catch (_storageError) {
      /* ignore persistence errors */
    }
  }, [hq]);

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

  const statusLabel = useMemo(() => {
    if (status === "ready" || status === "refreshing") {
      return `Live refresh every 20s - ${filteredVendors.length} of ${vendors.length} vendors`;
    }
    if (status === "error") {
      return "Live feed unavailable";
    }
    return "Loading live data...";
  }, [status, filteredVendors.length, vendors.length]);

  const mapDestination = useMemo(() => {
    if (!hq || !Number.isFinite(hq.lat) || !Number.isFinite(hq.lng)) return null;
    return {
      position: hq,
      label: "HQ",
      role: "hq",
      title: "Headquarters",
      color: "#111827",
      textColor: "#f8fafc",
    };
  }, [hq]);

  const liveMapVendors = useMemo(() => {
    if (focusVendor === "all") return filteredVendors;
    return filteredVendors.filter((vendor) => vendor._id === focusVendor);
  }, [filteredVendors, focusVendor]);

  const googleVendors = useMemo(() => {
    if (focusVendor === "all") return filteredVendors;
    return filteredVendors.filter((vendor) => vendor._id === focusVendor);
  }, [filteredVendors, focusVendor]);

  const focusedVendor = useMemo(() => {
    if (focusVendor === "all") return null;
    return filteredVendors.find((vendor) => vendor._id === focusVendor) || null;
  }, [filteredVendors, focusVendor]);

  const routeDistanceMeters = useMemo(() => {
    if (!mapDestination?.position || !focusedVendor) return null;
    const km = distanceBetweenPointsKm(
      { lat: focusedVendor.lat, lng: focusedVendor.lng },
      mapDestination.position
    );
    return Number.isFinite(km) ? km * 1000 : null;
  }, [mapDestination, focusedVendor]);

  const handleHqInputChange = (key, value) => {
    setHqForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveHq = () => {
    const lat = Number(hqForm.lat);
    const lng = Number(hqForm.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      alert("Enter valid latitude and longitude for HQ.");
      return;
    }
    setHq({ lat, lng });
  };

  const handleUseLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      alert("Geolocation is not supported in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position.coords.latitude.toFixed(6));
        const lng = Number(position.coords.longitude.toFixed(6));
        setHq({ lat, lng });
        setHqForm({ lat: lat.toString(), lng: lng.toString() });
      },
      (geoError) => {
        alert(geoError?.message || "Unable to fetch your location.");
      }
    );
  };

  const handleClearHq = () => {
    setHq(null);
    setHqForm({ lat: "", lng: "" });
  };

  return (
    <div className="admin-map">
      <div className="card map-controls">
        <div className="map-control-grid">
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
          <label className="row">
            <span>Focus route</span>
            <select
              value={focusVendor}
              onChange={(event) => setFocusVendor(event.target.value)}
            >
              <option value="all">All vendors</option>
              {filteredVendors.map((vendor) => (
                <option key={vendor._id} value={vendor._id}>
                  {vendor.name || vendor.phone || "Vendor"}
                </option>
              ))}
            </select>
          </label>
          <button className="btn ghost" onClick={refresh}>
            Refresh now
          </button>
        </div>

        <div className="map-hq">
          <div className="map-hq-fields">
            <label>
              <span>HQ latitude</span>
              <input
                type="number"
                inputMode="decimal"
                value={hqForm.lat}
                placeholder="e.g. 40.7128"
                onChange={(event) => handleHqInputChange("lat", event.target.value)}
              />
            </label>
            <label>
              <span>HQ longitude</span>
              <input
                type="number"
                inputMode="decimal"
                value={hqForm.lng}
                placeholder="e.g. -74.006"
                onChange={(event) => handleHqInputChange("lng", event.target.value)}
              />
            </label>
          </div>
          <div className="map-hq-actions">
            <button type="button" className="btn ghost" onClick={handleSaveHq}>
              Save HQ
            </button>
            <button type="button" className="btn ghost" onClick={handleUseLocation}>
              Use my location
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={handleClearHq}
              disabled={!hq}
            >
              Clear HQ
            </button>
          </div>
        </div>

        <p className={`muted ${status === "error" ? "error" : ""}`}>{statusLabel}</p>
        {hq && (
          <p className="muted tiny">
            HQ fixed at {hq.lat.toFixed(4)}, {hq.lng.toFixed(4)}
          </p>
        )}
        {error && <p className="muted error">{error}</p>}
      </div>

      <div className="card">
        {hasGoogle ? (
          <GMap
            vendors={googleVendors}
            destination={mapDestination}
            showRoute={Boolean(mapDestination && googleVendors.length === 1)}
            zoom={11}
          />
        ) : (
          <>
            <LiveMap
              vendors={liveMapVendors}
              autoFit
              center={
                mapDestination?.position
                  ? [mapDestination.position.lat, mapDestination.position.lng]
                  : [6.5244, 3.3792]
              }
              destination={mapDestination?.position || null}
              showRoute={Boolean(mapDestination)}
              routeDistanceMeters={focusVendor === "all" ? null : routeDistanceMeters}
            />
            <p className="muted tiny">
              Open map view highlights each vendor with routes back to HQ when set.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
