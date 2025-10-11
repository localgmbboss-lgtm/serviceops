import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  PiSteeringWheelBold,
  PiWrenchBold,
  PiClockBold,
  PiShieldCheckBold,
  PiHeadsetBold,
  PiPhoneCallBold,
  PiStarBold,
  PiToolboxBold,
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
  "Same-day vendor payouts with digital invoicing and status tracking that closes every loop.",
  "Dedicated escalation desk and recovery specialists on-call whenever a job needs extra muscle.",
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

const readinessHighlights = [
  {
    icon: PiToolboxBold,
    title: "Fully equipped rigs",
    body: "Wheel lifts, dollies, winch lines, and battery packs loaded for every call.",
  },
  {
    icon: PiStarBold,
    title: "QA checklists",
    body: "Hook-up, photo, and torque confirmations logged before the ticket closes.",
  },
  {
    icon: PiShieldCheckBold,
    title: "Safety-first culture",
    body: "Night visibility kits and securement training refreshed every quarter.",
  },
];

const aboutSpotlights = [
  {
    id: "dispatch",
    label: "Rapid dispatch",
    metric: "2m 11s",
    metricLabel: "first vendor acceptance",
    title: "Rapid dispatch coverage",
    description:
      "Smart routing pings the closest certified truck and keeps escalating until a rig is locked in.",
    bullets: [
      "Bench vendors auto-notified if the closest unit declines.",
      "Ops desk escalates the job at the 90-second mark.",
    ],
  },
  {
    id: "quality",
    label: "Damage-free ops",
    metric: "99.8%",
    metricLabel: "jobs closed without claims",
    title: "Damage-free recoveries",
    description:
      "Every recovery flows through a digital checklist so we document photos, torque specs, and signatures.",
    bullets: [
      "Operators upload hook-up and drop-off photos before closing.",
      "Claims workflow triggers instantly if anything looks off.",
    ],
  },
  {
    id: "visibility",
    label: "Live visibility",
    metric: "120 mi",
    metricLabel: "live-tracked radius",
    title: "Customer visibility",
    description:
      "Live telemetry keeps families, fleets, and insurers in the loop from hook to drop.",
    bullets: [
      "Customer status pages refresh with ETAs every 30 seconds.",
      "SMS, email, and portal alerts mirror the same timeline.",
    ],
  },
];

const playbookSteps = [
  {
    title: "Rapid intake",
    caption:
      "Digital intake captures location, vehicle, and photos in under 60 seconds.",
  },
  {
    title: "Smart match",
    caption:
      "We ping the closest certified unit with the right rig and recovery tools.",
  },
  {
    title: "Live tracking",
    caption:
      "Customers and fleets follow the truck on the map with ETA pushes.",
  },
  {
    title: "Secure hand-off",
    caption:
      "Driver confirms delivery, uploads photos, and the ops desk closes the ticket.",
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
  const [activeSpotlight, setActiveSpotlight] = useState(0);
  const [spotlightPaused, setSpotlightPaused] = useState(false);

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
              if (
                status !== "OK" ||
                !Array.isArray(results) ||
                !results.length
              ) {
                setFallback();
                return;
              }

              const getComponent = (type) =>
                results[0].address_components.find((c) =>
                  c.types.includes(type)
                );

              const city =
                getComponent("locality")?.long_name ||
                getComponent("administrative_area_level_2")?.long_name;
              const state = getComponent(
                "administrative_area_level_1"
              )?.short_name;
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

  const spotlightCount = aboutSpotlights.length;
  useEffect(() => {
    if (spotlightPaused || spotlightCount <= 1) return undefined;
    if (typeof window === "undefined") return undefined;
    const timer = window.setInterval(() => {
      setActiveSpotlight((prev) => (prev + 1) % spotlightCount);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [spotlightPaused, spotlightCount]);

  const activeSpotlightItem =
    aboutSpotlights[activeSpotlight] ?? aboutSpotlights[0];
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
              aria-label="Change city"
            >
              Change city
            </button>
          </div>

          <h1 className="hero-title hero-title--ride">
            Towing and roadside help, ready when you are
          </h1>
          <p className="hero-sub hero-sub--ride">
            Titan Tow Force delivers fast dispatch, honest pricing, and
            certified operators across Castle Rock and the surrounding
            corridors.
          </p>

          <div className="hero-bullets">
            <span className="pill">Average dispatch 8 minutes</span>
            <span className="pill">24/7 live updates</span>
            <span className="pill">Heavy and light duty</span>
          </div>

          <div className="hero-actions">
            <Link
              className="hero-action hero-action--primary"
              to="/customer/login"
            >
              Sign in to your workspace
            </Link>
            <Link className="hero-action hero-action--ghost" to="/vendor/login">
              Join the vendor network
            </Link>
          </div>
        </div>

        <div className="hero-right hero-right--ride">
          <div className="hero-photo">
            <img
              src={galleryImages[activeImage].src}
              alt={galleryImages[activeImage].alt}
            />
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
              Built on honest pricing, dependable equipment, and a crew that
              treats every customer like family.
            </p>
          </div>
          {/* landing-about__meta removed to follow your request */}
        </div>

        <div className="landing-about__body">
          <div className="landing-about__grid">
            {aboutParagraphs.map((copy, idx) => (
              <article key={idx} className="about-card">
                <span className="about-card__number">0{idx + 1}</span>
                <p>{copy}</p>
              </article>
            ))}
          </div>
          <div
            className="about-visual"
            onMouseEnter={() => setSpotlightPaused(true)}
            onMouseLeave={() => setSpotlightPaused(false)}
            onFocusCapture={() => setSpotlightPaused(true)}
            onBlurCapture={() => setSpotlightPaused(false)}
          >
            <div className="about-visual__pulse" aria-hidden="true" />
            <div
              className="about-showcase"
              data-active={activeSpotlightItem?.id || ""}
              aria-live="polite"
              role="group"
            >
              <div
                key={activeSpotlightItem?.id || "spotlight"}
                className="about-showcase__metric"
              >
                <span className="about-showcase__metric-value">
                  {activeSpotlightItem?.metric}
                </span>
                <span className="about-showcase__metric-label">
                  {activeSpotlightItem?.metricLabel}
                </span>
              </div>
              <div className="about-showcase__body">
                <h4>{activeSpotlightItem?.title}</h4>
                <p>{activeSpotlightItem?.description}</p>
                <ul className="about-showcase__list">
                  {activeSpotlightItem?.bullets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div
                className="about-showcase__tabs"
                role="tablist"
                aria-label="Titan Tow Force highlights"
              >
                {aboutSpotlights.map((item, idx) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`about-showcase__tab ${
                      idx === activeSpotlight ? "is-active" : ""
                    }`}
                    aria-pressed={idx === activeSpotlight}
                    onClick={() => setActiveSpotlight(idx)}
                  >
                    {item.label}
                  </button>
                ))}
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

          <div className="panel-readiness">
            <h4>Operator readiness</h4>
            <ul className="panel-readiness__list">
              {readinessHighlights.map(({ icon: IconPart, title, body }) => (
                <li key={title} className="panel-readiness__item">
                  <span className="panel-readiness__icon" aria-hidden="true">
                    <IconPart />
                  </span>
                  <div>
                    <strong>{title}</strong>
                    <p>{body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="panel-contact">
            <span className="about-contact__icon" aria-hidden="true">
              <PiPhoneCallBold />
            </span>
            <div>
              <strong>Fleet manager?</strong>
              <p>
                Call <a href="tel:+13039005503">303-900-5503</a> for priority
                contracts, staging, and monthly reporting.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-gallery card">
        <div className="landing-gallery__head">
          <h3>On the road with our team</h3>
          <p className="muted">
            A look at recent recoveries and roadside assists from the Titan Tow
            Force crew.
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
            Follow live jobs, store vehicle details, and access past invoices in
            seconds.
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
      </section>

      <section className="features card">
        <div className="feat">
          <div className="feat-icon">+</div>
          <div>
            <h4>Live map tracking</h4>
            <p className="muted">
              Share real-time ETAs with your family, team, or insurer.
            </p>
          </div>
        </div>
        <div className="feat">
          <div className="feat-icon">+</div>
          <div>
            <h4>Nationwide partners</h4>
            <p className="muted">
              Trusted operators backed by Titan Tow Force standards.
            </p>
          </div>
        </div>
        <div className="feat">
          <div className="feat-icon">+</div>
          <div>
            <h4>Customer-first support</h4>
            <p className="muted">
              Talk to a dispatcher any time you need quick answers.
            </p>
          </div>
        </div>
      </section>

      <section className="final-cta card">
        <div className="final-left">
          <h2>Need a truck right now?</h2>
          <p className="muted">
            Call 303-900-5503 for direct dispatch with Titan Tow Force.
          </p>
        </div>
        <div className="final-right">
          <a className="btn ghost" href="tel:+13039005503">
            Call 303-900-5503
          </a>
        </div>
      </section>
    </div>
  );
}
