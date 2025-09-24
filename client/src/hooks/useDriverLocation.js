import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

/**
 * Tracks driver's GPS and pushes to server periodically or on movement.
 * @param {Object} opts
 * @param {string} opts.driverId
 * @param {boolean} opts.enabled
 * @param {number} opts.pushMs  // e.g. 15000
 * @param {number} [opts.minMoveMeters=25] // push sooner if moved this much
 */
export default function useDriverLocation({
  driverId,
  enabled,
  pushMs,
  minMoveMeters = 25,
}) {
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);
  const [error, setError] = useState("");

  const lastSentRef = useRef(0);
  const lastLatRef = useRef(null);
  const lastLngRef = useRef(null);
  const watchIdRef = useRef(null);
  const timerRef = useRef(null);

  // Haversine distance (meters)
  const dist = (aLat, aLng, bLat, bLng) => {
    if (
      !Number.isFinite(aLat) ||
      !Number.isFinite(aLng) ||
      !Number.isFinite(bLat) ||
      !Number.isFinite(bLng)
    )
      return 0;
    const toRad = (d) => (d * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(bLat - aLat);
    const dLng = toRad(bLng - aLng);
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    return R * c;
  };

  // Start/stop geolocation watch
  useEffect(() => {
    if (!enabled || !driverId || !("geolocation" in navigator)) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setError("");
        const { latitude, longitude } = pos.coords || {};
        setLat(latitude);
        setLng(longitude);
      },
      (err) => {
        setError(err?.message || "Location unavailable");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      }
    );

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [enabled, driverId]);

  // Push loop: send periodically or when movement threshold exceeded
  useEffect(() => {
    if (!enabled || !driverId) return;

    async function push() {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const moved = dist(lastLatRef.current, lastLngRef.current, lat, lng);
      const now = Date.now();
      const timeOk = now - lastSentRef.current >= pushMs;
      const moveOk =
        !Number.isFinite(lastLatRef.current) || moved >= minMoveMeters;

      if (timeOk || moveOk) {
        try {
          await api.patch(`/api/drivers/${driverId}/location`, {
            lat,
            lng,
            ts: new Date().toISOString(),
          });
          lastSentRef.current = now;
          lastLatRef.current = lat;
          lastLngRef.current = lng;
        } catch (e) {
          // swallow; we’ll try again next tick
        }
      }
    }

    // tick immediately once (don’t wait full interval)
    push();

    timerRef.current = setInterval(push, Math.max(3000, pushMs));
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, driverId, lat, lng, pushMs, minMoveMeters]);

  return { lat, lng, error, lastPushAt: lastSentRef.current || null };
}
