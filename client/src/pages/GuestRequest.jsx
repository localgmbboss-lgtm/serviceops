// src/pages/GuestRequest.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { loadGoogleMaps } from "../lib/loadGoogleMaps";
import { LuMapPin, LuNavigation } from "react-icons/lu";
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

const normalizePhoneValue = (input = "") => {
  const t = String(input).trim();
  if (!t) return "";
  return t.startsWith("+")
    ? "+" + t.slice(1).replace(/\D+/g, "")
    : t.replace(/\D+/g, "");
};

const PROFILE_KEYS = [
  "name",
  "phone",
  "email",
  "address",
  "vehicleMake",
  "vehicleModel",
  "vehicleColor",
];

const LOCATION_METHOD_OPTIONS = [
  {
    value: "current",
    label: "Use current location",
    helper: "Auto-detect from phone",
    icon: LuNavigation,
  },
  {
    value: "manual",
    label: "Enter address manually",
    helper: "Type address yourself",
    icon: LuMapPin,
  },
];

const LocationMethodPrompt = ({ value, onChange }) => {
  return (
    <div className="pickup-method-card">
      <div className="pickup-method-card__header">
        <h3>Where should we meet you?</h3>
        <p>Pick how you'd like to set the pickup spot.</p>
      </div>
      <div className="pickup-method-card__options">
        {LOCATION_METHOD_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isActive = option.value === value;

          return (
            <button
              type="button"
              key={option.value}
              className={`pickup-method-card__option ${isActive ? "is-active" : ""}`}
              onClick={() => onChange(option.value)}
            >
              <span className="pickup-method-card__icon" aria-hidden="true">
                <Icon />
              </span>
              <div className="pickup-method-card__text">
                <span className="pickup-method-card__label">{option.label}</span>
                <span className="pickup-method-card__helper">{option.helper}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};


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
  const navigate = useNavigate();
  const { user, token, isCustomer, login } = useAuth();
  const [formData, setFormData] = useState(() => ({
    ...DEFAULT_GUEST_FORM,
    ...initialValues,
  }));

  useEffect(() => {
    if (formData.locationType === "map") {
      setFormData((prev) => ({ ...prev, locationType: "manual" }));
    }
  }, [formData.locationType]);
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
  useEffect(() => {
    if (!isCustomer || !user?.savedProfile) return;
    const profile = user.savedProfile;
    setFormData((prev) => {
      const hasUserInput = PROFILE_KEYS.some(
        (key) => (prev[key] || "").trim()
      );
      if (hasUserInput) return prev;
      return {
        ...prev,
        name: profile.name || prev.name,
        email: profile.email || prev.email,
        phone: profile.phone || prev.phone,
        address: profile.address || prev.address,
        vehicleMake: profile.vehicleMake || prev.vehicleMake,
        vehicleModel: profile.vehicleModel || prev.vehicleModel,
        vehicleColor: profile.vehicleColor || prev.vehicleColor,
      };
    });
  }, [isCustomer, user?.savedProfile]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [pendingResult, setPendingResult] = useState(null);
  const pendingSnapshot = pendingResult?.snapshot || {};
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

  const buildProfileSnapshot = (data) => ({
    name: (data.name || "").trim(),
    email: (data.email || "").trim(),
    phone: normalizePhoneValue(data.phone),
    phoneDisplay: (data.phone || "").trim(),
    address: (data.address || "").trim(),
    vehicleMake: (data.vehicleMake || "").trim(),
    vehicleModel: (data.vehicleModel || "").trim(),
    vehicleColor: (data.vehicleColor || "").trim(),
  });

  const navigateAfterSubmit = (result) => {
    if (onSuccess) {
      onSuccess(result, { navigate, formData });
    } else {
      defaultOnSuccess(result);
    }
  };

  const shouldPromptToSave = (snapshot) => {
    if (!isCustomer || !token) return false;
    if (!snapshot.phone || !snapshot.name) return false;
    const hasVehicle =
      snapshot.vehicleMake && snapshot.vehicleModel && snapshot.vehicleColor;
    if (!hasVehicle) return false;
    const saved = user?.savedProfile || {};
    if (!saved || !Object.keys(saved).length) return true;
    return PROFILE_KEYS.some(
      (key) => (snapshot[key] || "") !== (saved[key] || "")
    );
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
      const snapshot = buildProfileSnapshot(formData);
      if (shouldPromptToSave(snapshot)) {
        setPendingResult({ result, snapshot });
        setShowSavePrompt(true);
      } else {
        navigateAfterSubmit(result);
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

  const handleSaveProfile = async () => {
    if (!pendingResult) return;
    setProfileBusy(true);
    try {
      const { snapshot, result } = pendingResult;
      const payload = {
        name: snapshot.name,
        email: snapshot.email,
        phone: snapshot.phone,
        address: snapshot.address,
        vehicleMake: snapshot.vehicleMake,
        vehicleModel: snapshot.vehicleModel,
        vehicleColor: snapshot.vehicleColor,
      };
      const { data } = await api.put("/api/customer/auth/profile", payload);
      if (data?.customer) {
        const updated = {
          ...(user || {}),
          ...data.customer,
          role: user?.role || "customer",
        };
        login(updated, token);
      }
      setShowSavePrompt(false);
      setPendingResult(null);
      navigateAfterSubmit(result);
    } catch (error) {
      alert(
        error?.response?.data?.message ||
          error?.message ||
          "Unable to save your info right now"
      );
    } finally {
      setProfileBusy(false);
    }
  };

  const handleSkipSave = () => {
    if (pendingResult) {
      const { result } = pendingResult;
      setPendingResult(null);
      navigateAfterSubmit(result);
    }
    setShowSavePrompt(false);
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

            <div className="location-stage">
              <section className="location-card location-card--method">
                <LocationMethodPrompt
                  value={formData.locationType}
                  onChange={handleLocationTypeChange}
                />
              </section>

              <section className="location-card location-card--pickup">
                <div className="location-card__header">
                  <span className="location-card__eyebrow">Pickup</span>
                  <h3 className="location-card__title">Where's the vehicle?</h3>
                </div>
                {formData.locationType === "current" ? (
                  <div className="pickup-current">
                    <p className="pickup-current__status">
                      {formData.address
                        ? formData.address
                        : "Tap the button below and we'll use your phone to detect the vehicle's location."}
                    </p>
                    <button
                      type="button"
                      className="btn btn-dark"
                      onClick={getCurrentLocation}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "Detecting..." : "Use current location"}
                    </button>
                    <button
                      type="button"
                      className="pickup-current__manual"
                      onClick={() => handleLocationTypeChange("manual")}
                    >
                      Enter address manually
                    </button>
                  </div>
                ) : (
                  <GoogleMapsAutocomplete
                    onPlaceSelected={(place) => handlePlaceSelected(place, false)}
                    placeholder="Enter your vehicle's full address..."
                    value={formData.address}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, address: e.target.value }))
                    }
                  />
                )}
                {formData.address && (
                  <div className="pickup-confirmation">
                    <span className="pickup-confirmation__label">Selected pickup</span>
                    <p>{formData.address}</p>
                  </div>
                )}
              </section>

              <section className="location-card location-card--destination">
                <div className="location-card__header">
                  <span className="location-card__eyebrow">Destination</span>
                  <h3 className="location-card__title">Where should we take it?</h3>
                </div>
                <GoogleMapsAutocomplete
                  onPlaceSelected={(place) => handlePlaceSelected(place, true)}
                  placeholder="Drop-off or preferred shop (optional)"
                  value={formData.destination}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, destination: e.target.value }))
                  }
                  isDestination
                />
                {formData.address && formData.destination && (
                  <DistanceCalculator
                    origin={formData.address}
                    destination={formData.destination}
                    onDistanceCalculated={handleDistanceCalculated}
                  />
                )}
              </section>

              <section className="location-card location-card--vehicle">
                <div className="location-card__header">
                  <span className="location-card__eyebrow">Vehicle details</span>
                  <h3 className="location-card__title">Help the operator spot it</h3>
                </div>
                <div className="vehicle-form-grid">
                  <div className="vehicle-field">
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
                  <div className="vehicle-field">
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
                  <div className="vehicle-field">
                    <label htmlFor="vehicleColor">Vehicle Color *</label>
                    <input
                      id="vehicleColor"
                      name="vehicleColor"
                      value={formData.vehicleColor}
                      onChange={handleChange}
                      required
                      placeholder="Black, Silver, etc."
                    />
                  </div>
                </div>
              </section>
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
      {showSavePrompt && pendingResult && (
        <div className="save-profile-overlay" role="dialog" aria-modal="true">
          <div className="save-profile-modal">
            <h3>Save these details for next time?</h3>
            <p className="muted small">
              We can pre-fill your next request with the same contact and vehicle info.
            </p>
            <ul className="save-profile-list">
              {pendingSnapshot.name && (
                <li>
                  <span className="label">Name</span>
                  <span>{pendingSnapshot.name}</span>
                </li>
              )}
              {(pendingSnapshot.phoneDisplay || pendingSnapshot.phone) && (
                <li>
                  <span className="label">Phone</span>
                  <span>{pendingSnapshot.phoneDisplay || pendingSnapshot.phone}</span>
                </li>
              )}
              {pendingSnapshot.email && (
                <li>
                  <span className="label">Email</span>
                  <span>{pendingSnapshot.email}</span>
                </li>
              )}
              {pendingSnapshot.address && (
                <li>
                  <span className="label">Address</span>
                  <span>{pendingSnapshot.address}</span>
                </li>
              )}
              {(pendingSnapshot.vehicleMake ||
                pendingSnapshot.vehicleModel ||
                pendingSnapshot.vehicleColor) && (
                <li>
                  <span className="label">Vehicle</span>
                  <span>
                    {[pendingSnapshot.vehicleMake, pendingSnapshot.vehicleModel, pendingSnapshot.vehicleColor]
                      .filter(Boolean)
                      .join(" ")}
                  </span>
                </li>
              )}
            </ul>
            <div className="save-profile-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleSkipSave}
                disabled={profileBusy}
              >
                Not now
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveProfile}
                disabled={profileBusy}
              >
                {profileBusy ? "Saving..." : "Save info"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}









