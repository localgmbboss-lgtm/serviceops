import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  PiLightningBold,
  PiSteeringWheelBold,
  PiWrenchBold,
  PiClockBold,
  PiShieldCheckBold,
  PiHeadsetBold,
  PiPhoneCallBold,
  PiTruckBold,
} from "react-icons/pi";
import { loadGoogleMaps } from "../lib/loadGoogleMaps";
import img1 from "../images/img1.jpg";
import img2 from "../images/img2.jpg";
import img3 from "../images/img3.jpg";
import img4 from "../images/img4.jpg";
import img5 from "../images/img5.jpg";
import img6 from "../images/img6.jpg";
import "./Landing.css";

const DEFAULT_LOCATION_LABEL = "ServiceOps coverage area";

const aboutParagraphs = [
  "Rapid, damage-free recoveries for passenger, fleet, and specialty vehicles.",
  "Transparent pricing, live updates, and digital paperwork every step of the way.",
];

const aboutHighlights = [
  "Statewide coverage with on-demand vendor bench strength.",
  "Light, medium, and heavy-duty rigs staged for rapid dispatch.",
  "Digital paperwork, photos, and signatures synced to your portal.",
];

const aboutStats = [
  {
    icon: PiClockBold,
    value: "8 min",
    label: "Average dispatch",
    detail: "Peak-hour response across Castle Rock core routes.",
  },
  {
    icon: PiShieldCheckBold,
    value: "45+",
    label: "Certified operators",
    detail: "Background-checked, heavy + light duty specialists.",
  },
  {
    icon: PiHeadsetBold,
    value: "24/7",
    label: "Live command",
    detail: "Text, phone, and portal updates around the clock.",
  },
];

const aboutBadges = [
  { icon: PiLightningBold, label: "Jump starts" },
  { icon: PiWrenchBold, label: "Heavy winch" },
  { icon: PiSteeringWheelBold, label: "Exotic towing" },
  { icon: PiHeadsetBold, label: "Live concierge" },
];

const playbookSteps = [
  {
    title: "Rapid intake",
    caption: "Digital intake captures location, vehicle, and photos in under 60 seconds.",
  },
  {
    title: "Smart match",
    caption: "We ping the closest certified unit with the right rig and recovery tools.",
  },
  {
    title: "Live tracking",
    caption: "Customers and fleets follow the truck on the map with ETA pushes.",
  },
  {
    title: "Secure hand-off",
    caption: "Driver confirms delivery, uploads photos, and the ops desk closes the ticket.",
  },
];

const galleryImages = [
  { src: img1, alt: "Titan Tow Force operator securing a vehicle" },
  { src: img2, alt: "Tow truck staged for a highway recovery" },
  { src: img3, alt: "Roadside assistance preparing equipment" },
  { src: img4, alt: "Heavy-duty tow on a commercial rig" },
  { src: img5, alt: "Driver supporting a customer at night" },
  { src: img6, alt: "Team loading a vehicle safely" },
];

export default function Landing() {
  const [locationLabel, setLocationLabel] = useState("Locating...");
  const [hasGeoError, setHasGeoError] = useState(false);
  const [activeImage, setActiveImage] = useState(0);

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

  const imageCount = galleryImages.length;
  useEffect(() => {
    if (imageCount <= 1) return undefined;
    const timer = setInterval(() => {
      setActiveImage((prev) => (prev + 1) % imageCount);
    }, 6000);
    return () => clearInterval(timer);
  }, [imageCount]);

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

  const locationIcon = useMemo(() => (hasGeoError ? "!" : "@"), [hasGeoError]);

  return (
    <div className="landing">
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
            Towing and roadside help, ready when you are
          </h1>
          <p className="hero-sub hero-sub--ride">
            Titan Tow Force delivers fast dispatch, honest pricing, and certified operators across Castle Rock and the surrounding corridors.
          </p>

          <div className="hero-bullets">
            <span className="pill">Average dispatch 8 minutes</span>
            <span className="pill">24/7 live updates</span>
            <span className="pill">Heavy and light duty</span>
          </div>

          <div className="hero-actions">
            <Link className="hero-action hero-action--primary" to="/guest/request">
              See live pricing
            </Link>
            <Link className="hero-action hero-action--ghost" to="/vendor/login">
              Join the vendor network
            </Link>
          </div>
        </div>

        <div className="hero-right hero-right--ride">
          <div className="hero-photo">
            <img src={galleryImages[activeImage].src} alt={galleryImages[activeImage].alt} />
            <span className="hero-photo__badge">24/7 dispatch desk</span>
          </div>
          <div className="hero-photo__thumbs" aria-label="Service gallery">
            {galleryImages.map((img, idx) => (
              <button
                key={img.src}
                type="button"
                className={`hero-thumb ${idx === activeImage ? "active" : ""}`}
                onClick={() => setActiveImage(idx)}
                aria-label={`Show gallery image ${idx + 1}`}
                data-active={idx === activeImage}
              >
                <img src={img.src} alt="" />
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-about card">
        <div className="landing-about__intro">
          <div className="landing-about__headline">
            <span className="eyebrow">why drivers pick titan</span>
            <h2>About Titan Tow Force</h2>
            <p className="muted">
              Built on honest pricing, dependable equipment, and a crew that treats every customer like family.
            </p>
          </div>
          <div className="landing-about__meta">
            <div className="about-ribbon">
              <strong>500+</strong>
              <span>rescues coordinated every month across Colorado</span>
            </div>
            <ul className="about-highlights">
              {aboutHighlights.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="landing-about__body">
          <div className="landing-about__grid">
            {aboutParagraphs.map((copy, idx) => (
              <article key={idx} className="about-card">
                <span className="about-card__number">0{idx + 1}</span>
                <p>{copy}</p>
              </article>
            ))}
            <div className="about-motion">
              <div className="about-motion__track">
                {[...aboutBadges, ...aboutBadges].map(({ icon: Icon, label }, idx) => (
                  <span key={`${label}-${idx}`} className="about-badge">
                    <Icon aria-hidden="true" />
                    {label}
                  </span>
                ))}
              </div>
            </div>
            <div className="about-visual" aria-hidden="true">
              <div className="about-visual__road">
                <span className="about-visual__label about-visual__label--start">Castle Rock</span>
                <span className="about-visual__label about-visual__label--mid">I-25 Corridor</span>
                <span className="about-visual__label about-visual__label--end">Denver Metro</span>
                <div className="about-visual__vehicle">
                  <PiTruckBold />
                </div>
                <div className="about-visual__pulse"></div>
              </div>
            </div>
          </div>
        </div>

        <div className="landing-about__panel landing-about__panel--wide">
          <div className="panel-metrics">
            {aboutStats.map(({ icon: Icon, value, label, detail }) => (
              <article key={label} className="about-stat">
                <div className="about-stat__icon" aria-hidden="true">
                  <Icon />
                </div>
                <div>
                  <strong className="about-stat__value">{value}</strong>
                  <span className="about-stat__label">{label}</span>
                  <p className="about-stat__detail">{detail}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="panel-playbook">
            <h4>Dispatch playbook</h4>
            <ol>
              {playbookSteps.map((step, idx) => (
                <li key={step.title}>
                  <span className="about-step">{idx + 1}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.caption}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="panel-contact">
            <span className="about-contact__icon" aria-hidden="true">
              <PiPhoneCallBold />
            </span>
            <div>
              <strong>Fleet manager?</strong>
              <p>
                Call <a href="tel:+13039005503">303-900-5503</a> for priority contracts, staging, and monthly reporting.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-gallery card">
        <div className="landing-gallery__head">
          <h3>On the road with our team</h3>
          <p className="muted">
            A look at recent recoveries and roadside assists from the Titan Tow Force crew.
          </p>
        </div>
        <div className="landing-gallery__grid">
          {galleryImages.map((img) => (
            <figure key={img.src} className="landing-gallery__item">
              <img src={img.src} alt={img.alt} loading="lazy" />
            </figure>
          ))}
        </div>
      </section>

      <section className="entry-grid">
        <Link className="entry card" to="/customer/login">
          <div className="entry-icon" aria-hidden="true">
            <PiSteeringWheelBold />
          </div>
          <h3>Customer workspace</h3>
          <p className="muted">
            Follow live jobs, store vehicle details, and access past invoices in seconds.
          </p>
        </Link>

        <Link className="entry card" to="/vendor/login">
          <div className="entry-icon" aria-hidden="true">
            <PiWrenchBold />
          </div>
          <h3>Vendor dispatch</h3>
          <p className="muted">
            Claim nearby jobs, share live ETAs, and keep your payouts organized.
          </p>
        </Link>

        <Link className="entry card" to="/guest/request">
          <div className="entry-icon" aria-hidden="true">
            <PiLightningBold />
          </div>
          <h3>Quick guest request</h3>
          <p className="muted">
            Locked out or stranded? Submit your details and track the truck on the way.
          </p>
        </Link>
      </section>

      <section className="features card">
        <div className="feat">
          <div className="feat-icon">+</div>
          <div>
            <h4>Live map tracking</h4>
            <p className="muted">Share real-time ETAs with your family, team, or insurer.</p>
          </div>
        </div>
        <div className="feat">
          <div className="feat-icon">+</div>
          <div>
            <h4>Nationwide partners</h4>
            <p className="muted">Trusted operators backed by Titan Tow Force standards.</p>
          </div>
        </div>
        <div className="feat">
          <div className="feat-icon">+</div>
          <div>
            <h4>Customer-first support</h4>
            <p className="muted">Talk to a dispatcher any time you need quick answers.</p>
          </div>
        </div>
      </section>

      <section className="final-cta card">
        <div className="final-left">
          <h2>Need a truck right now?</h2>
          <p className="muted">
            Start a request online or call 303-900-5503 for direct dispatch with Titan Tow Force.
          </p>
        </div>
        <div className="final-right">
          <a className="btn ghost" href="tel:+13039005503">
            Call 303-900-5503
          </a>
          <Link className="btn primary" to="/guest/request">
            Start a request
          </Link>
        </div>
      </section>
    </div>
  );
}
