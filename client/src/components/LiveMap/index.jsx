import { useEffect, useRef } from "react";
import L from "leaflet";
import "./styles.css";

/**
 * LiveMap (Leaflet + OSM)
 * Props:
 *  - drivers: [{ _id?, name, city, lat, lng, lastSeenAt }]
 *  - center?: [lat, lng]        (default Lagos)
 *  - zoom?: number              (default 11)
 *  - autoFit?: boolean          (default true) fit map to visible drivers
 *  - staleMs?: number           (default 60_000 ms) > stale threshold
 */
export default function LiveMap({
  drivers = [],
  center = [6.5244, 3.3792],
  zoom = 11,
  autoFit = true,
  staleMs = 60_000,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null); // parent layer for markers
  const markersRef = useRef(new Map()); // key -> { marker, ring }

  // Fix default marker icons (CRA/Webpack)
  useEffect(() => {
    const retina =
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png";
    const marker =
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png";
    const shadow =
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png";
    // eslint-disable-next-line
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: retina,
      iconUrl: marker,
      shadowUrl: shadow,
    });
  }, []);

  // Init map once
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView(center, zoom);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    const layer = L.layerGroup().addTo(map);

    mapRef.current = map;
    layerRef.current = layer;

    // Resize observer to fix 0x0 containers on route changes
    const ro = new ResizeObserver(() =>
      setTimeout(() => map.invalidateSize(), 0)
    );
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [center, zoom]);

  // Update markers on driver changes
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    const toNum = (v) => (v === null || v === undefined ? NaN : Number(v));
    const now = Date.now();
    const freshColor = "#2563eb"; // blue
    const staleColor = "#9ca3af"; // gray

    // Track which keys we saw this cycle (for cleanup)
    const seen = new Set();

    // Create/update markers
    drivers.forEach((d) => {
      const _lat = toNum(d.lat);
      const _lng = toNum(d.lng);
      if (!Number.isFinite(_lat) || !Number.isFinite(_lng)) return;

      const key = String(d._id || `${d.name || "driver"}-${d.phone || ""}`);
      seen.add(key);

      // get or create marker + ring
      let entry = markersRef.current.get(key);
      if (!entry) {
        const marker = L.marker([_lat, _lng]).addTo(layer);
        const ring = L.circleMarker([_lat, _lng], {
          radius: 6,
          color: freshColor,
          fillColor: freshColor,
          fillOpacity: 0.9,
          weight: 2,
        }).addTo(layer);
        entry = { marker, ring };
        markersRef.current.set(key, entry);
      }

      // update positions
      entry.marker.setLatLng([_lat, _lng]);
      entry.ring.setLatLng([_lat, _lng]);

      // freshness
      const isStale =
        !d.lastSeenAt || now - new Date(d.lastSeenAt).getTime() > staleMs;
      const clr = isStale ? staleColor : freshColor;
      entry.ring.setStyle({ color: clr, fillColor: clr });

      // popup
      const when = d.lastSeenAt ? new Date(d.lastSeenAt) : null;
      const last = when ? timeAgo(when) : "—";
      entry.marker.bindPopup(`
        <div class="lm-popup">
          <div class="lm-name"><strong>${escapeHtml(
            d.name || "Driver"
          )}</strong></div>
          <div class="lm-city">${escapeHtml(d.city || "")}</div>
          <div class="lm-seen"><small>Last seen: ${last}${
        isStale ? " (stale)" : ""
      }</small></div>
        </div>
      `);
    });

    // Remove markers for drivers that disappeared
    for (const [key, entry] of markersRef.current.entries()) {
      if (!seen.has(key)) {
        entry.marker.remove();
        entry.ring.remove();
        markersRef.current.delete(key);
      }
    }

    // Fit bounds if requested
    if (autoFit) {
      const pts = [...markersRef.current.values()].map((e) =>
        e.marker.getLatLng()
      );
      if (pts.length === 1) {
        map.setView(pts[0], 14, { animate: true });
      } else if (pts.length > 1) {
        const bounds = L.latLngBounds(pts);
        map.fitBounds(bounds, { padding: [40, 40] });
      } else {
        map.setView(center, zoom);
      }
    }
  }, [drivers, autoFit, staleMs, center, zoom]);

  return (
    <div className="lm-wrap">
      <div ref={containerRef} className="lm-map" />
      <div className="lm-legend">
        <span className="dot fresh" /> Fresh (&le; 60s)
        <span className="dot stale" /> Stale (&gt; 60s)
      </div>
    </div>
  );
}

/* -------- helpers -------- */

function timeAgo(date) {
  const diff = Math.max(0, Date.now() - date.getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
