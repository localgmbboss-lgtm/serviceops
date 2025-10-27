// src/pages/GuestRequest.jsx
import { useEffect, useRef, useState } from "react";
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

const MAX_MEDIA_IMAGES = 3;
const MAX_MEDIA_VIDEOS = 1;
const MAX_MEDIA_FILES = MAX_MEDIA_IMAGES + MAX_MEDIA_VIDEOS;
const MAX_MEDIA_SIZE = 25 * 1024 * 1024; // 25 MB
const MEDIA_ACCEPT = "image/*,video/*";

/* global google */

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
  const { user, isCustomer } = useAuth();
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

  const [attachments, setAttachments] = useState([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
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

  const navigateAfterSubmit = (result) => {
    if (onSuccess) {
      onSuccess(result, { navigate, formData });
    } else {
      defaultOnSuccess(result);
    }
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

  const formatFileSize = (bytes) => {
    if (!Number.isFinite(bytes)) return "";
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  const describeFileKind = (file) => {
    if (file.type?.startsWith("video/")) return "video";
    if (file.type?.startsWith("image/")) return "image";
    return null;
  };

  const handleMediaChange = (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const currentImages = attachments.filter((item) => item.kind === "image").length;
    const currentVideos = attachments.filter((item) => item.kind === "video").length;
    const availableSlots = MAX_MEDIA_FILES - attachments.length;

    if (availableSlots <= 0) {
      setAttachmentError(
        `You can attach up to ${MAX_MEDIA_IMAGES} images and ${MAX_MEDIA_VIDEOS} video.`
      );
      event.target.value = "";
      return;
    }

    const allowed = [];
    const messages = [];
    let nextImages = currentImages;
    let nextVideos = currentVideos;

    files.forEach((file, index) => {
      if (index >= availableSlots) return;
      const kind = describeFileKind(file);
      if (!kind) {
        messages.push(`${file.name} must be an image or video file.`);
        return;
      }
      if (file.size > MAX_MEDIA_SIZE) {
        messages.push(`${file.name} exceeds the 25 MB limit.`);
        return;
      }
      if (kind === "video") {
        if (nextVideos >= MAX_MEDIA_VIDEOS) {
          messages.push("You can upload only 1 video per request.");
          return;
        }
        nextVideos += 1;
      } else if (kind === "image") {
        if (nextImages >= MAX_MEDIA_IMAGES) {
          messages.push("You can upload up to 3 images per request.");
          return;
        }
        nextImages += 1;
      }
      allowed.push({ file, kind });
    });

    if (files.length > availableSlots) {
      messages.push(
        `Only ${availableSlots} more ${
          availableSlots === 1 ? "file fits" : "files fit"
        }; remove an attachment to add more.`
      );
    }

    if (allowed.length) {
      setAttachments((prev) => [...prev, ...allowed]);
    }

    setAttachmentError(messages.length ? messages.join(" ") : "");
    event.target.value = "";
  };

  const removeAttachment = (index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
    setAttachmentError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const transformer = transformRequest || defaultTransformRequest;
      const payload = transformer(formData);
      const submitFn = submitRequest || defaultSubmitRequest;
      let result;
      if (attachments.length) {
        const formDataPayload = new FormData();
        formDataPayload.append("payload", JSON.stringify(payload));
        attachments.forEach(({ file }) => formDataPayload.append("media", file));
        result = await submitFn(formDataPayload);
      } else {
        result = await submitFn(payload);
      }
      navigateAfterSubmit(result);
      setAttachments([]);
      setAttachmentError("");
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
                  (requireEmail && !formData.email.trim())
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

              <section className="location-card location-card--media">
                <div className="location-card__header">
                  <span className="location-card__eyebrow">Photos & video</span>
                  <h3 className="location-card__title">Share what you see (optional)</h3>
                </div>
                <p className="location-card__helper">
                  You can attach up to 3 images and 1 short video (25 MB max each) to help dispatch understand the situation.
                </p>
                <label className="media-upload-control">
                  <span>Select files</span>
                  <input
                    type="file"
                    accept={MEDIA_ACCEPT}
                    multiple
                    onChange={handleMediaChange}
                  />
                </label>
                {attachmentError ? (
                  <p className="media-upload-error">{attachmentError}</p>
                ) : (
                  !attachments.length && (
                    <p className="media-upload-hint">
                      Add photos of the vehicle, surrounding area, or damage. This step is optional.
                    </p>
                  )
                )}
                {attachments.length > 0 && (
                  <ul className="media-upload-list">
                    {attachments.map((attachment, index) => (
                      <li key={`${attachment.file.name}-${index}`}>
                        <div>
                          <span className="media-upload-name">{attachment.file.name}</span>
                          <span className="media-upload-meta">
                            {attachment.kind === "video" ? "Video · " : ""}
                            {formatFileSize(attachment.file.size)}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="media-upload-remove"
                          onClick={() => removeAttachment(index)}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
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
    </div>
  );
}
