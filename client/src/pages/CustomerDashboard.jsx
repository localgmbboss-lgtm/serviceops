import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { copyText } from "../utils/clipboard";
import {
  deriveCustomerCoordinates,
  deriveDriverCoordinates,
  deriveDropoffCoordinates,
  distanceBetweenPointsKm,
} from "../utils/geo";
import GMap from "../components/GMap";
import LiveMap from "../components/LiveMap";
import { getGoogleMapsKey } from "../config/env.js";
import ReviewFunnel from "../components/ReviewFunnel";
import ChatOverlay from "../components/ChatOverlay";
import { useJobMessaging } from "../hooks/useJobMessaging";
import { ensureCustomerPushSubscription } from "../lib/pushNotifications";
import { useNotifications } from "../contexts/NotificationsContext";
import {
  LuCar,
  LuClock,
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

const KM_TO_MI = 0.621371;

const formatDistanceLabel = (km) => {
  if (!Number.isFinite(km)) return null;
  if (km < 0.2) return `${Math.round(km * 1000)} meters`;
  const miles = km * KM_TO_MI;
  if (miles < 10) return `${miles.toFixed(1)} miles`;
  return `${Math.round(miles)} miles`;
};

export default function CustomerDashboard() {
  const { id } = useParams();
  const location = useLocation();
  const [state, setState] = useState({
    customer: null,
    job: null,
    driver: null,
  });

  const [history, setHistory] = useState([]);
  const [err, setErr] = useState("");
  const [routeSummary, setRouteSummary] = useState({
    distanceText: null,
    durationText: null,
    distanceMeters: null,
  });
  const historyRef = useRef(null);
  const pushAttemptedRef = useRef(false);

  useEffect(() => {
    if (pushAttemptedRef.current) return;
    pushAttemptedRef.current = true;
    ensureCustomerPushSubscription({ source: "customer-dashboard" }).catch(() => {});
  }, []);

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
  const {
    messages: chatMessages,
    participants: chatParticipants,
    sendMessage: sendChatMessage,
    sending: chatSending,
    loading: chatLoading,
    error: chatError,
    canMessage: chatEnabled,
    realtimeReady: chatRealtimeReady,
    typingIndicators: chatTypingIndicators,
    emitTyping: emitChatTyping,
    unreadCount: chatUnreadCount,
  } = useJobMessaging({ jobId: job?._id, role: "customer" });
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
  const vendorDisplayName = useMemo(
    () => chatParticipants?.vendor?.name || driver?.name || "",
    [chatParticipants?.vendor?.name, driver?.name]
  );
  const chatSubtitle = useMemo(() => {
    if (!job) return "";
    if (chatEnabled && vendorDisplayName) {
      return `Share updates with ${vendorDisplayName}`;
    }
    return "";
  }, [chatEnabled, job, vendorDisplayName]);
  const autoOpenChat = useMemo(() => {
    if (location?.state?.openChat) return true;
    try {
      const params = new URLSearchParams(location.search || "");
      return params.get("chat") === "1";
    } catch {
      return false;
    }
  }, [location?.state?.openChat, location.search]);

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
  const etaText = routeSummary.durationText || job?.estimatedDuration || "Calculating";

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
  const primaryDriverPosition = useMemo(() => {
    if (driverMarkers.length === 0) return null;
    const primary = driverMarkers[0];
    if (
      Number.isFinite(primary.lat) &&
      Number.isFinite(primary.lng)
    ) {
      return { lat: primary.lat, lng: primary.lng };
    }
    return null;
  }, [driverMarkers]);

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

  const routeDistanceKm = useMemo(() => {
    if (!primaryDriverPosition || !routeDestination?.position) return null;
    return distanceBetweenPointsKm(
      primaryDriverPosition,
      routeDestination.position
    );
  }, [primaryDriverPosition, routeDestination]);

  const fallbackRouteDistanceMeters = useMemo(() => {
    if (!Number.isFinite(routeDistanceKm)) return null;
    return routeDistanceKm * 1000;
  }, [routeDistanceKm]);

  const handleRouteResult = useCallback((result) => {
    if (!result?.routes?.length) {
      setRouteSummary((prev) => {
        if (
          !prev.distanceText &&
          !prev.durationText &&
          !prev.distanceMeters
        ) {
          return prev;
        }
        return {
          distanceText: null,
          durationText: null,
          distanceMeters: null,
        };
      });
      return;
    }
    const leg = result.routes?.[0]?.legs?.[0];
    const next = {
      distanceText: leg?.distance?.text || null,
      durationText: leg?.duration?.text || null,
      distanceMeters: Number.isFinite(leg?.distance?.value)
        ? leg.distance.value
        : null,
    };
    setRouteSummary((prev) =>
      prev.distanceText === next.distanceText &&
      prev.durationText === next.durationText &&
      prev.distanceMeters === next.distanceMeters
        ? prev
        : next
    );
  }, []);

  useEffect(() => {
    if (!canShowRoute) {
      setRouteSummary((prev) => {
        if (
          !prev.distanceText &&
          !prev.durationText &&
          !prev.distanceMeters
        ) {
          return prev;
        }
        return {
          distanceText: null,
          durationText: null,
          distanceMeters: null,
        };
      });
    }
  }, [canShowRoute]);

  useEffect(() => {
    if (!hasGoogle) {
      setRouteSummary((prev) => {
        if (
          !prev.distanceText &&
          !prev.durationText &&
          !prev.distanceMeters
        ) {
          return prev;
        }
        return {
          distanceText: null,
          durationText: null,
          distanceMeters: null,
        };
      });
    }
  }, [hasGoogle]);

  const routeDistanceLabel = useMemo(
    () =>
      routeSummary.distanceText ||
      formatDistanceLabel(routeDistanceKm),
    [routeSummary.distanceText, routeDistanceKm]
  );

  const effectiveRouteDistanceMeters = useMemo(
    () => routeSummary.distanceMeters ?? fallbackRouteDistanceMeters,
    [routeSummary.distanceMeters, fallbackRouteDistanceMeters]
  );

  const destinationRoleLabel =
    routeDestination?.role === "customer" ? "customer" : "destination";

  const googleDirectionsUrl = useMemo(() => {
    if (!primaryDriverPosition || !routeDestination?.position) return null;
    const params = new URLSearchParams({
      api: "1",
      origin: `${primaryDriverPosition.lat},${primaryDriverPosition.lng}`,
      destination: `${routeDestination.position.lat},${routeDestination.position.lng}`,
      travelmode: "driving",
    });
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }, [primaryDriverPosition, routeDestination]);

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

  const summaryStats = useMemo(() => {
    const stats = [
      {
        key: "status",
        label: "Status",
        value: currentTitle,
        icon: stageMeta[currentStage]?.icon || LuSearch,
      },
      {
        key: "eta",
        label: "ETA",
        value: etaText,
        icon: LuClock,
      },
    ];

    if (routeDistanceLabel) {
      stats.push({
        key: "distance",
        label:
          destinationRoleLabel === "customer"
            ? "Distance to you"
            : "Distance to destination",
        value: routeDistanceLabel,
        icon: LuMapPin,
      });
    }

    stats.push({
      key: "driver",
      label: "Driver",
      value: driver?.name ? driver.name : "Matching driver",
      icon: LuTruck,
    });

    return stats;
  }, [
    currentTitle,
    currentStage,
    etaText,
    routeDistanceLabel,
    destinationRoleLabel,
    driver?.name,
  ]);

  if (err)
    return (
      <div className="custdash" role="status" aria-live="polite">
        <div className="custdash-shell">
          <div className="card">
            <p className="error">{err}</p>
          </div>
        </div>
      </div>
    );

  if (!customer)
    return (
      <div className="custdash" role="status" aria-live="polite">
        <div className="custdash-shell">
          <div className="card">
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );

  return (
    <div className="custdash">
      <div className="custdash-shell">
        <section
          className="card custdash-hero"
          aria-labelledby="custdash-hero-title"
        >
          <header className="custdash-hero__header">
            <div className="custdash-hero__title">
              <p className="custdash-eyebrow">Live rescue</p>
              <h2 id="custdash-hero-title">
                Hi {customer.name}, we're lining everything up
              </h2>
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
            <div className="custdash-flow" aria-hidden="true">
              <div className="custdash-flow__rail" aria-hidden="true">
                <div
                  className="custdash-flow__progress"
                  style={{ width: `${roadShare * 100}%` }}
                />
              </div>

              <ul className="custdash-flow__steps">
                {STAGES.map((s, i) => {
                  const done = i < activeIndex;
                  const active = i === activeIndex;
                  return (
                    <li
                      key={s}
                      className={`custdash-flow__step ${done ? "done" : ""} ${
                        active ? "active" : ""
                      }`}
                      aria-current={active ? "step" : undefined}
                    >
                      <div className="step-dot" aria-hidden="true">
                        {i + 1}
                      </div>
                      <div className="step-label">{s}</div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="custdash-hero__pane">
              <div
                className="custdash-tracker"
                role="status"
                aria-live="polite"
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

              {summaryStats.length > 0 && (
                <div
                  className="custdash-summary"
                  role="list"
                  aria-label="Job at a glance"
                >
                  {summaryStats.map((stat) => {
                    const Icon = stat.icon;
                    return (
                      <div
                        key={stat.key}
                        className="custdash-summary__item"
                        role="listitem"
                      >
                        <span
                          className="custdash-summary__icon"
                          aria-hidden="true"
                        >
                          <Icon />
                        </span>
                        <div className="custdash-summary__text">
                          <span className="custdash-summary__label">
                            {stat.label}
                          </span>
                          <span className="custdash-summary__value">
                            {stat.value}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="custdash-hero__cta">
            <button
              type="button"
              className="custdash btn primary"
              onClick={shareStatus}
            >
              Share live status
            </button>
            <button
              type="button"
              className="custdash btn ghost"
              onClick={copyStatusLink}
            >
              Copy tracking link
            </button>
            {driver?.phone && (
              <button
                type="button"
                className="custdash btn ghost"
                onClick={callDriver}
              >
                Call driver
              </button>
            )}
          </div>
        </section>

        <div className="custdash-main">
          <section className="card custdash-map">
            <div className="custdash-map__header">
              <h3>Live map</h3>
              <span className="custdash-chip">Updated every few seconds</span>
              {googleDirectionsUrl && (
                <a
                  className="custdash-map__cta"
                  href={googleDirectionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open in Google Maps
                </a>
              )}
            </div>
            <div
              className="custdash-map__canvas"
              role="region"
              aria-label="Live map"
            >
              {hasGoogle ? (
                <GMap
                  drivers={driverMarkers}
                  destination={routeDestination}
                  landmarks={mapLandmarks}
                  showRoute={canShowRoute}
                  center={mapCenter || undefined}
                  zoom={13}
                  onRouteResult={handleRouteResult}
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
                    destination={routeDestination?.position || fallbackDestination}
                    showRoute={canShowRoute}
                    routeDistanceMeters={effectiveRouteDistanceMeters}
                  />
                  <p className="muted tiny">
                    Route preview uses open-map data and reflects the latest driver update.
                  </p>
                </>
              )}
              {routeDistanceLabel && (
                <p className="muted tiny">
                  Distance to {destinationRoleLabel}: {routeDistanceLabel}
                </p>
              )}
            </div>
          </section>

          <section
            className="card custdash-driver"
            aria-labelledby="driver-heading"
          >
            <header className="custdash-driver__header">
              <div className="custdash-driver__identity">
                <span className="custdash-driver__avatar" aria-hidden="true">
                  {driverInitials}
                </span>
                <div>
                  <h3 id="driver-heading">
                    {driver ? driver.name : "Driver to be assigned"}
                  </h3>
                  <p className="custdash-driver__subtitle">{driverSubtitle}</p>
                </div>
              </div>
              {driver?.phone && (
                <button
                  type="button"
                  className="custdash btn ghost"
                  onClick={callDriver}
                >
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
              <button
                type="button"
                className="custdash btn ghost"
                onClick={shareStatus}
              >
                Share trip progress
              </button>
              <button
                type="button"
                className="custdash btn ghost"
                onClick={copyStatusLink}
              >
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
                  aria-disabled={tile.disabled ? "true" : "false"}
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
        </div>

        {job && (
          <ChatOverlay
            title="Message your vendor"
            subtitle={chatSubtitle}
            messages={chatMessages}
            participants={chatParticipants}
            actorRole="customer"
            canMessage={chatEnabled}
            onSend={sendChatMessage}
            sending={chatSending}
            loading={chatLoading}
            error={chatError}
            realtimeReady={chatRealtimeReady}
            typingIndicators={chatTypingIndicators}
            onTyping={emitChatTyping}
            unreadCount={chatUnreadCount}
            defaultOpen={autoOpenChat && chatEnabled}
          />
        )}

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
                    className={`custdash-status-chip ${String(
                      item.status || ""
                    ).toLowerCase()}`}
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





