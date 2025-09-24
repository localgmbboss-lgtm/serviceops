// src/pages/GuestRequest.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { loadGoogleMaps } from "../lib/loadGoogleMaps";
import "./GuestRequest.css";

const SERVICE_SUGGESTIONS = [
  "Towing",
  "Jump Start",
  "Flat Tire",
  "Lockout",
  "Fuel Delivery",
  "Winching",
  "Heavy Duty",
  "Battery Replacement",
  "Roadside Assistance",
];

/* global google */

const DEFAULT_GUEST_FORM = {
  name: "",
  email: "",
  phone: "",
  serviceType: "",
  description: "",
  address: "",
  urgency: "emergency",
  locationType: "manual",
  coordinates: null,
  vehicleMake: "",
  vehicleModel: "",
  vehicleColor: "",
  destination: "",
  destinationCoordinates: null,
  distanceInfo: null,
};

// ---------- Google Maps Autocomplete (Uber-style) ----------
const GoogleMapsAutocomplete = ({
  onPlaceSelected,
  placeholder,
  value,
  onChange,
  isDestination = false,
}) => {
  const inputRef = useRef(null);
  const acRef = useRef(null);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    let disposed = false;

    (async () => {
      try {
        await loadGoogleMaps({ libraries: ["places"] });
        if (disposed) return;
        setMapsLoaded(true);

        if (!inputRef.current || !google?.maps?.places?.Autocomplete) return;

        acRef.current = new google.maps.places.Autocomplete(inputRef.current, {
          types: ["geocode"],
          componentRestrictions: { country: "us" },
          fields: [
            "formatted_address",
            "geometry",
            "name",
            "address_components",
          ],
        });

        acRef.current.addListener("place_changed", () => {
          const place = acRef.current.getPlace();
          if (place && place.geometry) {
            onPlaceSelected(place, isDestination);
          }
        });
      } catch {
        if (!disposed) setUseFallback(true);
      }
    })();

    return () => {
      disposed = true;
      if (acRef.current && google?.maps?.event?.clearInstanceListeners) {
        google.maps.event.clearInstanceListeners(acRef.current);
      }
      acRef.current = null;
    };
  }, [onPlaceSelected, isDestination]);

  if (useFallback) {
    return (
      <div className="location-input-container">
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder || "Enter address manually"}
          className="location-input"
          value={value}
          onChange={onChange}
        />
        <div className="maps-fallback-notice">
          <small>Maps unavailable. Please enter address manually.</small>
        </div>
      </div>
    );
  }

  return (
    <div className="location-input-container">
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        className="location-input"
        value={value}
        onChange={onChange}
      />
      {!mapsLoaded && <div className="maps-loading">Loading maps...</div>}
    </div>
  );
};

// ---------- Interactive Map (Uber-style) ----------
const InteractiveMap = ({ onLocationSelect, initialLocation }) => {
  const mapRef = useRef(null);
  const mapInstRef = useRef(null);
  const markerRef = useRef(null);
  const geocoderRef = useRef(null);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    let disposed = false;

    (async () => {
      try {
        await loadGoogleMaps({ libraries: ["places", "geometry"] });
        if (disposed) return;
        setMapsLoaded(true);

        if (!mapRef.current) return;

        const center = initialLocation || { lat: 40.7128, lng: -74.006 };
        mapInstRef.current = new google.maps.Map(mapRef.current, {
          center,
          zoom: 14,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: true,
          zoomControlOptions: {
            position: google.maps.ControlPosition.RIGHT_CENTER,
          },
          styles: [
            {
              featureType: "all",
              elementType: "labels",
              stylers: [{ visibility: "on" }],
            },
            {
              featureType: "administrative",
              elementType: "labels",
              stylers: [{ visibility: "off" }],
            },
          ],
        });

        geocoderRef.current = new google.maps.Geocoder();

        markerRef.current = new google.maps.Marker({
          map: mapInstRef.current,
          position: center,
          draggable: true,
          title: "Vehicle Location",
          animation: google.maps.Animation.DROP,
          icon: {
            url: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJDNy41ODYgMiA0IDUuNTg2IDQgMTBDNCAxNC40MTQgNy41ODYgMTggMTIgMThDMTYuNDE0IDE4IDIwIDE0LjQxNCAyMCAxMEMyMCA1LjU4NiAxNi40MTQgMiAxMiAyWk0xMiAxMkMxMC44OTcgMTIgMTAgMTEuMTAzIDEwIDEwQzEwIDguODk3IDEwLjg5NyA4IDEyIDhDMTMuMTAzIDggMTQgOC44OTcgMTQgMTBDMTQgMTEuMTAzIDEzLjEwMyAxMiAxMiAxMloiIGZpbGw9IiMwMDdBRkYiLz4KPC9zdmc+",
            scaledSize: new google.maps.Size(32, 32),
            anchor: new google.maps.Point(16, 32),
          },
        });

        // Info window to show address
        const infoWindow = new google.maps.InfoWindow();

        const updateLocation = (position) => {
          if (!geocoderRef.current) return;

          geocoderRef.current.geocode(
            { location: position },
            (results, status) => {
              if (status === "OK" && results?.[0]) {
                const fullAddress = results[0].formatted_address;
                onLocationSelect(position, fullAddress);

                // Show address in info window
                infoWindow.setContent(`
                  <div style="padding: 8px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
                    <strong>Selected Location:</strong><br>
                    ${fullAddress}
                  </div>
                `);
                infoWindow.open(mapInstRef.current, markerRef.current);
              } else {
                const latLngAddress = `${position.lat().toFixed(6)}, ${position
                  .lng()
                  .toFixed(6)}`;
                onLocationSelect(position, latLngAddress);
              }
            }
          );
        };

        mapInstRef.current.addListener("click", (e) => {
          const pos = e.latLng;
          markerRef.current.setPosition(pos);
          updateLocation(pos);
        });

        markerRef.current.addListener("dragend", () => {
          const pos = markerRef.current.getPosition();
          updateLocation(pos);
        });

        // Initialize with current position if available
        if (initialLocation) {
          const pos = new google.maps.LatLng(
            initialLocation.lat,
            initialLocation.lng
          );
          updateLocation(pos);
        }
      } catch {
        if (!disposed) setUseFallback(true);
      }
    })();

    return () => {
      disposed = true;
      if (mapInstRef.current && google?.maps?.event?.clearInstanceListeners) {
        google.maps.event.clearInstanceListeners(mapInstRef.current);
      }
      mapInstRef.current = null;
      markerRef.current = null;
    };
  }, [onLocationSelect, initialLocation]);

  if (useFallback) {
    return (
      <div className="map-fallback">
        <div className="map-fallback-content">
          <div className="map-fallback-icon">[map]</div>
          <h3>Map Not Available</h3>
          <p>Please use the address inputs or Current Location instead.</p>
          <p className="map-error-detail">Check your Google Maps API key.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="map-container">
      <div ref={mapRef} className="interactive-map" />
      {!mapsLoaded && (
        <div className="maps-loading-overlay">
          <div className="maps-loading-spinner" />
          <p>Loading map...</p>
        </div>
      )}
    </div>
  );
};

// ---------- Location Type Selector ----------
const LocationTypeSelector = ({ selectedType, onTypeChange }) => {
  const options = useMemo(
    () => [
      { id: "current", label: "Current Location", icon: "[GPS]" },
      { id: "map", label: "Select on Map", icon: "[Map]" },
      { id: "manual", label: "Enter Address", icon: "[Manual]" },
    ],
    []
  );

  return (
    <div className="location-type-selector">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`location-option ${
            selectedType === o.id ? "selected" : ""
          }`}
          onClick={() => onTypeChange(o.id)}
        >
          <span className="option-icon">{o.icon}</span>
          <span className="option-label">{o.label}</span>
        </button>
      ))}
    </div>
  );
};

// ---------- Distance Calculator ----------
const DistanceCalculator = ({ origin, destination, onDistanceCalculated }) => {
  const [distance, setDistance] = useState(null);
  const [duration, setDuration] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let disposed = false;

    (async () => {
      if (!origin || !destination) return;
      try {
        await loadGoogleMaps({ libraries: ["places"] });
        if (disposed) return;

        if (!google?.maps?.DistanceMatrixService) {
          setError("Distance calculation not available");
          return;
        }

        const svc = new google.maps.DistanceMatrixService();
        svc.getDistanceMatrix(
          {
            origins: [origin],
            destinations: [destination],
            travelMode: google.maps.TravelMode.DRIVING,
            unitSystem: google.maps.UnitSystem.IMPERIAL,
          },
          (resp, status) => {
            if (disposed) return;
            if (status !== "OK") {
              setError("Error calculating distance");
              return;
            }
            const el = resp?.rows?.[0]?.elements?.[0];
            if (!el || el.status !== "OK") {
              setError("Could not calculate route");
              return;
            }
            setError(null);
            setDistance(el.distance.text);
            setDuration(el.duration.text);
            onDistanceCalculated?.({
              distance: el.distance.text,
              duration: el.duration.text,
              meters: el.distance.value,
              seconds: el.duration.value,
            });
          }
        );
      } catch {
        if (!disposed) setError("Error calculating distance");
      }
    })();

    return () => {
      disposed = true;
    };
  }, [origin, destination, onDistanceCalculated]);

  if (!origin || !destination) return null;

  return (
    <div className="distance-info">
      <h4>Distance Information</h4>
      {error ? (
        <p className="distance-error">{error}</p>
      ) : distance && duration ? (
        <div className="distance-details">
          <p>
            <strong>Distance:</strong> {distance}
          </p>
          <p>
            <strong>Estimated Travel Time:</strong> {duration}
          </p>
        </div>
      ) : (
        <p>Calculating distance...</p>
      )}
    </div>
  );
};

// ---------- Page: GuestRequest ----------
export default function GuestRequest({
  heading = "Create Service Request",
  subtitle = "Get help without creating an account",
  initialValues = {},
  transformRequest,
  submitRequest,
  onSuccess,
  requireEmail = true,
} = {}) {
  const [formData, setFormData] = useState(() => ({
    ...DEFAULT_GUEST_FORM,
    ...initialValues,
  }));
  const initialAppliedRef = useRef(false);
  useEffect(() => {
    if (!initialValues || initialAppliedRef.current) return;
    const hasValues = Object.values(initialValues).some(
      (value) => value !== undefined && value !== null && value !== ""
    );
    if (!hasValues) return;
    setFormData((prev) => ({ ...prev, ...initialValues }));
    initialAppliedRef.current = true;
  }, [initialValues]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const navigate = useNavigate();
  const defaultTransformRequest = (data) => ({
    ...data,
    name: data.name.trim(),
    email: data.email.trim(),
    phone: data.phone.trim(),
    serviceType: data.serviceType.trim(),
  });

  const defaultSubmitRequest = async (payload) => {
    const { data } = await api.post("/api/jobs/guest", payload);
    return data;
  };

  const defaultOnSuccess = (result) => {
    if (result?.jobToken) {
      navigate(`/choose/${result.jobToken}`);
      return;
    }
    if (result?.customerToken) {
      navigate(`/choose/${result.customerToken}`);
      return;
    }
    navigate("/");
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((p) => ({ ...p, [name]: value }));
  };

  const handlePlaceSelected = (place, isDestination = false) => {
    const address = place.formatted_address;
    const loc = place.geometry.location;

    if (isDestination) {
      setFormData((p) => ({
        ...p,
        destination: address,
        destinationCoordinates: { lat: loc.lat(), lng: loc.lng() },
      }));
    } else {
      setFormData((p) => ({
        ...p,
        address,
        coordinates: { lat: loc.lat(), lng: loc.lng() },
      }));
    }
  };

  const handleMapLocationSelect = (position, address = null) => {
    setFormData((p) => ({
      ...p,
      coordinates: { lat: position.lat(), lng: position.lng() },
      address: address || p.address,
    }));
  };

  const handleDistanceCalculated = (distanceInfo) => {
    setFormData((p) => ({ ...p, distanceInfo }));
  };

  // Update the getCurrentLocation function to get the full address
  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by this browser.");
      return;
    }

    setIsSubmitting(true);

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const { latitude, longitude } = coords;

        try {
          // Load Google Maps if not already loaded
          await loadGoogleMaps({ libraries: ["geocoding"] });

          if (window.google && window.google.maps) {
            const geocoder = new window.google.maps.Geocoder();
            const latLng = new window.google.maps.LatLng(latitude, longitude);

            geocoder.geocode({ location: latLng }, (results, status) => {
              setIsSubmitting(false);

              if (status === "OK" && results[0]) {
                const fullAddress = results[0].formatted_address;
                setFormData((p) => ({
                  ...p,
                  coordinates: { lat: latitude, lng: longitude },
                  address: fullAddress,
                }));
              } else {
                // Fallback if geocoding fails
                setFormData((p) => ({
                  ...p,
                  coordinates: { lat: latitude, lng: longitude },
                  address: "Current Location (Address not available)",
                }));
              }
            });
          }
        } catch (error) {
          setIsSubmitting(false);
          alert(
            "Unable to get your current location address. Please enter address manually."
          );
        }
      },
      (error) => {
        setIsSubmitting(false);
        alert(
          "Unable to get your current location. Please enter address manually."
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      }
    );
  };

  // Update the handleLocationTypeChange function
  const handleLocationTypeChange = (type) => {
    setFormData((p) => ({ ...p, locationType: type }));
    if (type === "current") getCurrentLocation();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const transformer = transformRequest || defaultTransformRequest;
      const payload = transformer(formData);
      const submitFn = submitRequest || defaultSubmitRequest;
      const result = await submitFn(payload);
      if (onSuccess) {
        onSuccess(result, { navigate, formData });
      } else {
        defaultOnSuccess(result);
      }
    } catch (err) {
      console.error(err);
      const message =
        err?.response?.data?.message || err?.message ||
        "Failed to create request. Try again.";
      alert(message);
    } finally {
      setIsSubmitting(false);
    }

  };


  const nextStep = () => setCurrentStep((s) => s + 1);
  const prevStep = () => setCurrentStep((s) => s - 1);

  return (
    <div className="guest-request-container">
      <div className="request-header">
        <h1>{heading}</h1>
        <p className="subtitle">{subtitle}</p>

        <div className="progress-indicator">
          <div className={`step ${currentStep >= 1 ? "active" : ""}`}>
            <span className="step-number">1</span>
            <span className="step-label">Your Info</span>
          </div>
          <div className="step-connector" />
          <div className={`step ${currentStep >= 2 ? "active" : ""}`}>
            <span className="step-number">2</span>
            <span className="step-label">Service Details</span>
          </div>
          <div className="step-connector" />
          <div className={`step ${currentStep >= 3 ? "active" : ""}`}>
            <span className="step-number">3</span>
            <span className="step-label">Location & Vehicle</span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="request-form">
        {currentStep === 1 && (
          <div className="form-step">
            <h2>Your Contact Information</h2>
            <p className="step-description">
              We'll use this to update you on your service request
            </p>

            <div className="form-grid">
              <div className="input-group">
                <label htmlFor="name">Full Name *</label>
                <input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Jane Doe"
                  required
                />
              </div>

              <div className="input-group">
                <label htmlFor="phone">Phone *</label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="(555) 123-4567"
                  required
                />
              </div>

              {!requireEmail && formData.email ? (
                <div className="input-group">
                  <label>Account email</label>
                  <div className="static-field">{formData.email}</div>
                </div>
              ) : null}

              {requireEmail ? (
                <div className="input-group">
                  <label htmlFor="email">Email *</label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="you@example.com"
                    required
                  />
                </div>
              ) : null}
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={nextStep}
                disabled={
                  isSubmitting ||
                  !formData.name.trim() ||
                  !formData.phone.trim() ||
                  !formData.email.trim()
                }
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="form-step">
            <h2>Service Details</h2>
            <p className="step-description">
              Tell us what happened so we can match the right help.
            </p>

            <div className="form-grid">
              <div className="input-group">
                <label htmlFor="serviceType">Service Type *</label>
                <input
                  id="serviceType"
                  name="serviceType"
                  value={formData.serviceType}
                  onChange={handleChange}
                  placeholder="e.g. Towing, Winch out"
                  list="guest-service-options"
                  required
                />
                <datalist id="guest-service-options">
                  {SERVICE_SUGGESTIONS.map((opt) => (
                    <option key={opt} value={opt} />
                  ))}
                </datalist>
              </div>

              <div className="input-group">
                <label htmlFor="urgency">Urgency *</label>
                <div className="urgency-options">
                  {[
                    {
                      value: "emergency",
                      label: "Emergency",
                      desc: "Immediately",
                    },
                    { value: "urgent", label: "Urgent", desc: "Within 1 hour" },
                    {
                      value: "standard",
                      label: "Standard",
                      desc: "Within 4 hours",
                    },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`urgency-option ${
                        formData.urgency === opt.value ? "selected" : ""
                      }`}
                      onClick={() =>
                        setFormData((p) => ({ ...p, urgency: opt.value }))
                      }
                    >
                      <span className="urgency-label">{opt.label}</span>
                      <span className="urgency-desc">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="input-group full-width">
                <label htmlFor="description">Problem Description *</label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows="4"
                  required
                  placeholder="Please describe the issue in detail..."
                />
              </div>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={prevStep}
                disabled={isSubmitting}
              >
                Back
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={nextStep}
                disabled={
                  isSubmitting ||
                  !formData.serviceType.trim() ||
                  !formData.description.trim()
                }
              >
                Continue
              </button>
            </div>
          </div>
        )}
        {currentStep === 3 && (
          <div className="form-step">
            <h2>Location & Vehicle Information</h2>
            <p className="step-description">
              Where is your vehicle and what are its details?
            </p>

            <LocationTypeSelector
              selectedType={formData.locationType}
              onTypeChange={handleLocationTypeChange}
            />

            {formData.locationType === "manual" && (
              <div className="input-group full-width">
                <label>Vehicle Location (Pickup Address) *</label>
                <GoogleMapsAutocomplete
                  onPlaceSelected={(place) => handlePlaceSelected(place, false)}
                  placeholder="Enter your vehicle's full address..."
                  value={formData.address}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, address: e.target.value }))
                  }
                />
              </div>
            )}

            {formData.locationType === "map" && (
              <div className="map-selection">
                <p>
                  Click on the map to set your vehicle location. The full
                  address will be automatically detected.
                </p>
                <InteractiveMap
                  onLocationSelect={handleMapLocationSelect}
                  initialLocation={formData.coordinates}
                />
              </div>
            )}

            <div className="form-grid">
              <div className="input-group">
                <label htmlFor="vehicleMake">Vehicle Make *</label>
                <input
                  id="vehicleMake"
                  name="vehicleMake"
                  value={formData.vehicleMake}
                  onChange={handleChange}
                  required
                  placeholder="Toyota, Ford, etc."
                />
              </div>

              <div className="input-group">
                <label htmlFor="vehicleModel">Vehicle Model *</label>
                <input
                  id="vehicleModel"
                  name="vehicleModel"
                  value={formData.vehicleModel}
                  onChange={handleChange}
                  required
                  placeholder="Camry, F-150, etc."
                />
              </div>

              <div className="input-group">
                <label htmlFor="vehicleColor">Vehicle Color *</label>
                <input
                  id="vehicleColor"
                  name="vehicleColor"
                  value={formData.vehicleColor}
                  onChange={handleChange}
                  required
                  placeholder="Red, Blue, Black, etc."
                />
              </div>
            </div>

            <div className="input-group full-width">
              <label htmlFor="destination">
                Destination Address (Optional)
              </label>
              <GoogleMapsAutocomplete
                onPlaceSelected={(place) => handlePlaceSelected(place, true)}
                placeholder="Where should the vehicle be taken? (optional)"
                value={formData.destination}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, destination: e.target.value }))
                }
                isDestination
              />
            </div>

            {formData.address && formData.destination && (
              <DistanceCalculator
                origin={formData.address}
                destination={formData.destination}
                onDistanceCalculated={handleDistanceCalculated}
              />
            )}

            {formData.address && (
              <div className="selected-address">
                <h4>Selected Pickup Address:</h4>
                <p>{formData.address}</p>
              </div>
            )}

            <div className="form-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={prevStep}
                disabled={isSubmitting}
              >
                Back
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={
                  isSubmitting ||
                  !formData.address ||
                  !formData.vehicleMake ||
                  !formData.vehicleModel ||
                  !formData.vehicleColor
                }
              >
                {isSubmitting ? (
                  <>
                    <div className="spinner" />
                    Submitting...
                  </>
                ) : (
                  <>Submit Request</>
                )}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}















