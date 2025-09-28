import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PiLightningBold, PiSteeringWheelBold, PiWrenchBold } from "react-icons/pi";
import { loadGoogleMaps } from "../lib/loadGoogleMaps";
import "./Landing.css";

const DEFAULT_LOCATION_LABEL = "ServiceOps coverage area";

export default function Landing() {
  const [locationLabel, setLocationLabel] = useState("Locating...");
  const [hasGeoError, setHasGeoError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const setFallback = () => {
      if (!cancelled) {
        setLocationLabel(DEFAULT_LOCATION_LABEL);
        setHasGeoError(true);
      }
    };

    if (typeof window === "undefined" || !navigator.geolocation) {
      setFallback();
      return () => {
        cancelled = true;
      };
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await loadGoogleMaps({ libraries: ["places"] });
          if (cancelled) return;
          if (!window.google?.maps?.Geocoder) {
            setFallback();
            return;
          }

          const geocoder = new window.google.maps.Geocoder();
          geocoder.geocode(
            {
              location: {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
              },
            },
            (results, status) => {
              if (cancelled) return;
              if (status !== "OK" || !Array.isArray(results) || !results.length) {
                setFallback();
                return;
              }

              const getComponent = (type) =>
                results[0].address_components.find((c) => c.types.includes(type));

              const city =
                getComponent("locality")?.long_name ||
                getComponent("administrative_area_level_2")?.long_name;
              const state = getComponent("administrative_area_level_1")?.short_name;
              const country = getComponent("country")?.short_name;

              const labelParts = [city, state || country].filter(Boolean);
              if (labelParts.length) {
                setLocationLabel(labelParts.join(", "));
                setHasGeoError(false);
              } else {
                setFallback();
              }
            }
          );
        } catch (error) {
          console.warn("Failed to resolve city", error);
          setFallback();
        }
      },
      () => setFallback(),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 }
    );

    return () => {
      cancelled = true;
    };
  }, []);

  const handleChangeCity = () => {
    const next = window.prompt(
      "Enter your city or service area",
      hasGeoError ? "" : locationLabel
    );
    if (next && next.trim()) {
      setLocationLabel(next.trim());
      setHasGeoError(false);
    }
  };

  const locationIcon = useMemo(() => (hasGeoError ? "?" : "?"), [hasGeoError]);

  return (
    <div className="landing">
      {/* Hero */}
      <section className="hero card hero--ride">
        <div className="hero-left">
          <div className="hero-location" aria-live="polite">
            <span className="hero-location__icon" aria-hidden="true">
              {locationIcon}
            </span>
            <span className="hero-location__city">{locationLabel}</span>
            <button
              type="button"
              className="hero-location__change"
              onClick={handleChangeCity}
            >
              Change city
            </button>
          </div>

          <h1 className="hero-title hero-title--ride">
            Request a ride for <br /> now or later
          </h1>
          <p className="hero-sub hero-sub--ride">
            Add your trip details, hop in, and go.
          </p>

          <div className="hero-form" role="group" aria-label="Ride request">
            <label className="hero-field">
              <span className="hero-field__icon" aria-hidden="true">
                *
              </span>
              <input
                type="text"
                name="pickup"
                placeholder="Enter location"
                aria-label="Enter pickup location"
              />
              <span className="hero-field__suffix" aria-hidden="true">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M7 4l5 5-5 5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </label>
            <label className="hero-field">
              <span className="hero-field__icon hero-field__icon--destination" aria-hidden="true">
                |
              </span>
              <input
                type="text"
                name="destination"
                placeholder="Enter destination"
                aria-label="Enter destination"
              />
            </label>
          </div>

          <div className="hero-actions">
            <Link className="hero-action hero-action--primary" to="/guest/request">
              See prices
            </Link>
            <Link className="hero-action hero-action--ghost" to="/guest/request?schedule=1">
              Schedule for later
            </Link>
          </div>
        </div>

        <div className="hero-right hero-right--ride">
          <div className="hero-right__card">
            <div className="hero-right__badge">Live coverage</div>
            <h3>ServiceOps roadside pros on standby</h3>
            <p className="muted">
              Trusted partners across every major city with real-time tracking.
            </p>
            <div className="hero-right__stats">
              <div>
                <strong>8 min</strong>
                <span className="muted small">Average dispatch</span>
              </div>
              <div>
                <strong>4.9?</strong>
                <span className="muted small">Vendor rating</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="entry-grid">
        <Link className="entry card" to="/customer/login">
          <div className="entry-icon" aria-hidden="true">
            <PiSteeringWheelBold />
          </div>
          <h3>Customer workspace</h3>
          <p className="muted">
            Keep service history, saved vehicles, and payment details together.
          </p>
        </Link>

        <Link className="entry card" to="/vendor/login">
          <div className="entry-icon" aria-hidden="true">
            <PiWrenchBold />
          </div>
          <h3>Vendor dispatch</h3>
          <p className="muted">
            Claim nearby roadside jobs, quote instantly, and keep status updated.
          </p>
        </Link>

        <Link className="entry card" to="/guest/request">
          <div className="entry-icon" aria-hidden="true">
            <PiLightningBold />
          </div>
          <h3>Quick guest request</h3>
          <p className="muted">
            Locked out or stranded? Send details fast and track progress.
          </p>
        </Link>
      </section>

      {/* Features */}
      <section className="features card">
        <div className="feat">
          <div className="feat-icon">*</div>
          <div>
            <h4>Live map tracking</h4>
            <p className="muted">See your driver's ETA and route in real time.</p>
          </div>
        </div>
        <div className="feat">
          <div className="feat-icon">*</div>
          <div>
            <h4>Clear pricing</h4>
            <p className="muted">Compare bids before you choose. No surprises.</p>
          </div>
        </div>
        <div className="feat">
          <div className="feat-icon">*</div>
          <div>
            <h4>Trusted providers</h4>
            <p className="muted">Verified vendors with ratings and on-time records.</p>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="final-cta card">
        <div className="final-left">
          <h2>On the road? We have you covered.</h2>
          <p className="muted">
            Create a request as a guest or sign in to keep everything in one place.
          </p>
        </div>
        <div className="final-right">
          <Link className="btn ghost" to="/guest/request">
            Request as guest
          </Link>
          <Link className="btn primary" to="/customer/login">
            Sign in
          </Link>
        </div>
      </section>
    </div>
  );
}

