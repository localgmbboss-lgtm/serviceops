import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "./styles.css";

/**
 * LiveMap (Leaflet + OSM)
 * Props:
 *  - vendors: [{ _id, name, city, lat, lng, lastSeenAt, updatedAt, active }]
 *  - center?: [lat, lng]
 *  - zoom?: number
 *  - autoFit?: boolean
 *  - staleMs?: number
 *  - destination?: { lat, lng } | [lat, lng]
 *  - routeCoordinates?: Array<[lat, lng]>
 */
export default function LiveMap({
  vendors = [],
  drivers = [],
  center = [6.5244, 3.3792],
  zoom = 11,
  autoFit = true,
  staleMs = 60_000,
  destination = null,
  showRoute = false,
  routeColor = "#2563eb",
  routeWeight = 5,
  routeDistanceMeters = null,
  routeCoordinates = [],
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const markersRef = useRef(new Map());
  const destinationRef = useRef(null);
  const routesRef = useRef(new Map());

  const activeVendors = useMemo(() => {
    if (Array.isArray(vendors) && vendors.length) return vendors;
    if (Array.isArray(drivers) && drivers.length) return drivers;
    return [];
  }, [vendors, drivers]);

  const distanceSummary = useMemo(() => {
    if (!showRoute || !Number.isFinite(routeDistanceMeters)) return null;
    if (routeDistanceMeters < 1000) {
      return `${Math.max(1, Math.round(routeDistanceMeters))} m`;
    }
    const km = routeDistanceMeters / 1000;
    if (km < 10) return `${km.toFixed(1)} km`;
    const miles = km * 0.621371;
    if (miles < 10) return `${miles.toFixed(1)} mi`;
    return `${Math.round(miles)} mi`;
  }, [routeDistanceMeters, showRoute]);

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

    const toNumber = (value) => {
      if (value === null || value === undefined || value === "") return NaN;
      const num = typeof value === "number" ? value : Number(value);
      return Number.isFinite(num) ? num : NaN;
    };

    const now = Date.now();
    const seen = new Set();
    let primaryLatLng = null;

    activeVendors.forEach((vendor) => {
      const lat = toNumber(vendor?.lat);
      const lng = toNumber(vendor?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const key = String(vendor?._id || `${vendor?.name || "vendor"}-${vendor?.phone || ""}`);
      seen.add(key);

      if (!primaryLatLng) {
        primaryLatLng = [lat, lng];
      }

      let marker = markersRef.current.get(key);

      const lastSeenSource = vendor?.lastSeenAt || vendor?.updatedAt;
      const lastSeen = lastSeenSource ? new Date(lastSeenSource) : null;
      const isStale =
        lastSeen && Number.isFinite(staleMs)
          ? now - lastSeen.getTime() > staleMs
          : false;
      const isActive = vendor?.active !== false;

      if (!marker) {
        marker = L.marker([lat, lng], {
          icon: createVendorIcon({
            stale: isStale,
            active: isActive,
            label: initials(vendor?.name || vendor?.phone),
          }),
        }).addTo(layer);
        markersRef.current.set(key, marker);
      } else {
        marker.setLatLng([lat, lng]);
      }

      updateMarkerVisual(marker, {
        stale: isStale,
        active: isActive,
        label: initials(vendor?.name || vendor?.phone),
      });

      const last = lastSeen ? timeAgo(lastSeen) : "unknown";
      const city = vendor?.city
        ? `<div class="lm-city">${escapeHtml(vendor.city)}</div>`
        : "";
      const meta = [];
      meta.push(isActive ? "Receiving jobs" : "Suspended");
      if (isStale) meta.push("No updates");
      const metaHtml = meta.length
        ? `<div class="lm-meta"><small>${meta.map(escapeHtml).join(" · ")}</small></div>`
        : "";

      marker.bindPopup(`
        <div class="lm-popup">
          <div class="lm-name"><strong>${escapeHtml(
            vendor?.name || "Vendor"
          )}</strong></div>
          ${city}
          <div class="lm-seen"><small>Last update: ${escapeHtml(last)}</small></div>
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

    const destinationLatLng = Array.isArray(destination)
      ? { lat: destination[0], lng: destination[1] }
      : destination;
    const destLat = toNumber(destinationLatLng?.lat);
    const destLng = toNumber(destinationLatLng?.lng);
    const hasDestination =
      destinationLatLng &&
      Number.isFinite(destLat) &&
      Number.isFinite(destLng);

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

    if (!showRoute || !hasDestination) {
      routesRef.current.forEach((polyline) => polyline.remove());
      routesRef.current.clear();
    } else {
      const normalizedRoutePath =
        showRoute &&
        Array.isArray(routeCoordinates) &&
        routeCoordinates.length >= 2
          ? routeCoordinates
              .map((pair) => {
                if (!pair) return null;
                if (Array.isArray(pair) && pair.length >= 2) {
                  const latValue = toNumber(pair[0]);
                  const lngValue = toNumber(pair[1]);
                  if (Number.isFinite(latValue) && Number.isFinite(lngValue)) {
                    return [latValue, lngValue];
                  }
                  return null;
                }
                if (
                  typeof pair === "object" &&
                  pair !== null &&
                  Number.isFinite(toNumber(pair.lat)) &&
                  Number.isFinite(toNumber(pair.lng))
                ) {
                  return [toNumber(pair.lat), toNumber(pair.lng)];
                }
                return null;
              })
              .filter(Boolean)
          : null;

      const activeRouteKeys = new Set();
      activeVendors.forEach((vendor) => {
        const lat = toNumber(vendor?.lat);
        const lng = toNumber(vendor?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        const key = String(vendor?._id || `${vendor?.name || "vendor"}-${vendor?.phone || ""}`);
        const routeKey = `route:${key}`;
        activeRouteKeys.add(routeKey);
        const path =
          normalizedRoutePath && normalizedRoutePath.length >= 2
            ? normalizedRoutePath
            : [
                [lat, lng],
                [destLat, destLng],
              ];
        let poly = routesRef.current.get(routeKey);
        if (!poly) {
          poly = L.polyline(path, {
            color: routeColor,
            weight: routeWeight,
            opacity: 0.7,
            dashArray: "10 6",
          }).addTo(layer);
          routesRef.current.set(routeKey, poly);
        } else {
          poly.setLatLngs(path);
          poly.setStyle({
            color: routeColor,
            weight: routeWeight,
            opacity: 0.7,
            dashArray: "10 6",
          });
          if (!layer.hasLayer(poly)) {
            poly.addTo(layer);
          }
        }
      });
      for (const [key, poly] of routesRef.current.entries()) {
        if (!activeRouteKeys.has(key)) {
          poly.remove();
          routesRef.current.delete(key);
        }
      }
    }

    if (autoFit) {
      const points = Array.from(markersRef.current.values()).map((marker) =>
        marker.getLatLng()
      );
      if (hasDestination && destinationRef.current) {
        points.push(destinationRef.current.getLatLng());
      }
      if (points.length === 1) {
        map.setView(points[0], 14, { animate: true });
      } else if (points.length > 1) {
        const bounds = L.latLngBounds(points);
        map.fitBounds(bounds, { padding: [40, 40] });
      } else {
        map.setView(center, zoom);
      }
    }
  }, [
    activeVendors,
    autoFit,
    staleMs,
    center,
    zoom,
    destination,
    showRoute,
    routeColor,
    routeWeight,
    routeCoordinates,
  ]);

  return (
    <div className="lm-wrap">
      <div ref={containerRef} className="lm-map" />
      {distanceSummary && (
        <div className="lm-route-meta">
          <span className="lm-route-chip">Route</span>
          <strong>{distanceSummary}</strong>
        </div>
      )}
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function initials(value) {
  if (!value) return "VN";
  const tokens = String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return "VN";
  return tokens
    .slice(0, 2)
    .map((token) => token[0])
    .join("")
    .toUpperCase();
}

function createVendorIcon({ label, stale, active }) {
  const classes = ["lm-marker__body"];
  if (stale) classes.push("is-stale");
  if (active === false) classes.push("is-offline");
  const className = classes.join(" ");

  return L.divIcon({
    className: "lm-marker",
    html: `
      <div class="${className}">
        <div class="lm-pin">
          <span class="lm-pin__arrow"></span>
          <span class="lm-pin__label">${escapeHtml(label || "VN")}</span>
        </div>
      </div>
    `,
    iconSize: [46, 46],
    iconAnchor: [23, 30],
  });
}

function updateMarkerVisual(marker, { stale, active, label }) {
  const apply = (element) => {
    if (!element) return;
    const body = element.querySelector(".lm-marker__body");
    if (body) {
      body.classList.toggle("is-stale", Boolean(stale));
      body.classList.toggle("is-offline", active === false);
      const labelNode = body.querySelector(".lm-pin__label");
      if (labelNode) labelNode.textContent = label || "VN";
    }
  };

  const el = marker.getElement();
  if (el) {
    apply(el);
  } else {
    marker.once("add", () => apply(marker.getElement()));
  }
}
