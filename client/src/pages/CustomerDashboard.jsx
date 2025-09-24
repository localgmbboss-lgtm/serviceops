import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { copyText } from "../utils/clipboard";
import GMap from "../components/GMap";
import ReviewFunnel from "../components/ReviewFunnel";
import "./CustomerDashboard.css";

const STAGES = ["Unassigned", "Assigned", "OnTheWay", "Arrived", "Completed"];

const statusMessage = {
  Unassigned: "We're matching you with the best nearby operator.",
  Assigned: "A driver has accepted. We're getting them on the road.",
  OnTheWay: "Your driver is on the way to you.",
  Arrived: "Driver has arrived at the pickup point.",
  Completed: "Trip completed - hope everything went smoothly!",
};

export default function CustomerDashboard() {
  const { id } = useParams();
  const [state, setState] = useState({ customer: null, job: null, driver: null });
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

  const { customer, job, driver } = state;

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
  const progress = (activeIndex / (STAGES.length - 1)) * 100;

  const timeline = useMemo(
    () =>
      STAGES.map((stage, index) => ({
        label: stage,
        state:
          index < activeIndex ? "done" : index === activeIndex ? "active" : "upcoming",
      })),
    [activeIndex]
  );

  const jobNumber = job?._id ? `#${job._id.slice(-6).toUpperCase()}` : "Pending";
  const serviceLabel = job?.serviceType || "Roadside assistance";
  const pickupText = job?.pickupAddress || "Pending confirmation";
  const dropoffText = job?.dropoffAddress || "To be decided";
  const etaText = job?.estimatedDuration || "Calculating";

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
        <div className="card"><p className="error">{err}</p></div>
      </div>
    );

  if (!customer)
    return (
      <div className="custdash">
        <div className="card"><p>Loading...</p></div>
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
              <span className={`custdash-status-chip ${currentStage.toLowerCase()}`}>
                {currentStage}
              </span>
              <p className="custdash-status-line">{statusMessage[currentStage]}</p>
              <span className="custdash-job-id">Job {jobNumber}</span>
            </div>
          </header>

          <div className="custdash-hero__content">
            <div className="custdash-flow">
              <div className="custdash-flow__rail">
                <div
                  className="custdash-flow__progress"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <ol className="custdash-flow__steps">
                {timeline.map((item, index) => (
                  <li
                    key={item.label}
                    className={`custdash-flow__step ${item.state}`}
                  >
                    <span className="step-dot">{index + 1}</span>
                    <span className="step-label">{item.label}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="custdash-hero__summary">
              <div className="custdash-leg">
                <span className="leg-label">Pickup</span>
                <p>{pickupText}</p>
              </div>
              <div className="custdash-leg">
                <span className="leg-label">Drop-off</span>
                <p>{dropoffText}</p>
              </div>
              <div className="custdash-leg">
                <span className="leg-label">Service</span>
                <p>{serviceLabel}</p>
              </div>
              <div className="custdash-leg">
                <span className="leg-label">ETA</span>
                <p>{etaText}</p>
              </div>
            </div>
          </div>

          <div className="custdash-hero__insights">
            <div className="custdash-insight">
              <span className="insight-label">Current stage</span>
              <strong>{currentStage}</strong>
              <span className="insight-caption">{statusMessage[currentStage]}</span>
            </div>
            <div className="custdash-insight">
              <span className="insight-label">Driver</span>
              <strong>{driver?.name || "Pending assignment"}</strong>
              <span className="insight-caption">{driverSubtitle}</span>
            </div>
            <div className="custdash-insight">
              <span className="insight-label">Service type</span>
              <strong>{serviceLabel}</strong>
              <span className="insight-caption">Request {jobNumber}</span>
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
              <GMap
                drivers={driver ? [driver] : []}
                destination={
                  job?.dropoffLat && job?.dropoffLng
                    ? { lat: job.dropoffLat, lng: job.dropoffLng }
                    : job?.pickupAddress || null
                }
                showRoute={Boolean(driver)}
                zoom={13}
              />
            </div>
          </section>

          <section className="card custdash-driver">
            <header className="custdash-driver__header">
              <div className="custdash-driver__identity">
                <span className="custdash-driver__avatar">{driverInitials}</span>
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
              <span className={`custdash-status-chip ${currentStage.toLowerCase()}`}>
                {currentStage}
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
                    ? `${driver?.vehicleColor || ""} ${driver?.vehicleMake || ""} ${
                        driver?.vehicleModel || ""
                      }`
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
                <span className="custdash-action__label">{tile.label}</span>
                <span className="custdash-action__caption">{tile.caption}</span>
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
                  <span className={`custdash-status-chip ${item.status.toLowerCase()}`}>
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

