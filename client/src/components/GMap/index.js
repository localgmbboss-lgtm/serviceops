import { useEffect, useMemo, useRef, useState } from "react";
import { loadGoogleMaps } from "../../lib/loadGoogleMaps";
import { getGoogleMapsKey } from "../../config/env.js";
import "./styles.css";

const DEFAULT_CENTER = { lat: 6.5244, lng: 3.3792 };

function toNumber(value) {
  if (value === null || value === undefined || value === "") return NaN;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : NaN;
}

function normalizeLatLng(value) {
  if (!value || typeof value !== "object") return null;
  const lat = toNumber(value.lat);
  const lng = toNumber(value.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function sanitizeUrl(value) {
  if (!value) return null;
  const str = typeof value === "string" ? value : String(value);
  const trimmed = str.trim();
  if (!trimmed) return null;
  if (/^data:/i.test(trimmed) || /^https?:\/\//i.test(trimmed)) return trimmed;
  return null;
}

function isSamePoint(a, b) {
  if (!a || !b) return false;
  const latDiff = Math.abs(toNumber(a.lat) - toNumber(b.lat));
  const lngDiff = Math.abs(toNumber(a.lng) - toNumber(b.lng));
  return Number.isFinite(latDiff) && Number.isFinite(lngDiff) && latDiff < 1e-5 && lngDiff < 1e-5;
}

function createPinIcon(g, label, options = {}) {
  if (!g?.maps?.Size || !g?.maps?.Point) return undefined;
  const rawLabel = String(label ?? "")
    .replace(/[^a-zA-Z0-9+]/g, "")
    .slice(0, 4)
    .toUpperCase();
  const badgeLabel = options.badge
    ? String(options.badge).replace(/[^a-zA-Z0-9+]/g, "").slice(0, 3).toUpperCase()
    : "";
  const displayLabel = rawLabel || badgeLabel;
  const background = options.background || "#2563eb";
  const color = options.color || "#ffffff";
  const textColor = options.textColor || color;
  const avatarUrl = sanitizeUrl(options.avatarUrl || options.avatar || options.imageUrl);

  if (avatarUrl) {
    const clipId = `clip-${Math.random().toString(36).slice(2, 8)}`;
    const pillText = displayLabel;
    const pillMarkup = pillText
      ? `<g>
          <rect x="10" y="40" width="24" height="12" rx="6" fill="rgba(15,23,42,0.75)" />
          <text x="22" y="48" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="10" font-weight="600" fill="#ffffff">${pillText}</text>
        </g>`
      : "";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="60" viewBox="0 0 44 60">
      <defs>
        <clipPath id="${clipId}">
          <circle cx="22" cy="20" r="14" />
        </clipPath>
      </defs>
      <path d="M22 0C11.402 0 2.75 8.652 2.75 19.25c0 13.04 14.38 28.48 18.53 32.89a3 3 0 0 0 4.44 0C27.87 47.73 42.25 32.29 42.25 19.25 42.25 8.652 32.598 0 22 0z" fill="${background}"/>
      <circle cx="22" cy="20" r="15" fill="#ffffff" opacity="0.92"/>
      <image href="${avatarUrl}" x="7" y="5" width="30" height="30" clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid slice"/>
      ${pillMarkup}
    </svg>`;
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new g.maps.Size(40, 56),
      anchor: new g.maps.Point(20, 54),
    };
  }

  const text = displayLabel || "\u2022";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="60" viewBox="0 0 44 60">
    <path d="M22 0C11.402 0 2.75 8.652 2.75 19.25c0 13.04 14.38 28.48 18.53 32.89a3 3 0 0 0 4.44 0C27.87 47.73 42.25 32.29 42.25 19.25 42.25 8.652 32.598 0 22 0z" fill="${background}"/>
    <text x="22" y="28" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="600" fill="${textColor}">${text}</text>
  </svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new g.maps.Size(36, 48),
    anchor: new g.maps.Point(18, 46),
  };
}


function normalizeDestination(value) {
  if (!value) return null;

  if (typeof value === "string") {
    return {
      position: null,
      label: value,
      title: value,
    };
  }

  if (typeof value !== "object") return null;

  const positionCandidate =
    value.position ||
    value.coords ||
    value.coordinate ||
    value.location ||
    (Object.prototype.hasOwnProperty.call(value, "lat")
      ? { lat: value.lat, lng: value.lng }
      : null);

  const position = normalizeLatLng(positionCandidate);
  const role = value.role || null;
  const label =
    value.label ||
    value.title ||
    value.name ||
    value.caption ||
    (value.address ? String(value.address).split(',')[0].trim() : null);
  const color = value.color || value.background || value.pinColor || null;
  const textColor = value.textColor || value.foreground || null;
  const avatarUrl =
    sanitizeUrl(
      value.avatarUrl ||
      value.avatar ||
      value.photoUrl ||
      value.photo ||
      value.image ||
      value.iconUrl
    );
  const defaultLabel = role === "customer" ? "YOU" : "DEST";
  const defaultTitle = role === "customer" ? "Customer" : "Destination";

  return {
    position,
    role,
    label: label || defaultLabel,
    title: value.title || value.tooltip || label || defaultTitle,
    color: color || null,
    textColor: textColor || null,
    avatarUrl: avatarUrl || null,
  };
}
/**
 * Props
 * - drivers: [{ name, lat, lng, lastSeenAt }]
 * - center: {lat, lng}
 * - destination: {lat, lng} | string address
 * - showRoute: boolean (driver -> destination)
 * - zoom: number
 * - landmarks: [{ position?: {lat,lng}, lat?, lng?, label?, title?, color?, textColor? }]
 */
export default function GMap({
  drivers = [],
  center = DEFAULT_CENTER,
  destination = null,
  showRoute = false,
  zoom = 12,
  landmarks = [],
}) {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const dirServiceRef = useRef(null);
  const dirRendererRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");

  const origin = useMemo(() => {
    const d = drivers.find(
      (x) => Number.isFinite(toNumber(x?.lat)) && Number.isFinite(toNumber(x?.lng))
    );
    return d ? { lat: toNumber(d.lat), lng: toNumber(d.lng) } : null;
  }, [drivers]);

  const destinationMeta = useMemo(() => normalizeDestination(destination), [destination]);
  const destinationPosition = destinationMeta?.position || null;
  const destinationLabel = useMemo(() => {
    if (!destinationMeta) return "DEST";
    if (destinationMeta.label) return destinationMeta.label;
    return destinationMeta.role === "customer" ? "YOU" : "DEST";
  }, [destinationMeta]);
  const destinationColor =
    destinationMeta?.color || (destinationMeta?.role === "customer" ? "#f97316" : "#0ea5e9");
  const destinationTextColor =
    destinationMeta?.textColor || (destinationMeta?.role === "customer" ? "#0f172a" : "#ffffff");
  const destinationAvatar = destinationMeta?.avatarUrl || null;
  const destinationTitle = destinationMeta?.title ||
    (destinationMeta?.role === "customer" ? "Customer" : "Destination");

  const normalizedLandmarks = useMemo(() => {
    if (!Array.isArray(landmarks)) return [];
    return landmarks
      .map((lm, idx) => {
        const position = normalizeLatLng(lm?.position || lm);
        if (!position) return null;
        return {
          ...lm,
          position,
          avatarUrl: sanitizeUrl(
            lm?.avatarUrl ||
            lm?.avatar ||
            lm?.photoUrl ||
            lm?.photo ||
            lm?.image ||
            lm?.iconUrl
          ),
          key: lm?.key || lm?.id || `landmark-${idx}`,
        };
      })
      .filter(Boolean);
  }, [landmarks]);

  useEffect(() => {
    const key = getGoogleMapsKey();
    if (!key) {
      setErr("Missing Google Maps API key");
      return;
    }

    let alive = true;
    (async () => {
      try {
        const g = await loadGoogleMaps();
        if (!alive) return;

        if (g?.maps?.importLibrary) {
          await g.maps.importLibrary("maps");
        }

        setReady(true);
      } catch (e) {
        if (!alive) return;
        console.error(e);
        setErr(e.message || "Failed to load Google Maps");
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!ready || mapRef.current || !mapEl.current) return;
    const g = window.google;
    if (!g?.maps?.Map) {
      setErr("Google Maps not available");
      return;
    }

    const map = new g.maps.Map(mapEl.current, {
      center,
      zoom,
      mapTypeId: g.maps.MapTypeId.ROADMAP,
      mapTypeControl: true,
      mapTypeControlOptions: {
        style: g.maps.MapTypeControlStyle.HORIZONTAL_BAR,
        position: g.maps.ControlPosition.TOP_RIGHT,
        mapTypeIds: [
          g.maps.MapTypeId.ROADMAP,
          g.maps.MapTypeId.SATELLITE,
          g.maps.MapTypeId.HYBRID,
        ],
      },
      fullscreenControl: true,
      streetViewControl: false,
    });
    mapRef.current = map;

    if (g.maps.DirectionsService) {
      dirServiceRef.current = new g.maps.DirectionsService();
      dirRendererRef.current = new g.maps.DirectionsRenderer({
        suppressMarkers: true,
        polylineOptions: {
          strokeColor: "#0ea5e9",
          strokeOpacity: 0.85,
          strokeWeight: 5,
        },
      });
      dirRendererRef.current.setMap(map);
    }
  }, [ready, center, zoom]);

  useEffect(() => {
    const g = window.google;
    const map = mapRef.current;
    const svc = dirServiceRef.current;
    const rend = dirRendererRef.current;
    if (!ready || !map || !g?.maps || !svc || !rend) return;

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];

    const bounds = new g.maps.LatLngBounds();
    let hasAny = false;

    drivers.forEach((d, idx) => {
      const lat = toNumber(d?.lat);
      const lng = toNumber(d?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const label = d?.label || (idx === 0 ? "DRV" : "CAR");
      const background = d?.color || d?.pinColor || (idx === 0 ? "#2563eb" : "#334155");
      const textColor = d?.textColor || d?.pinTextColor || "#ffffff";
      const avatarUrl = sanitizeUrl(
        d?.avatarUrl ||
        d?.avatar ||
        d?.photoUrl ||
        d?.photo ||
        d?.image ||
        d?.iconUrl
      );
      const marker = new g.maps.Marker({
        position: { lat, lng },
        map,
        title: d?.title || d?.name || "Driver",
        icon: createPinIcon(g, label, {
          background,
          color: textColor,
          textColor,
          avatarUrl,
        })
      });
      markersRef.current.push(marker);
      bounds.extend(marker.getPosition());
      hasAny = true;
    });

    if (destinationPosition) {
      const destMarker = new g.maps.Marker({
        position: destinationPosition,
        map,
        title: destinationTitle,
        icon: createPinIcon(g, destinationLabel, {
          background: destinationColor,
          color: destinationTextColor,
          textColor: destinationTextColor,
          avatarUrl: destinationAvatar
        })
      });
      markersRef.current.push(destMarker);
      bounds.extend(destMarker.getPosition());
      hasAny = true;
    }
    normalizedLandmarks.forEach((landmark) => {
      const { position } = landmark;
      if (!position) return;
      if (destinationPosition && isSamePoint(position, destinationPosition)) return;
      const overlapsDriver = drivers.some((d) =>
        isSamePoint(position, { lat: toNumber(d?.lat), lng: toNumber(d?.lng) })
      );
      if (overlapsDriver) return;
      const marker = new g.maps.Marker({
        position,
        map,
        title: landmark?.title || landmark?.label || "Location",
        icon: createPinIcon(g, landmark?.label || "LOC", {
          background: landmark?.color || "#0f172a",
          color: landmark?.textColor || "#ffffff",
          textColor: landmark?.textColor || "#ffffff",
          avatarUrl: landmark?.avatarUrl || null
        })
      });
      markersRef.current.push(marker);
      bounds.extend(marker.getPosition());
      hasAny = true;
    });

    if (hasAny) {
      const northEast = bounds.getNorthEast();
      const southWest = bounds.getSouthWest();
      const singlePoint = northEast && southWest && northEast.equals(southWest);
      if (singlePoint) {
        const focus = northEast || southWest;
        if (focus) map.setCenter(focus);
        map.setZoom(Math.max(zoom || 15, 15));
      } else {
        map.fitBounds(bounds, 80);
        if (map.getZoom() > 17) map.setZoom(17);
      }
    } else {
      if (center) {
        map.setCenter(center);
      } else {
        map.setCenter(DEFAULT_CENTER);
      }
      if (zoom) {
        map.setZoom(zoom);
      } else {
        map.setZoom(12);
      }
    }
    if (!showRoute || !origin || !destinationPosition) {
      rend.setDirections({ routes: [] });
      return;
    }

    const req = {
      origin,
      destination: destinationPosition,
      travelMode: g.maps.TravelMode.DRIVING,
    };

    svc.route(req, (result, status) => {
      if (status === g.maps.DirectionsStatus.OK) {
        rend.setDirections(result);
      } else {
        console.warn("Directions request failed:", status);
        rend.setDirections({ routes: [] });
      }
    });
  }, [ready, drivers, destinationPosition, destinationLabel, destinationTitle, destinationColor, destinationTextColor, destinationAvatar, normalizedLandmarks, center, zoom, origin, showRoute]);

  return (
    <div className="gmap-wrap">
      {err && <div className="gmap-error">{err}</div>}
      <div className="gmap-container" ref={mapEl} />
    </div>
  );
}























