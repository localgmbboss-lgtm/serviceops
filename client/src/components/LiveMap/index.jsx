import { useEffect, useRef } from "react";
import L from "leaflet";
import "./styles.css";

/**
 * LiveMap (Leaflet + OSM)
 * Props:
 *  - drivers: [{ _id?, name, city, lat, lng, lastSeenAt, heading, speedKph, available }]
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
  destination = null,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const markersRef = useRef(new Map()); // key -> marker
  const destinationRef = useRef(null);

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

    const ro = new ResizeObserver(() =>
      setTimeout(() => map.invalidateSize(), 0)
    );
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [center, zoom]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    const toNum = (v) => (v === null || v === undefined ? NaN : Number(v));
    const now = Date.now();

    const seen = new Set();

    drivers.forEach((driver) => {
      const lat = toNum(driver?.lat);
      const lng = toNum(driver?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const key = String(driver?._id || `${driver?.name || "driver"}-${driver?.phone || ""}`);
      seen.add(key);

      let marker = markersRef.current.get(key);
      const lastSeen = driver?.lastSeenAt ? new Date(driver.lastSeenAt) : null;
      const isStale = !lastSeen || now - lastSeen.getTime() > staleMs;
      const heading = toNum(driver?.heading ?? driver?.bearing);
      const speed = toNum(driver?.speedKph ?? driver?.speed ?? driver?.velocity);
      const available = driver?.available !== false;

      if (!marker) {
        marker = L.marker([lat, lng], {
          icon: createDriverIcon({
            heading,
            stale: isStale,
            available,
            label: initials(driver?.name || driver?.phone),
          }),
        }).addTo(layer);
        markersRef.current.set(key, marker);
      } else {
        marker.setLatLng([lat, lng]);
      }

      updateMarkerVisual(marker, {
        heading,
        stale: isStale,
        available,
        speed,
        label: initials(driver?.name || driver?.phone),
      });

      const last = lastSeen ? timeAgo(lastSeen) : "-";
      const city = driver?.city ? `<div class="lm-city">${escapeHtml(driver.city)}</div>` : "";
      const meta = [];
      if (Number.isFinite(speed)) {
        meta.push(`${Math.round(speed)} km/h`);
      }
      if (available === false) {
        meta.push("Unavailable");
      }
      const metaHtml = meta.length
        ? `<div class="lm-meta"><small>${meta.map(escapeHtml).join(" • ")}</small></div>`
        : "";

      marker.bindPopup(`
        <div class="lm-popup">
          <div class="lm-name"><strong>${escapeHtml(
            driver?.name || "Driver"
          )}</strong></div>
          ${city}
          <div class="lm-seen"><small>Last seen: ${last}${
        isStale ? " (stale)" : ""
      }</small></div>
          ${metaHtml}
        </div>
      `);
    });

    for (const [key, marker] of markersRef.current.entries()) {
      if (!seen.has(key)) {
        marker.remove();
        markersRef.current.delete(key);
      }
    }

    const destLat = Number(destination?.lat);
    const destLng = Number(destination?.lng);
    const hasDestination =
      destination && Number.isFinite(destLat) && Number.isFinite(destLng);

    if (hasDestination) {
      if (!destinationRef.current) {
        destinationRef.current = L.circleMarker([destLat, destLng], {
          radius: 7,
          color: "#f59e0b",
          fillColor: "#f59e0b",
          fillOpacity: 0.9,
          weight: 2,
        }).addTo(layer);
      } else {
        destinationRef.current.setLatLng([destLat, destLng]);
      }
      destinationRef.current.bindPopup("Destination");
    } else if (destinationRef.current) {
      destinationRef.current.remove();
      destinationRef.current = null;
    }

    if (autoFit) {
      const pts = Array.from(markersRef.current.values()).map((m) => m.getLatLng());
      if (hasDestination && destinationRef.current) {
        pts.push(destinationRef.current.getLatLng());
      }
      if (pts.length === 1) {
        map.setView(pts[0], 14, { animate: true });
      } else if (pts.length > 1) {
        const bounds = L.latLngBounds(pts);
        map.fitBounds(bounds, { padding: [40, 40] });
      } else {
        map.setView(center, zoom);
      }
    }
  }, [drivers, autoFit, staleMs, center, zoom, destination]);

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

function initials(value) {
  if (!value) return "DR";
  const tokens = String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return "DR";
  const chars = tokens
    .slice(0, 2)
    .map((token) => token[0])
    .join("");
  return chars.toUpperCase();
}

function createDriverIcon({ heading, label, stale, available }) {
  const rotation = Number.isFinite(heading) ? heading : 0;
  const classes = ["lm-marker__body"];
  if (stale) classes.push("is-stale");
  if (available === false) classes.push("is-offline");
  const className = classes.join(" ");

  return L.divIcon({
    className: "lm-marker",
    html: `
      <div class="${className}" style="--lm-heading:${rotation}deg;">
        <div class="lm-pin">
          <span class="lm-pin__arrow"></span>
          <span class="lm-pin__label">${escapeHtml(label || "DR")}</span>
        </div>
      </div>
    `,
    iconSize: [46, 46],
    iconAnchor: [23, 30],
  });
}

function updateMarkerVisual(marker, { heading, stale, available, speed, label }) {
  const apply = (el) => {
    if (!el) return;
    const body = el.querySelector(".lm-marker__body");
    if (body) {
      if (stale) body.classList.add("is-stale");
      else body.classList.remove("is-stale");

      if (available === false) body.classList.add("is-offline");
      else body.classList.remove("is-offline");

      if (Number.isFinite(heading)) {
        body.style.setProperty("--lm-heading", `${heading}deg`);
      } else {
        body.style.removeProperty("--lm-heading");
      }
      const labelNode = body.querySelector(".lm-pin__label");
      if (labelNode) labelNode.textContent = label || "DR";
    }
    if (Number.isFinite(speed) && speed > 1) {
      el.setAttribute("data-speed", `${Math.round(speed)} km/h`);
    } else {
      el.removeAttribute("data-speed");
    }
  };

  const element = marker.getElement();
  if (element) {
    apply(element);
  } else {
    marker.once("add", () => apply(marker.getElement()));
  }
}
