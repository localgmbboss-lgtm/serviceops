const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

const pickCoordinate = (source, paths) => {
  for (const path of paths) {
    let current = source;
    for (const key of path) {
      if (current == null) {
        current = null;
        break;
      }
      current = current[key];
    }
    const numeric = toFiniteNumber(current);
    if (numeric !== null) return numeric;
  }
  return null;
};

const coordinateFromPaths = (source, latPaths, lngPaths) => {
  if (!source) return null;
  const lat = pickCoordinate(source, latPaths);
  const lng = pickCoordinate(source, lngPaths);
  return lat !== null && lng !== null ? { lat, lng } : null;
};

const CUSTOMER_LAT_PATHS = [
  ["pickupLat"],
  ["pickup", "lat"],
  ["pickup", "coordinates", "lat"],
  ["pickupLocation", "lat"],
  ["coordinates", "lat"],
  ["customerLocation", "lat"],
  ["customerCoordinates", "lat"],
  ["vehicleLocation", "lat"],
  ["customer", "lat"],
];

const CUSTOMER_LNG_PATHS = [
  ["pickupLng"],
  ["pickup", "lng"],
  ["pickup", "coordinates", "lng"],
  ["pickupLocation", "lng"],
  ["coordinates", "lng"],
  ["customerLocation", "lng"],
  ["customerCoordinates", "lng"],
  ["vehicleLocation", "lng"],
  ["customer", "lng"],
];

const DROPOFF_LAT_PATHS = [
  ["dropoffLat"],
  ["dropoff", "lat"],
  ["dropoffLocation", "lat"],
  ["destination", "lat"],
  ["dropoff", "coordinates", "lat"],
  ["dropoffCoordinates", "lat"],
];

const DROPOFF_LNG_PATHS = [
  ["dropoffLng"],
  ["dropoff", "lng"],
  ["dropoffLocation", "lng"],
  ["destination", "lng"],
  ["dropoff", "coordinates", "lng"],
  ["dropoffCoordinates", "lng"],
];

const DRIVER_LAT_PATHS = [
  ["lat"],
  ["latitude"],
  ["currentLat"],
  ["position", "lat"],
  ["location", "lat"],
  ["coords", "lat"],
  ["coordinate", "lat"],
];

const DRIVER_LNG_PATHS = [
  ["lng"],
  ["lon"],
  ["long"],
  ["longitude"],
  ["currentLng"],
  ["position", "lng"],
  ["location", "lng"],
  ["coords", "lng"],
  ["coordinate", "lng"],
];

export const deriveCustomerCoordinates = (job) =>
  coordinateFromPaths(job, CUSTOMER_LAT_PATHS, CUSTOMER_LNG_PATHS);

export const deriveDropoffCoordinates = (job) =>
  coordinateFromPaths(job, DROPOFF_LAT_PATHS, DROPOFF_LNG_PATHS);

export const deriveDriverCoordinates = (driver) =>
  coordinateFromPaths(driver, DRIVER_LAT_PATHS, DRIVER_LNG_PATHS);

export { toFiniteNumber };
