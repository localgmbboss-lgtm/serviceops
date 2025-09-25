import { useEffect, useMemo, useRef, useState } from "react";
import { loadGoogleMaps } from "../../lib/loadGoogleMaps";
import { GOOGLE_MAPS_KEY } from "../../config/env.js";
import "./styles.css";

/**
 * Props
 * - drivers: [{ name, lat, lng, lastSeenAt }]
 * - center: {lat, lng}
 * - destination: {lat, lng} | string address
 * - showRoute: boolean (driver -> destination)
 * - zoom: number
 */
export default function GMap({
  drivers = [],
  center = { lat: 6.5244, lng: 3.3792 },
  destination = null,
  showRoute = false,
  zoom = 12,
}) {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const dirServiceRef = useRef(null);
  const dirRendererRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");

  // choose a first driver as route origin
  const origin = useMemo(() => {
    const d = drivers.find(
      (x) => Number.isFinite(x?.lat) && Number.isFinite(x?.lng)
    );
    return d ? { lat: d.lat, lng: d.lng } : null;
  }, [drivers]);

  // Load Maps and its libraries once
  useEffect(() => {
    if (!GOOGLE_MAPS_KEY) {
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

  // Init the map once
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
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });
    mapRef.current = map;

    if (g.maps.DirectionsService) {
      dirServiceRef.current = new g.maps.DirectionsService();
      dirRendererRef.current = new g.maps.DirectionsRenderer({
        suppressMarkers: true,
      });
      dirRendererRef.current.setMap(map);
    }
  }, [ready, center, zoom]);

  // Update markers whenever drivers change
  useEffect(() => {
    const g = window.google;
    const map = mapRef.current;
    if (!ready || !map || !g?.maps) return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const bounds = new g.maps.LatLngBounds();
    let hasAny = false;

    drivers.forEach((d) => {
      if (!Number.isFinite(d.lat) || !Number.isFinite(d.lng)) return;
      const marker = new g.maps.Marker({
        position: { lat: d.lat, lng: d.lng },
        map,
        title: d.name || "Driver",
        icon: {
          path: g.maps.SymbolPath.CIRCLE,
          scale: 6,
          fillColor: "#1d4ed8",
          fillOpacity: 1,
          strokeColor: "#1d4ed8",
          strokeWeight: 2,
        },
      });
      markersRef.current.push(marker);
      bounds.extend(marker.getPosition());
      hasAny = true;
    });

    let destLatLng = null;
    if (
      destination &&
      typeof destination === "object" &&
      Number.isFinite(destination.lat) &&
      Number.isFinite(destination.lng)
    ) {
      destLatLng = destination;
    }
    if (destLatLng) {
      const destMarker = new g.maps.Marker({
        position: destLatLng,
        map,
        title: "Destination",
        icon: {
          path: g.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
          scale: 5,
          fillColor: "#16a34a",
          fillOpacity: 1,
          strokeColor: "#16a34a",
          strokeWeight: 2,
        },
      });
      markersRef.current.push(destMarker);
      bounds.extend(destMarker.getPosition());
      hasAny = true;
    }

    if (hasAny) {
      map.fitBounds(bounds, 80);
      if (map.getZoom() > 17) map.setZoom(17);
    } else {
      map.setCenter(center);
      map.setZoom(zoom);
    }
  }, [ready, drivers, destination, center, zoom]);

  // Optional route (first driver -> destination)
  useEffect(() => {
    const g = window.google;
    const map = mapRef.current;
    const svc = dirServiceRef.current;
    const rend = dirRendererRef.current;
    if (!ready || !map || !svc || !rend) return;

    if (!showRoute || !origin || !destination) {
      rend.setDirections({ routes: [] });
      return;
    }

    const req = {
      origin,
      destination,
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
  }, [ready, origin, destination, showRoute, drivers]);

  return (
    <div className="gmap-wrap">
      {err && <div className="gmap-error">{err}</div>}
      <div className="gmap-container" ref={mapEl} />
    </div>
  );
}



