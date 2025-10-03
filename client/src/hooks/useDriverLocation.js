import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useLiveDrivers } from "../contexts/LiveDriversContext";

const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

const distanceMeters = (aLat, aLng, bLat, bLng) => {
  if (
    !Number.isFinite(aLat) ||
    !Number.isFinite(aLng) ||
    !Number.isFinite(bLat) ||
    !Number.isFinite(bLng)
  )
    return 0;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const originLat = toRad(aLat);
  const targetLat = toRad(bLat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(originLat) * Math.cos(targetLat) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return 6371000 * c;
};

const bearingBetween = (aLat, aLng, bLat, bLng) => {
  if (
    !Number.isFinite(aLat) ||
    !Number.isFinite(aLng) ||
    !Number.isFinite(bLat) ||
    !Number.isFinite(bLng)
  )
    return null;
  const dLng = toRad(bLng - aLng);
  const y = Math.sin(dLng) * Math.cos(toRad(bLat));
  const x =
    Math.cos(toRad(aLat)) * Math.sin(toRad(bLat)) -
    Math.sin(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.cos(dLng);
  const brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
};

const deriveSpeed = (aLat, aLng, aTs, bLat, bLng, bTs) => {
  if (!Number.isFinite(aLat) || !Number.isFinite(aLng) || !Number.isFinite(aTs)) return null;
  if (!Number.isFinite(bLat) || !Number.isFinite(bLng) || !Number.isFinite(bTs)) return null;
  const meters = distanceMeters(aLat, aLng, bLat, bLng);
  const deltaSec = (bTs - aTs) / 1000;
  if (!Number.isFinite(deltaSec) || deltaSec <= 0) return null;
  return (meters / deltaSec) * 3.6;
};

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
  const { socket } = useLiveDrivers();
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);
  const [heading, setHeading] = useState(null);
  const [speedKph, setSpeedKph] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [error, setError] = useState("");

  const lastSentRef = useRef(0);
  const lastLatRef = useRef(null);
  const lastLngRef = useRef(null);
  const lastTsRef = useRef(0);
  const watchIdRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!enabled || !driverId || !("geolocation" in navigator)) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setError("");
        const { latitude, longitude, accuracy: acc, heading: rawHeading, speed } = pos.coords || {};
        const timestamp = Number.isFinite(pos.timestamp) ? pos.timestamp : Date.now();
        setLat(latitude);
        setLng(longitude);
        setAccuracy(Number.isFinite(acc) ? acc : null);

        const computedHeading = Number.isFinite(rawHeading)
          ? rawHeading
          : bearingBetween(lastLatRef.current, lastLngRef.current, latitude, longitude);
        setHeading(Number.isFinite(computedHeading) ? computedHeading : null);

        const computedSpeed = Number.isFinite(speed)
          ? speed * 3.6
          : deriveSpeed(
              lastLatRef.current,
              lastLngRef.current,
              lastTsRef.current,
              latitude,
              longitude,
              timestamp
            );
        setSpeedKph(Number.isFinite(computedSpeed) ? computedSpeed : null);

        lastTsRef.current = timestamp;
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

  useEffect(() => {
    if (!enabled || !driverId) return;

    async function push() {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const moved = distanceMeters(lastLatRef.current, lastLngRef.current, lat, lng);
      const now = Date.now();
      const timeOk = now - lastSentRef.current >= pushMs;
      const moveOk =
        !Number.isFinite(lastLatRef.current) || moved >= minMoveMeters;

      if (!timeOk && !moveOk) return;

      const payload = {
        driverId,
        lat,
        lng,
        heading,
        speedKph,
        accuracy,
      };

      const sendViaSocket = () =>
        new Promise((resolve, reject) => {
          if (!socket || !socket.connected) return reject(new Error("socket offline"));
          socket.emit("driver:location", payload, (response) => {
            if (response?.ok) return resolve(response);
            return reject(new Error(response?.error || "socket error"));
          });
        });

      try {
        if (socket?.connected) {
          await sendViaSocket();
        } else {
          await api.patch(`/api/drivers/${driverId}/location`, {
            lat,
            lng,
            heading,
            speedKph,
            accuracy,
          });
        }
        lastSentRef.current = now;
        lastLatRef.current = lat;
        lastLngRef.current = lng;
      } catch (e) {
        try {
          await api.patch(`/api/drivers/${driverId}/location`, {
            lat,
            lng,
            heading,
            speedKph,
            accuracy,
          });
          lastSentRef.current = now;
          lastLatRef.current = lat;
          lastLngRef.current = lng;
        } catch (err) {
          console.error("Failed to push driver location", err);
        }
      }
    }

    push();

    timerRef.current = setInterval(push, Math.max(3000, pushMs));
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, driverId, lat, lng, heading, speedKph, accuracy, pushMs, minMoveMeters, socket]);

  return {
    lat,
    lng,
    heading,
    speedKph,
    accuracy,
    error,
    lastPushAt: lastSentRef.current || null,
  };
}
