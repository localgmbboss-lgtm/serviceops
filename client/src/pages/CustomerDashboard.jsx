import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { copyText } from "../utils/clipboard";
import {
  deriveCustomerCoordinates,
  deriveDriverCoordinates,
  deriveDropoffCoordinates,
} from "../utils/geo";
import GMap from "../components/GMap";
import LiveMap from "../components/LiveMap";
import { getGoogleMapsKey } from "../config/env.js";
import ReviewFunnel from "../components/ReviewFunnel";
import { useNotifications } from "../contexts/NotificationsContext";
import {
  LuCar,
  LuFlag,
  LuMapPin,
  LuSearch,
  LuTruck,
  LuUserCheck,
} from "react-icons/lu";
import "./CustomerDashboard.css";

const STAGES = ["Unassigned", "Assigned", "OnTheWay", "Arrived", "Completed"];

const statusMessage = {
  Unassigned: "Hang tight - we're lining up the right operator for you.",
  Assigned: "Your driver is confirmed and getting ready to roll.",
  OnTheWay: "Your driver is en route with live updates coming through.",
  Arrived: "Your driver is on-site and ready to help.",
  Completed: "Service complete. Thanks for trusting us.",
};

const stageMeta = {
  Unassigned: { title: "Matching your driver", icon: LuSearch },
  Assigned: { title: "Driver confirmed", icon: LuUserCheck },
  OnTheWay: { title: "Driver en route", icon: LuCar },
  Arrived: { title: "Driver on-site", icon: LuMapPin },
  Completed: { title: "Service complete", icon: LuFlag },
};

export default function CustomerDashboard() {
  const { id } = useParams();
  const [state, setState] = useState({
    customer: null,
    job: null,
    driver: null,
  });
  const [history, setHistory] = useState([]);
  const [err, setErr] = useState("");
  const historyRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [{ data: status }, { data: jobs }] = await Promise.all([
        api.get(`/api/customers/${id}/status`),
        api.get(`/api/customers/${id}/jobs?limit=8`),
      ]);
      setState(status);
      setHistory(jobs || []);
      setErr("");
    } catch (error) {
      setErr(error?.response?.data?.message || "Unable to load dashboard.");
    }
  }, [id]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 6000);
    return () => clearInterval(timer);
  }, [load]);

  const mapsKey = getGoogleMapsKey();

  const hasGoogle = Boolean(mapsKey);

  const { customer, job, driver } = state;
  const { publish } = useNotifications();
  const previousStatusRef = useRef(null);
  const previousDriverRef = useRef(null);

  const driverInitials = driver?.name
    ? driver.name
        .trim()
        .split(/\s+/)
        .map((part) => part[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "SO";

  const driverSubtitle = driver
    ? driver.city
      ? `${driver.city} - ${driver.phone || "No phone on file"}`
      : driver.phone || "No phone on file"
    : "We'll notify you as soon as a driver accepts.";

  const currentStage = job?.status || "Unassigned";
  const activeIndex = Math.max(STAGES.indexOf(currentStage), 0);
  const roadShare = STAGES.length > 1 ? activeIndex / (STAGES.length - 1) : 0;
  const vehicleLeft = `${6 + roadShare * 88}%`;
  const nextIndex = Math.min(activeIndex + 1, STAGES.length - 1);
  const nextStage = STAGES[nextIndex];
  const isFinalStage = nextIndex === activeIndex;
  const nextCopy = isFinalStage
    ? "All wrapped"
    : stageMeta[nextStage]?.title || nextStage;
  const currentTitle = stageMeta[currentStage]?.title || currentStage;

  const jobNumber = job?._id
    ? `#${job._id.slice(-6).toUpperCase()}`
    : "Pending";
  const etaText = job?.estimatedDuration || "Calculating";

  useEffect(() => {
    if (!job?._id || !job?.status) return;
    const previousStatus = previousStatusRef.current;
    const shouldAnnounceInitial =
      !previousStatus && ["Assigned", "OnTheWay"].includes(job.status);
    if (
      (previousStatus && job.status !== previousStatus) ||
      shouldAnnounceInitial
    ) {
      const statusTitle = stageMeta[job.status]?.title || job.status;
      let body = statusMessage[job.status] || `Your job is now ${statusTitle}.`;
      if (job.status === "OnTheWay" && etaText) {
        body = `Your driver is en route. Estimated arrival ${etaText}.`;
      }
      publish({
        title: statusTitle,
        body,
        severity: "info",
        meta: {
          jobId: job._id,
          stage: job.status,
          stageLabel: statusTitle,
          role: "customer",
        },
        dedupeKey: `customer-job-${job._id}-${job.status}`,
      });
    }
    previousStatusRef.current = job.status;
  }, [job?._id, job?.status, etaText, publish]);

  useEffect(() => {
    if (!job?._id) {
      previousDriverRef.current = null;
      return;
    }
    const currentDriverKey = driver?._id || driver?.phone || driver?.name;
    if (!currentDriverKey) {
      previousDriverRef.current = null;
      return;
    }
    const prevKey = previousDriverRef.current;
    if (prevKey !== currentDriverKey) {
      publish({
        title: "Driver assigned",
        body: driver?.name
          ? `${driver.name} is on the way.`
          : "A driver has been assigned to your service.",
        severity: "success",
        meta: {
          jobId: job._id,
          driver: driver?.name || currentDriverKey,
          role: "customer",
        },
        dedupeKey: `customer-driver-${job._id}-${currentDriverKey}`,
      });
    }
    previousDriverRef.current = currentDriverKey;
  }, [driver?._id, driver?.phone, driver?.name, job?._id, publish]);

  const pickupAddress =
    job?.pickupAddress ||
    job?.pickup?.address ||
    job?.pickupLocation?.address ||
    job?.customerLocation?.address ||
    job?.customer?.address ||
    null;
  const dropoffAddress =
    job?.dropoffAddress ||
    job?.dropoff?.address ||
    job?.dropoffLocation?.address ||
    job?.destinationAddress ||
    (typeof job?.destination === "string" ? job.destination : null);

  const customerCoordinates = useMemo(
    () => deriveCustomerCoordinates(job),
    [job]
  );
  const dropoffCoordinates = useMemo(
    () => deriveDropoffCoordinates(job),
    [job]
  );

  const customerAvatar =
    customer?.avatarUrl ||
    customer?.photoUrl ||
    customer?.photo ||
    customer?.image ||
    null;
  const routeDestination = useMemo(() => {
    if (customerCoordinates) {
      return {
        position: customerCoordinates,
        label: "YOU",
        role: "customer",
        title: pickupAddress || "Your pickup location",
        color: "#f97316",
        textColor: "#0f172a",
        avatarUrl: customerAvatar,
      };
    }
    if (dropoffCoordinates) {
      return {
        position: dropoffCoordinates,
        label: "DEST",
        role: "dropoff",
        title: dropoffAddress || "Destination",
        color: "#0ea5e9",
        textColor: "#ffffff",
      };
    }
    return null;
  }, [
    customerCoordinates,
    dropoffCoordinates,
    pickupAddress,
    dropoffAddress,
    customerAvatar,
  ]);

  const mapLandmarks = useMemo(() => {
    if (!dropoffCoordinates || !customerCoordinates) return [];
    return [
      {
        key: "dropoff",
        position: dropoffCoordinates,
        label: "DROP",
        title: dropoffAddress || "Drop-off",
        color: "#0ea5e9",
        textColor: "#ffffff",
      },
    ];
  }, [customerCoordinates, dropoffCoordinates, dropoffAddress]);

  const driverMarkers = useMemo(() => {
    if (!driver) return [];
    const coords = deriveDriverCoordinates(driver);
    if (!coords) return [];
    return [
      {
        ...driver,
        lat: coords.lat,
        lng: coords.lng,
        label: driver?.label || "DRV",
        avatarUrl:
          driver?.avatarUrl ||
          driver?.photoUrl ||
          driver?.photo ||
          driver?.image ||
          null,
        title: driver?.name ? `${driver.name}` : "Driver",
        color: "#2563eb",
        textColor: "#ffffff",
      },
    ];
  }, [driver]);

  const fallbackDestination = customerCoordinates || dropoffCoordinates || null;

  const mapCenter = useMemo(() => {
    if (routeDestination?.position) return routeDestination.position;
    if (driverMarkers.length > 0) {
      const primary = driverMarkers[0];
      if (Number.isFinite(primary.lat) && Number.isFinite(primary.lng)) {
        return { lat: primary.lat, lng: primary.lng };
      }
    }
    return fallbackDestination || null;
  }, [driverMarkers, routeDestination, fallbackDestination]);

  const canShowRoute =
    driverMarkers.length > 0 && Boolean(routeDestination?.position);
  const copyStatusLink = async () => {
    if (!job?._id) return;
    const url = `${window.location.origin}/status/${job._id}`;
    const copied = await copyText(url);
    if (!copied) alert("Could not copy link. Long press or select to copy.");
  };

  const shareStatus = async () => {
    if (!job?._id) return;
    const url = `${window.location.origin}/status/${job._id}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Track my ServiceOps job",
          text: "Follow along with my service request in real time.",
          url,
        });
        return;
      } catch {}
    }
    await copyStatusLink();
    alert("Status link copied to clipboard.");
  };

  const callDriver = () => {
    if (!driver?.phone) return;
    window.location.href = `tel:${driver.phone}`;
  };

  const scrollToHistory = () => {
    historyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const quickTiles = [
    {
      key: "share",
      label: "Share tracking",
      caption: "Send real-time updates",
      tone: "primary",
      icon: "S",
      action: shareStatus,
    },
    {
      key: "copy",
      label: "Copy link",
      caption: "Paste into a text or email",
      tone: "ghost",
      icon: "L",
      action: copyStatusLink,
    },
    {
      key: "call",
      label: driver?.phone ? "Call driver" : "Awaiting driver",
      caption: driver?.phone || "We'll alert you once assigned",
      tone: "call",
      icon: "P",
      action: callDriver,
      disabled: !driver?.phone,
    },
    {
      key: "history",
      label: "Trip history",
      caption: "Review previous requests",
      tone: "muted",
      icon: "H",
      action: scrollToHistory,
    },
  ];

  if (err)
    return (
      <div className="custdash">
        <div className="card">
          <p className="error">{err}</p>
        </div>
      </div>
    );

  if (!customer)
    return (
      <div className="custdash">
        <div className="card">
          <p>Loading...</p>
        </div>
      </div>
    );

  return (
    <div className="custdash">
      <div className="custdash-shell">
        <section className="card custdash-hero">
          <header className="custdash-hero__header">
            <div className="custdash-hero__title">
              <p className="custdash-eyebrow">Live rescue</p>
              <h2>Hi {customer.name}, we're lining everything up</h2>
            </div>
            <div className="custdash-hero__status">
              <span
                className={`custdash-status-chip ${currentStage.toLowerCase()}`}
              >
                {currentTitle}
              </span>
              <p className="custdash-status-line">
                {statusMessage[currentStage]}
              </p>
              <span className="custdash-job-id">Job {jobNumber}</span>
            </div>
          </header>

          <div className="custdash-hero__content">
            <div
              className="custdash-tracker"
              role="region"
              aria-label="Job progress"
            >
              <span className="custdash-pill custdash-pill--current">
                {currentTitle}
              </span>
              <div className="custdash-mini-road" aria-hidden="true">
                <div className="custdash-mini-road__lane">
                  <div className="custdash-mini-road__stripes" />
                  <div
                    className="custdash-mini-road__vehicle"
                    style={{ left: vehicleLeft }}
                  >
                    <LuTruck />
                  </div>
                </div>
              </div>
              <span className="custdash-pill custdash-pill--next">
                {isFinalStage ? "All wrapped" : nextCopy}
              </span>
            </div>
          </div>

          <div className="custdash-hero__cta">
            <button className="btn primary" onClick={shareStatus}>
              Share live status
            </button>
            <button className="btn ghost" onClick={copyStatusLink}>
              Copy tracking link
            </button>
            {driver?.phone ? (
              <button className="btn ghost" onClick={callDriver}>
                Call driver
              </button>
            ) : null}
          </div>
        </section>

        <div className="custdash-main">
          <section className="card custdash-map">
            <div className="custdash-map__header">
              <h3>Live map</h3>
              <span className="custdash-chip">Updated every few seconds</span>
            </div>
            <div className="custdash-map__canvas">
              {hasGoogle ? (
                <GMap
                  drivers={driverMarkers}
                  destination={routeDestination}
                  landmarks={mapLandmarks}
                  showRoute={canShowRoute}
                  center={mapCenter || undefined}
                  zoom={13}
                />
              ) : (
                <>
                  <LiveMap
                    drivers={driverMarkers}
                    autoFit
                    center={
                      mapCenter
                        ? [mapCenter.lat, mapCenter.lng]
                        : [6.5244, 3.3792]
                    }
                    destination={fallbackDestination}
                  />
                  <p className="muted tiny">
                    Live route view requires a Google Maps API key. Showing
                    driver position only.
                  </p>
                </>
              )}
            </div>
          </section>

          <section className="card custdash-driver">
            <header className="custdash-driver__header">
              <div className="custdash-driver__identity">
                <span className="custdash-driver__avatar">
                  {driverInitials}
                </span>
                <div>
                  <h3>{driver ? driver.name : "Driver to be assigned"}</h3>
                  <p className="custdash-driver__subtitle">{driverSubtitle}</p>
                </div>
              </div>
              {driver?.phone && (
                <button className="btn ghost" onClick={callDriver}>
                  Call driver
                </button>
              )}
            </header>

            <div className="custdash-driver__status">
              <span
                className={`custdash-status-chip ${currentStage.toLowerCase()}`}
              >
                {currentTitle}
              </span>
              <span className="custdash-driver__status-note">
                {statusMessage[currentStage]}
              </span>
            </div>

            <ul className="custdash-driver__meta">
              <li>
                <span className="label">Vehicle</span>
                <p>
                  {driver?.vehicleMake || driver?.vehicleModel
                    ? `${driver?.vehicleColor || ""} ${
                        driver?.vehicleMake || ""
                      } ${driver?.vehicleModel || ""}`
                        .trim()
                        .replace(/\s+/g, " ")
                    : "We'll share vehicle details when assigned."}
                </p>
              </li>
              <li>
                <span className="label">ETA</span>
                <p>{etaText}</p>
              </li>
            </ul>

            <div className="custdash-driver__actions">
              <button className="btn ghost" onClick={shareStatus}>
                Share trip progress
              </button>
              <button className="btn ghost" onClick={copyStatusLink}>
                Copy link
              </button>
            </div>

            {job?.status === "Completed" && (
              <div className="custdash-review">
                <h4>How did everything go?</h4>
                <ReviewFunnel jobId={job._id} />
              </div>
            )}
          </section>
        </div>

        <section className="card custdash-action-rail">
          <div className="custdash-action-rail__header">
            <h3>Control center</h3>
            <span className="custdash-chip secondary">Quick actions</span>
          </div>
          <div className="custdash-action-rail__grid">
            {quickTiles.map((tile) => (
              <button
                key={tile.key}
                type="button"
                className={`custdash-action ${tile.tone}`}
                onClick={() => {
                  if (!tile.disabled) tile.action();
                }}
                disabled={tile.disabled}
              >
                <span className="custdash-action__icon" aria-hidden="true">
                  {tile.icon}
                </span>
                <span className="custdash-action__text">
                  <span className="custdash-action__label">{tile.label}</span>
                  <span className="custdash-action__caption">
                    {tile.caption}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section
          ref={historyRef}
          className="card custdash-history"
          id="custdash-history"
        >
          <div className="custdash-history__header">
            <h3>Recent jobs</h3>
            <span className="custdash-chip secondary">Last 8 requests</span>
          </div>
          {history.length === 0 ? (
            <p className="muted">No previous jobs yet.</p>
          ) : (
            <ul className="custdash-history__list">
              {history.map((item) => (
                <li key={item._id}>
                  <div>
                    <strong>{item.serviceType || "Service"}</strong>
                    <p>{item.pickupAddress}</p>
                  </div>
                  <span
                    className={`custdash-status-chip ${item.status.toLowerCase()}`}
                  >
                    {item.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
