// src/lib/loadGoogleMaps.js
let loadingPromise = null;

export function loadGoogleMaps() {
  if (typeof window !== "undefined" && window.google && window.google.maps) {
    return Promise.resolve(window.google);
  }
  if (loadingPromise) return loadingPromise;

  const key = process.env.REACT_APP_GOOGLE_MAPS_KEY; // <- one consistent name
  if (!key) {
    return Promise.reject(
      new Error("Missing REACT_APP_GOOGLE_MAPS_KEY in environment")
    );
  }

  const params = new URLSearchParams({
    key,
    libraries: "places,geometry",
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
