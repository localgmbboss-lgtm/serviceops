// src/lib/loadGoogleMaps.js
import { getGoogleMapsKey } from "../config/env.js";

let loadingPromise = null;
let requestedLibraries = new Set(["places", "geometry", "routes"]);

export function loadGoogleMaps(options = {}) {
  if (typeof window !== "undefined" && window.google && window.google.maps) {
    return Promise.resolve(window.google);
  }

  const extraLibraries = Array.isArray(options.libraries)
    ? options.libraries
    : [];
  extraLibraries.forEach((lib) => {
    if (lib) requestedLibraries.add(lib);
  });

  if (loadingPromise) return loadingPromise;

  const key = getGoogleMapsKey();
  if (!key) {
    return Promise.reject(
      new Error("Missing Google Maps API key (GOOGLE_MAPS_KEY) in environment")
    );
  }

  const params = new URLSearchParams({
    key,
    libraries: Array.from(requestedLibraries).join(","),
    v: "weekly",
  });

  loadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      if (window.google && window.google.maps) resolve(window.google);
      else reject(new Error("Google Maps loaded but window.google is missing"));
    };
    script.onerror = () => reject(new Error("Failed to load Google Maps"));

    document.head.appendChild(script);
  });

  return loadingPromise;
}
