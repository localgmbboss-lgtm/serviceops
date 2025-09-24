// client/src/components/PlacePicker.jsx
import { useEffect, useRef, useState } from "react";

// ————— helpers —————
function getMapsKey() {
  const vite =
    (typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env.VITE_GOOGLE_MAPS_KEY) ||
    "";
  const cra =
    (typeof process !== "undefined" &&
      process.env &&
      process.env.REACT_APP_GOOGLE_MAPS_KEY) ||
    "";
  const win = (typeof window !== "undefined" && window.GOOGLE_MAPS_KEY) || "";
  return vite || cra || win || "";
}

// Load Google Maps <script> (once) if a key exists
function useGooglePlaces() {
  const [ready, setReady] = useState(!!window.google?.maps?.places);

  useEffect(() => {
    if (ready) return;

    const key = getMapsKey();
    if (!key) return; // no key → no script, we’ll degrade to manual

    // already added?
    const existing = document.querySelector('script[data-gmaps="1"]');
    if (existing) {
      // if the script has already loaded, we’ll mark ready shortly
      if (window.google?.maps?.places) setReady(true);
      existing.addEventListener("load", () =>
        setReady(!!window.google?.maps?.places)
      );
      return;
    }

    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&v=weekly`;
    s.async = true;
    s.defer = true;
    s.dataset.gmaps = "1";
    s.onload = () => setReady(!!window.google?.maps?.places);
    s.onerror = () => console.warn("Google Maps failed to load.");
    document.head.appendChild(s);
  }, [ready]);

  return ready;
}

/**
 * value: { address?: string, lat?: number, lng?: number }
 * onChange: (next) => void
 * label: string
 */
export default function PlacePicker({
  value = {},
  onChange,
  label = "Pickup location",
}) {
  const [mode, setMode] = useState("gps"); // "gps" | "search" | "pin"
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const searchRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const ready = useGooglePlaces();

  // Attach Google Autocomplete on the search input
  useEffect(() => {
    if (mode !== "search" || !ready || !searchRef.current) return;

    const input = searchRef.current;
    // eslint-disable-next-line no-undef
    const ac = new window.google.maps.places.Autocomplete(input, {
      fields: ["geometry", "formatted_address", "name"],
    });

    const handler = () => {
      const place = ac.getPlace?.();
      const g = place?.geometry?.location;
      if (!g) return;
      const lat = g.lat();
      const lng = g.lng();
      const address = place.formatted_address || place.name || input.value;
      onChange?.({ ...value, address, lat, lng });
      setErr("");
    };

    ac.addListener("place_changed", handler);
    return () => {
      // clean listeners
      // eslint-disable-next-line no-undef
      window.google?.maps?.event?.clearInstanceListeners(ac);
    };
    // We intentionally skip onChange/value in deps to not rebind on each keystroke
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, ready]);

  // Init simple Google Map for pin mode
  useEffect(() => {
    if (mode !== "pin" || !ready || !mapRef.current) return;

    const center =
      Number.isFinite(value.lat) && Number.isFinite(value.lng)
        ? { lat: value.lat, lng: value.lng }
        : { lat: 37.7749, lng: -122.4194 }; // fallback center (SF)

    // eslint-disable-next-line no-undef
    const map = new window.google.maps.Map(mapRef.current, {
      center,
      zoom: Number.isFinite(value.lat) ? 15 : 12,
      mapTypeControl: false,
      streetViewControl: false,
    });

    const setMarker = (latLng) => {
      if (!markerRef.current) {
        // eslint-disable-next-line no-undef
        markerRef.current = new window.google.maps.Marker({
          position: latLng,
          map,
        });
      } else {
        markerRef.current.setPosition(latLng);
      }
    };

    if (Number.isFinite(value.lat) && Number.isFinite(value.lng)) {
      setMarker({ lat: value.lat, lng: value.lng });
    }

    const clickListener = map.addListener("click", (e) => {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      setMarker({ lat, lng });
      onChange?.({
        ...value,
        lat,
        lng,
        address: value.address || "Pinned location",
      });
    });

    // Try centering on current position (nice-to-have)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          map.setCenter({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          }),
        () => {}
      );
    }

    return () => {
      // eslint-disable-next-line no-undef
      window.google?.maps?.event?.removeListener(clickListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, ready]);

  // Use exact GPS
  const useGps = async () => {
    if (!("geolocation" in navigator)) {
      setErr("Geolocation not available on this device");
      return;
    }
    setBusy(true);
    setErr("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        const next = { ...value, lat, lng };

        // reverse geocode if Google is available
        if (window.google?.maps && ready) {
          try {
            // eslint-disable-next-line no-undef
            const geocoder = new window.google.maps.Geocoder();
            const { results } = await geocoder.geocode({
              location: { lat, lng },
            });
            next.address =
              results?.[0]?.formatted_address || "My current location";
          } catch {
            next.address = "My current location";
          }
        } else {
          next.address = "My current location";
        }

        onChange?.(next);
        setBusy(false);
      },
      (e) => {
        setErr(e?.message || "Failed to get location");
        setBusy(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  };

  // simple address typing fallback (no Google)
  const onManualChange = (e) => {
    const address = e.target.value;
    onChange?.({ ...value, address });
  };

  return (
    <div className="pp-wrap">
      <label className="pp-label">{label}</label>

      <div
        className="pp-modes"
        role="tablist"
        aria-label="Choose location mode"
      >
        <button
          type="button"
          className={`pp-mode ${mode === "gps" ? "active" : ""}`}
          onClick={() => setMode("gps")}
          role="tab"
          aria-selected={mode === "gps"}
        >
          Use my location
        </button>
        <button
          type="button"
          className={`pp-mode ${mode === "search" ? "active" : ""}`}
          onClick={() => setMode("search")}
          role="tab"
          aria-selected={mode === "search"}
        >
          Search address
        </button>
        <button
          type="button"
          className={`pp-mode ${mode === "pin" ? "active" : ""}`}
          onClick={() => setMode("pin")}
          role="tab"
          aria-selected={mode === "pin"}
        >
          Drop a pin
        </button>
      </div>

      {mode === "gps" && (
        <div className="pp-pane">
          <div className="row">
            <button
              type="button"
              className="btn"
              onClick={useGps}
              disabled={busy}
            >
              {busy ? "Getting location..." : "Use exact location"}
            </button>
          </div>
          {Number.isFinite(value.lat) && Number.isFinite(value.lng) && (
            <p className="muted small">
              Set to: {value.address || "My current location"} (
              {value.lat.toFixed(5)}, {value.lng.toFixed(5)})
            </p>
          )}
        </div>
      )}

      {mode === "search" && (
        <div className="pp-pane">
          {ready ? (
            <input
              ref={searchRef}
              className="pp-input"
              placeholder="Start typing an address..."
              defaultValue={value.address || ""}
            />
          ) : (
            <>
              <input
                className="pp-input"
                placeholder="Type full address (suggestions require Google key)"
                value={value.address || ""}
                onChange={onManualChange}
              />
              <p className="muted small">
                Tip: add a Google Maps key to enable address suggestions.
              </p>
            </>
          )}
        </div>
      )}

      {mode === "pin" && (
        <div className="pp-pane">
          {ready ? (
            <div ref={mapRef} className="pp-map" />
          ) : (
            <p className="muted small">
              Map pinning requires a Google Maps key.
            </p>
          )}
          {Number.isFinite(value.lat) && Number.isFinite(value.lng) && (
            <p className="muted small">
              Pinned: {value.address || "Pinned location"} (
              {value.lat.toFixed(5)}, {value.lng.toFixed(5)})
            </p>
          )}
        </div>
      )}

      {err && <div className="alert error">{err}</div>}
    </div>
  );
}
