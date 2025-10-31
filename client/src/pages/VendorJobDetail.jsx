import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import GMap from "../components/GMap";
import LiveMap from "../components/LiveMap";
import { vendorApi } from "../lib/vendorApi";
import { getGoogleMapsKey } from "../config/env";
import ChatOverlay from "../components/ChatOverlay";
import { useJobMessaging } from "../hooks/useJobMessaging";
import { useWorkflowFlag } from "../contexts/SettingsContext";
import "./VendorJobDetail.css";

const KM_TO_MI = 0.621371;
const STATUS_SEQUENCE = ["Assigned", "OnTheWay", "Arrived", "Completed"];
const STATUS_LABELS = {
  Assigned: "Assigned",
  OnTheWay: "On the way",
  Arrived: "Arrived",
  Completed: "Completed",
};

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

const derivePickupCoordinates = (job) => {
  if (!job) return null;
  const lat =
    toNumber(job?.pickupLat) ??
    toNumber(job?.pickup?.lat) ??
    toNumber(job?.coordinates?.lat) ??
    toNumber(job?.vehicleLocation?.lat);
  const lng =
    toNumber(job?.pickupLng) ??
    toNumber(job?.pickup?.lng) ??
    toNumber(job?.coordinates?.lng) ??
    toNumber(job?.vehicleLocation?.lng);
  return lat !== null && lng !== null ? { lat, lng } : null;
};

const deriveVendorCoordinates = (vendor) => {
  if (!vendor) return null;
  const lat = toNumber(vendor?.lat ?? vendor?.location?.lat);
  const lng = toNumber(vendor?.lng ?? vendor?.location?.lng);
  return lat !== null && lng !== null ? { lat, lng } : null;
};

const haversineKm = (a, b) => {
  if (!a || !b) return null;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const aa =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return R * c;
};

const formatDistance = (km) => {
  if (!Number.isFinite(km)) return "Distance unavailable";
  const miles = km * KM_TO_MI;
  if (miles < 0.5) return `${Math.round(km * 1000)} m`;
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
};

const formatEta = (km) => {
  if (!Number.isFinite(km)) return null;
  const miles = km * KM_TO_MI;
  const minutes = Math.ceil((miles / 32) * 60);
  return `${minutes} min`;
};

const formatDistanceMeters = (meters) => {
  if (!Number.isFinite(meters)) return "";
  if (meters < 1000) return `${Math.max(1, Math.round(meters))} m`;
  const km = meters / 1000;
  if (km < 10) return `${km.toFixed(1)} km`;
  const miles = km * KM_TO_MI;
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
};

const formatDurationSeconds = (seconds) => {
  if (!Number.isFinite(seconds)) return "";
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `${hours} hr${hours > 1 ? "s" : ""} ${minutes} min`;
  if (hours) return `${hours} hr${hours > 1 ? "s" : ""}`;
  return `${totalMinutes} min`;
};

const formatStatusLabel = (status) => {
  if (!status) return "Pending";
  return STATUS_LABELS[status] || status;
};

const extractNote = (job) => {
  const raw =
    job?.description ||
    job?.notes ||
    job?.customerNote ||
    job?.jobNotes ||
    job?.internalNotes;
  if (!raw) return "";
  return String(raw).replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
};

const htmlToText = (value) => {
  if (!value) return "";
  try {
    if (typeof window !== "undefined" && window.DOMParser) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<div>${value}</div>`, "text/html");
      return (doc.body?.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
    }
  } catch {
    // fall through to regex fallback
  }
  return String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
};

const createEmptyNavState = () => ({
  provider: "",
  steps: [],
  distanceText: "",
  distanceValue: null,
  durationText: "",
  durationValue: null,
  geometry: [],
});

function useAssignedJob(jobId, fallbackJob, fallbackVendor) {
  const [job, setJob] = useState(fallbackJob || null);
  const [vendor, setVendor] = useState(fallbackVendor || null);
  const [loading, setLoading] = useState(!fallbackJob);
  const [error, setError] = useState("");

  const loadRemote = useCallback(async () => {
    if (!jobId) {
      return {
        job: null,
        vendor: fallbackVendor || null,
        errorMessage: "Job not found.",
      };
    }
    const [{ data: me }, { data: assigned }] = await Promise.all([
      vendorApi.get("/api/vendor/auth/me"),
      vendorApi.get("/api/vendor/feed/assigned"),
    ]);
    const vendorData = me?.vendor || fallbackVendor || null;
    const assignedJobs = Array.isArray(assigned)
      ? assigned
      : Array.isArray(assigned?.jobs)
      ? assigned.jobs
      : [];
    let match =
      assignedJobs.find((item) => item && item._id === jobId) || null;
    let errorMessage = "";

    if (!match) {
      try {
        const { data: jobDetail } = await vendorApi.get(
          `/api/vendor/feed/jobs/${jobId}`
        );
        match = jobDetail || null;
        errorMessage = match ? "" : "Job not found in assigned feed.";
      } catch (error) {
        errorMessage =
          error?.response?.data?.message || "Job not found in assigned feed.";
      }
    }

    return {
      job: match,
      vendor: vendorData,
      errorMessage,
    };
  }, [jobId, fallbackVendor]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!jobId) {
        setLoading(false);
        return;
      }
      if (fallbackJob) {
        setJob(fallbackJob);
        if (fallbackVendor) {
          setVendor((prev) => prev || fallbackVendor);
        }
      } else {
        setLoading(true);
      }
      try {
        const { job: remoteJob, vendor: remoteVendor, errorMessage } =
          await loadRemote();
        if (cancelled) return;
        if (remoteVendor) {
          setVendor(remoteVendor);
        } else if (fallbackVendor) {
          setVendor(fallbackVendor);
        }
        if (remoteJob) {
          setJob(remoteJob);
          setError("");
        } else if (!fallbackJob) {
          setJob(null);
          setError(errorMessage || "Job not found in assigned feed.");
        } else {
          setError("");
        }
      } catch (err) {
        if (cancelled) return;
        setError(err?.response?.data?.message || "Unable to load job detail.");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [jobId, fallbackJob, fallbackVendor, loadRemote]);

  const refresh = useCallback(
    async ({ silent = false } = {}) => {
      if (!jobId) return null;
      if (!silent) {
        setLoading(true);
      }
      try {
        const { job: remoteJob, vendor: remoteVendor, errorMessage } =
          await loadRemote();
        if (remoteVendor) {
          setVendor(remoteVendor);
        }
        if (remoteJob) {
          setJob(remoteJob);
          setError("");
        } else if (!fallbackJob) {
          setJob(null);
          setError(errorMessage || "Job not found in assigned feed.");
        } else {
          setError("");
        }
        return remoteJob;
      } catch (err) {
        setError(err?.response?.data?.message || "Unable to load job detail.");
        throw err;
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [jobId, fallbackJob, loadRemote]
  );

  return {
    job: job || fallbackJob,
    vendor,
    loading,
    error,
    refresh,
    setJob: setJob,
  };
}

export default function VendorJobDetail() {
  const { jobId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const jobFromState = location.state?.job || null;
  const vendorFromState = location.state?.vendor || null;

  const { job, loading, error, vendor, refresh, setJob: setJobState } =
    useAssignedJob(jobId, jobFromState, vendorFromState);

  const from = location.state?.from || "";
  const [statusMessage, setStatusMessage] = useState("");
  const [statusError, setStatusError] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [navData, setNavData] = useState(() => createEmptyNavState());
  const [navLoading, setNavLoading] = useState(false);
  const [navError, setNavError] = useState("");
  const [navStarted, setNavStarted] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [showStepList, setShowStepList] = useState(false);
  const [isCompactLayout, setIsCompactLayout] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= 768 : false
  );
  const showLiveMap = useWorkflowFlag("showLiveVendorMap", true);
  const paymentScreenEnabled = useWorkflowFlag("enableCustomerPaymentScreen", true);
  const jobStatus = job?.status || "Assigned";
  const jobStatusNormalized = String(jobStatus || "").toLowerCase();
  const chatStatusAllowed = ["assigned", "ontheway", "arrived"].includes(
    jobStatusNormalized
  );
  const autoOpenChat = useMemo(() => {
    if (location?.state?.openChat) return true;
    try {
      const params = new URLSearchParams(location.search || "");
      return params.get("chat") === "1";
    } catch {
      return false;
    }
  }, [location?.state?.openChat, location.search]);
  const statusIndex = Math.max(STATUS_SEQUENCE.indexOf(jobStatus), 0);
  const statusActions = useMemo(() => {
    if (!job) return [];
    if (jobStatus === "Assigned") {
      return [{ label: "Mark on the way", value: "OnTheWay", variant: "primary" }];
    }
    if (jobStatus === "OnTheWay") {
      return [
        { label: "Mark arrived", value: "Arrived", variant: "ghost" },
        { label: "Complete job", value: "Completed", variant: "primary" },
      ];
    }
    if (jobStatus === "Arrived") {
      return [{ label: "Complete job", value: "Completed", variant: "primary" }];
    }
    return [];
  }, [job, jobStatus]);
  const assignedTimestamp = job?.created ? new Date(job.created) : null;

  useEffect(() => {
    if (!statusMessage || typeof window === "undefined") return undefined;
    const timeout = window.setTimeout(() => setStatusMessage(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [statusMessage]);

  useEffect(() => {
    if (!statusError || typeof window === "undefined") return undefined;
    const timeout = window.setTimeout(() => setStatusError(""), 6000);
    return () => window.clearTimeout(timeout);
  }, [statusError]);

  useEffect(() => {
    setNavData(createEmptyNavState());
    setNavLoading(false);
    setNavError("");
    setNavStarted(false);
    setActiveStepIndex(0);
    setShowStepList(false);
  }, [jobId]);

  useEffect(() => {
    if (!navData.steps.length) {
      setNavStarted(false);
      setActiveStepIndex(0);
    }
  }, [navData.steps.length]);

  const handleBack = useCallback(() => {
    if (from === "vendor-app") {
      navigate("/vendor/app");
    } else {
      navigate(-1);
    }
  }, [from, navigate]);

  const handleStatusChange = useCallback(
    async (nextStatus) => {
      if (!job?._id || updatingStatus) return;
      if (nextStatus === job.status) return;
      if (
        nextStatus === "Completed" &&
        typeof window !== "undefined" &&
        !window.confirm("Mark this job as completed?")
      ) {
        return;
      }
      const previousStatus = job.status;
      setStatusError("");
      setStatusMessage("");
      setUpdatingStatus(true);
      setJobState((prev) =>
        prev && prev._id === job._id ? { ...prev, status: nextStatus } : prev
      );
      try {
        await vendorApi.patch(`/api/vendor/feed/jobs/${job._id}/status`, {
          status: nextStatus,
        });
        await refresh({ silent: true });
        setStatusMessage(`Status updated to ${formatStatusLabel(nextStatus)}.`);
      } catch (err) {
        setJobState((prev) =>
          prev && prev._id === job._id ? { ...prev, status: previousStatus } : prev
        );
        setStatusError(
          err?.response?.data?.message ||
            "Failed to update status. Please try again."
        );
      } finally {
        setUpdatingStatus(false);
      }
    },
    [job, refresh, setJobState, updatingStatus]
  );

  const {
    messages,
    participants,
    sendMessage,
    sending,
    loading: chatLoading,
    error: chatError,
    canMessage,
    realtimeReady,
    typingIndicators,
    emitTyping,
    unreadCount,
  } = useJobMessaging({
    jobId: job?._id,
    role: "vendor",
  });

  const chatSubtitle = useMemo(() => {
    if (!job) return "";
    const name =
      participants?.customer?.name ||
      job.customerName ||
      job.contactName ||
      "your customer";
    return canMessage
      ? `Keep ${name} updated while you're on the way.`
      : "Messaging is unavailable for this job.";
  }, [job, participants?.customer?.name, canMessage]);

  const vendorCoordinates = useMemo(
    () => deriveVendorCoordinates(vendorFromState || vendor),
    [vendorFromState, vendor]
  );
  const pickupCoordinates = useMemo(() => derivePickupCoordinates(job), [job]);
  const distanceKm = useMemo(() => {
    if (!pickupCoordinates || !vendorCoordinates) return null;
    return haversineKm(vendorCoordinates, pickupCoordinates);
  }, [pickupCoordinates, vendorCoordinates]);

  const customerName =
    job?.customer?.name ||
    job?.customerName ||
    job?.contactName ||
    job?.contact?.name ||
    "Customer";
  const customerPhone =
    job?.customer?.phone ||
    job?.customerPhone ||
    job?.contactPhone ||
    job?.contact?.phone ||
    "";
  const dropoffAddress =
    job?.dropoffAddress || job?.destination || job?.dropoff?.address || "";
  const noteText = extractNote(job);
  const hasGoogle = Boolean(getGoogleMapsKey());
  const navigationUrl = pickupCoordinates
    ? `https://www.google.com/maps/dir/?api=1${
        vendorCoordinates
          ? `&origin=${vendorCoordinates.lat},${vendorCoordinates.lng}`
          : ""
      }&destination=${pickupCoordinates.lat},${pickupCoordinates.lng}`
    : null;
  const vendorPins = useMemo(() => {
    if (!vendorCoordinates) return [];
    return [
      {
        _id: vendor?._id || vendor?.id || "vendor",
        name: vendor?.name || "You",
        lat: vendorCoordinates.lat,
        lng: vendorCoordinates.lng,
        badge: "YOU",
        background: "#16a34a",
        textColor: "#ffffff",
      },
    ];
  }, [vendor, vendorCoordinates]);

  const destinationPoint = useMemo(() => {
    if (!pickupCoordinates) return null;
    return {
      position: { lat: pickupCoordinates.lat, lng: pickupCoordinates.lng },
      label: "JOB",
      title: job?.pickupAddress || "Pickup",
      role: "job",
      color: "#f97316",
      textColor: "#0f172a",
    };
  }, [pickupCoordinates, job?.pickupAddress]);

  const liveMapDestination = useMemo(() => {
    if (!pickupCoordinates) return null;
    return [pickupCoordinates.lat, pickupCoordinates.lng];
  }, [pickupCoordinates]);

  const routeCoordinates = useMemo(() => {
    if (!navData.geometry || !navData.geometry.length) return [];
    return navData.geometry
      .map((point) => {
        if (!point) return null;
        if (
          Number.isFinite(point.lat) &&
          Number.isFinite(point.lng)
        ) {
          return [point.lat, point.lng];
        }
        if (
          Array.isArray(point) &&
          Number.isFinite(point[0]) &&
          Number.isFinite(point[1])
        ) {
          return [point[0], point[1]];
        }
        return null;
      })
      .filter(Boolean);
  }, [navData.geometry]);

  const stepCount = navData.steps.length;
  const routeReady = stepCount > 0;
  const navDistanceLabel =
    navData.distanceText || (distanceKm ? formatDistance(distanceKm) : "Distance TBD");
  const navDurationLabel = navData.durationText
    ? `${navData.durationText} drive`
    : distanceKm
    ? `Approx. ${formatEta(distanceKm)} drive`
    : "";
  const navProviderLabel =
    navData.provider === "google"
      ? "Routing by Google Maps"
      : navData.provider === "osrm"
      ? "Routing by OSRM"
      : "";
  const boundedStepIndex = routeReady
    ? Math.min(activeStepIndex, Math.max(stepCount - 1, 0))
    : 0;
  const currentStep = routeReady ? navData.steps[boundedStepIndex] : null;
  const isLastStep = routeReady && boundedStepIndex >= stepCount - 1;

  useEffect(() => {
    if (!routeReady) {
      setShowStepList(false);
      return;
    }
    if (!isCompactLayout) {
      setShowStepList(true);
    }
  }, [routeReady, isCompactLayout]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handler = () => setIsCompactLayout(window.innerWidth <= 768);
    handler();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  useEffect(() => {
    if (!hasGoogle) return;
    if (!pickupCoordinates || !vendorCoordinates) return;
    setNavLoading(true);
    setNavError("");
  }, [hasGoogle, pickupCoordinates, vendorCoordinates]);

  useEffect(() => {
    if (hasGoogle) return;
    if (!pickupCoordinates || !vendorCoordinates) return;
    let ignore = false;
    const controller = new AbortController();
    const url = `https://router.project-osrm.org/route/v1/driving/${vendorCoordinates.lng},${vendorCoordinates.lat};${pickupCoordinates.lng},${pickupCoordinates.lat}?overview=full&geometries=geojson&steps=true`;
    setNavLoading(true);
    setNavError("");
    setNavData(createEmptyNavState());
    setNavStarted(false);
    setActiveStepIndex(0);

    fetch(url, { signal: controller.signal })
      .then((resp) => {
        if (!resp.ok) {
          throw new Error(`OSRM responded with ${resp.status}`);
        }
        return resp.json();
      })
      .then((data) => {
        if (ignore) return;
        const route = data?.routes?.[0];
        if (!route) {
          setNavData(createEmptyNavState());
          setNavError("Unable to calculate directions right now.");
          return;
        }
        const leg = route?.legs?.[0];
        const steps = Array.isArray(leg?.steps)
          ? leg.steps.map((step) => {
              const distanceValue = Number(step?.distance ?? NaN);
              const durationValue = Number(step?.duration ?? NaN);
              return {
                instruction: step?.maneuver?.instruction || "Continue",
                distanceText: Number.isFinite(distanceValue)
                  ? formatDistanceMeters(distanceValue)
                  : "",
                distanceValue: Number.isFinite(distanceValue)
                  ? distanceValue
                  : null,
                durationText: Number.isFinite(durationValue)
                  ? formatDurationSeconds(durationValue)
                  : "",
                durationValue: Number.isFinite(durationValue)
                  ? durationValue
                  : null,
              };
            })
          : [];
        const geometry = Array.isArray(route?.geometry?.coordinates)
          ? route.geometry.coordinates
              .map(([lng, lat]) =>
                Number.isFinite(lat) && Number.isFinite(lng)
                  ? { lat, lng }
                  : null
              )
              .filter(Boolean)
          : [];
        const routeDistance = Number(route?.distance ?? NaN);
        const routeDuration = Number(route?.duration ?? NaN);
        setNavData({
          provider: "osrm",
          steps,
          distanceText: Number.isFinite(routeDistance)
            ? formatDistanceMeters(routeDistance)
            : "",
          distanceValue: Number.isFinite(routeDistance)
            ? routeDistance
            : null,
          durationText: Number.isFinite(routeDuration)
            ? formatDurationSeconds(routeDuration)
            : "",
          durationValue: Number.isFinite(routeDuration)
            ? routeDuration
            : null,
          geometry,
        });
        setNavError("");
        setNavStarted(false);
        setActiveStepIndex(0);
      })
      .catch((err) => {
        if (ignore || err.name === "AbortError") return;
        console.error("OSRM routing failed", err);
        setNavData(createEmptyNavState());
        setNavError("Unable to calculate directions right now.");
      })
      .finally(() => {
        if (!ignore) setNavLoading(false);
      });

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [hasGoogle, pickupCoordinates, vendorCoordinates]);

  const handleGoogleRoute = useCallback(
    (result) => {
      if (!pickupCoordinates || !vendorCoordinates) {
        setNavLoading(false);
        return;
      }
      if (!result) {
        setNavLoading(false);
        setNavData(createEmptyNavState());
        setNavError("Unable to calculate directions right now.");
        return;
      }
      try {
        const primaryRoute = result?.routes?.[0];
        const primaryLeg = primaryRoute?.legs?.[0];
        const steps = Array.isArray(primaryLeg?.steps)
          ? primaryLeg.steps.map((step) => {
              const distanceValue = Number(step?.distance?.value ?? NaN);
              const durationValue = Number(step?.duration?.value ?? NaN);
              return {
                instruction: htmlToText(
                  step?.html_instructions || step?.instructions || ""
                ),
                distanceText:
                  step?.distance?.text ||
                  (Number.isFinite(distanceValue)
                    ? formatDistanceMeters(distanceValue)
                    : ""),
                distanceValue: Number.isFinite(distanceValue)
                  ? distanceValue
                  : null,
                durationText:
                  step?.duration?.text ||
                  (Number.isFinite(durationValue)
                    ? formatDurationSeconds(durationValue)
                    : ""),
                durationValue: Number.isFinite(durationValue)
                  ? durationValue
                  : null,
              };
            })
          : [];
        const geometry = Array.isArray(primaryRoute?.overview_path)
          ? primaryRoute.overview_path
              .map((point) => {
                if (!point) return null;
                if (typeof point.lat === "function" && typeof point.lng === "function") {
                  return { lat: point.lat(), lng: point.lng() };
                }
                if (Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
                  return { lat: point.lat, lng: point.lng };
                }
                if (
                  Number.isFinite(point.latitude) &&
                  Number.isFinite(point.longitude)
                ) {
                  return { lat: point.latitude, lng: point.longitude };
                }
                return null;
              })
              .filter(Boolean)
          : [];
        const distanceValue = Number(primaryLeg?.distance?.value ?? NaN);
        const durationValue = Number(primaryLeg?.duration?.value ?? NaN);
        setNavData({
          provider: "google",
          steps,
          distanceText:
            primaryLeg?.distance?.text ||
            (Number.isFinite(distanceValue)
              ? formatDistanceMeters(distanceValue)
              : ""),
          distanceValue: Number.isFinite(distanceValue)
            ? distanceValue
            : null,
          durationText:
            primaryLeg?.duration?.text ||
            (Number.isFinite(durationValue)
              ? formatDurationSeconds(durationValue)
              : ""),
          durationValue: Number.isFinite(durationValue)
            ? durationValue
            : null,
          geometry,
        });
        setNavError("");
        setNavStarted(false);
        setActiveStepIndex(0);
      } catch (err) {
        console.error("Failed to parse Google directions", err);
        setNavData(createEmptyNavState());
        setNavError("Unable to process directions right now.");
      } finally {
        setNavLoading(false);
      }
    },
    [pickupCoordinates, vendorCoordinates]
  );

  const handleToggleNavigation = useCallback(() => {
    if (navLoading || !routeReady) return;
    setNavStarted((prev) => {
      const next = !prev;
      if (!prev) {
        setActiveStepIndex(0);
        if (isCompactLayout) {
          setShowStepList(false);
        }
      }
      return next;
    });
  }, [navLoading, routeReady, isCompactLayout]);

  const handleNextStep = useCallback(() => {
    if (!stepCount) return;
    setActiveStepIndex((prev) => Math.min(prev + 1, Math.max(stepCount - 1, 0)));
  }, [stepCount]);

  const handlePrevStep = useCallback(() => {
    setActiveStepIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  return (
    <div className="vendor-job-detail">
      <header className="vendor-job-detail__header">
        <button
          type="button"
          className="vendor-job-detail__back"
          onClick={handleBack}
        >
          <span className="vendor-job-detail__back-icon" aria-hidden="true">
            &lt;
          </span>
          Back to jobs
        </button>
      </header>

      {loading ? (
        <div className="vendor-job-detail__loading">Loading job detail...</div>
      ) : error ? (
        <div className="vendor-job-detail__error">{error}</div>
      ) : !job ? (
        <div className="vendor-job-detail__error">Job not found.</div>
      ) : (
        <>
          <section className="vendor-job-detail__hero">
            <div className="vendor-job-detail__hero-main">
              <div className="hero-topline">
                <span className="hero-status">{formatStatusLabel(jobStatus)}</span>
                {assignedTimestamp ? (
                  <span className="hero-assigned">
                    Assigned {assignedTimestamp.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} - {assignedTimestamp.toLocaleDateString()}
                  </span>
                ) : null}
              </div>
              <h1>{job.serviceType || "Assigned job"}</h1>
              <p className="address">{job.pickupAddress || "Pickup address unavailable"}</p>
              <div className="meta">
                <span>{customerName}</span>
                <span>{distanceKm ? formatDistance(distanceKm) : "Distance TBD"}</span>
                {distanceKm ? <span>~{formatEta(distanceKm)} drive</span> : null}
              </div>
            </div>
            <div className="hero-actions">
              {customerPhone ? (
                <a className="primary" href={`tel:${customerPhone}`}>
                  Call customer
                </a>
              ) : null}
              {navigationUrl ? (
                <a className="ghost" href={navigationUrl} target="_blank" rel="noreferrer">
                  Open in Google Maps
                </a>
              ) : null}
            </div>
          </section>

          <section className="vendor-job-detail__body">
            <div className="vendor-job-detail__column">
              <div className="vendor-job-card status-card">
                <h2>Job status</h2>
                <div className="status-track">
                  {STATUS_SEQUENCE.map((step, index) => {
                    const active = statusIndex >= index;
                    return (
                      <div
                        key={step}
                        className={`status-step${
                          active ? " status-step--active" : ""
                        }`}
                      >
                        <span className="status-step__dot" />
                        <span className="status-step__label">
                          {formatStatusLabel(step)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="status-actions">
                  {statusActions.length > 0 ? (
                    statusActions.map((action) => (
                      <button
                        key={action.value}
                        type="button"
                        className={`btn${
                          action.variant === "ghost" ? " ghost" : ""
                        }`}
                        onClick={() => handleStatusChange(action.value)}
                        disabled={updatingStatus}
                      >
                        {updatingStatus ? "Updating..." : action.label}
                      </button>
                    ))
                  ) : (
                    <span className="status-note">You're all set here.</span>
                  )}
                </div>
                {statusMessage ? (
                  <div className="vendor-alert success">{statusMessage}</div>
                ) : null}
                {statusError ? (
                  <div className="vendor-alert error">{statusError}</div>
                ) : null}
              </div>

              <div className="vendor-job-card">
                <h2>Trip details</h2>
                <dl>
                  <div>
                    <dt>Customer</dt>
                    <dd>{customerName}</dd>
                  </div>
                  {customerPhone ? (
                    <div>
                      <dt>Phone</dt>
                      <dd>{customerPhone}</dd>
                    </div>
                  ) : null}
                  {dropoffAddress ? (
                    <div>
                      <dt>Dropoff</dt>
                      <dd>{dropoffAddress}</dd>
                    </div>
                  ) : null}
                  {paymentScreenEnabled ? (
                    <div>
                      <dt>Payment</dt>
                      <dd>
                        {job.paymentMode === "cash"
                          ? "Collect cash on completion"
                          : "Paid via platform"}
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Quoted price</dt>
                    <dd>
                      {job.finalPrice
                        ? `$${Number(job.finalPrice).toFixed(2)}`
                        : job.bidAmount
                        ? `$${Number(job.bidAmount).toFixed(2)}`
                        : "Coordinator will confirm"}
                    </dd>
                  </div>
                </dl>
              </div>

              {job?._id ? (
                <div className="vendor-job-card chat">
                  <h2>Message the customer</h2>
                  <p className="muted">{chatSubtitle}</p>
                  {chatStatusAllowed ? (
                    <ChatOverlay
                      title="Message the customer"
                      subtitle={chatSubtitle}
                      messages={messages}
                      participants={participants}
                      actorRole="vendor"
                      canMessage={canMessage && chatStatusAllowed}
                      onSend={sendMessage}
                      sending={sending}
                      loading={chatLoading}
                      error={chatError}
                      realtimeReady={realtimeReady}
                      typingIndicators={typingIndicators}
                      onTyping={emitTyping}
                      unreadCount={unreadCount}
                      defaultOpen={autoOpenChat && chatStatusAllowed && canMessage}
                    />
                  ) : (
                    <p className="muted">
                      Chat is available while a job is active. Once completed, customer
                      conversations are hidden for privacy.
                    </p>
                  )}
                </div>
              ) : null}

              {noteText ? (
                <div className="vendor-job-card">
                  <h2>Notes</h2>
                  <p className="note">{noteText}</p>
                </div>
              ) : null}

              <div className="vendor-job-card timeline">
                <h2>Before you go</h2>
                <ul>
                  <li>Confirm directions and message the customer before departure.</li>
                  <li>Update your status as you begin driving and when you arrive.</li>
                  <li>Use in-app chat if you are running late or need clarification.</li>
                  <li>Capture proof and mark complete before leaving the site.</li>
                </ul>
              </div>
            </div>

            <div className="vendor-job-detail__column">
              {showLiveMap ? (
                <div className="vendor-map-card">
                  <div className="map-head">
                    <h2>Live map</h2>
                    <p className="muted">
                      {pickupCoordinates && vendorCoordinates
                        ? "Visualizing your location and the pickup point."
                        : "Waiting for location lock."}
                    </p>
                  </div>
                  <div className="map-body">
                    {hasGoogle ? (
                      <GMap
                        vendors={vendorPins}
                        destination={destinationPoint}
                        center={
                          pickupCoordinates || vendorCoordinates || {
                            lat: 37.7749,
                            lng: -122.4194,
                          }
                        }
                        showRoute={Boolean(vendorPins.length && destinationPoint)}
                        onRouteResult={handleGoogleRoute}
                      />
                    ) : (
                      <LiveMap
                        vendors={vendorPins}
                        destination={liveMapDestination}
                        showRoute={Boolean(vendorPins.length && liveMapDestination)}
                        routeCoordinates={routeCoordinates}
                        routeDistanceMeters={
                          Number.isFinite(navData.distanceValue)
                            ? navData.distanceValue
                            : null
                        }
                      />
                    )}
                  </div>
                  <div className="map-footer">
                    <div className="map-footer__summary">
                      <strong>{navDistanceLabel}</strong>
                      {navDurationLabel ? <span>{navDurationLabel}</span> : null}
                    </div>
                    {navigationUrl ? (
                      <a
                        href={navigationUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="map-footer__external"
                      >
                        Open in Google Maps
                      </a>
                    ) : null}
                  </div>
                  <div className={`map-navigation${navStarted ? " is-active" : ""}${isCompactLayout ? " map-navigation--compact" : ""}`}>
                    <div className="map-navigation__head">
                      <div className="map-navigation__summary">
                        <span className="map-navigation__title">Trip navigation</span>
                        {routeReady ? (
                          <>
                            <span className="map-navigation__meta">
                              {navDistanceLabel}
                              {navDurationLabel ? ` - ${navDurationLabel}` : ""}
                            </span>
                            {currentStep ? (
                              <span className="map-navigation__current">
                                {navStarted ? "Next up" : "Preview"}: {currentStep.instruction || "Continue straight"}
                              </span>
                            ) : null}
                          </>
                        ) : null}
                        {navProviderLabel ? (
                          <span className="map-navigation__provider">{navProviderLabel}</span>
                        ) : null}
                      </div>
                      <div className="map-navigation__actions">
                        {routeReady && stepCount > 1 ? (
                          <button
                            type="button"
                            className="btn ghost map-navigation__toggle-steps"
                            onClick={() => setShowStepList((prev) => !prev)}
                          >
                            {showStepList ? "Hide steps" : "View steps"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn map-navigation__toggle"
                          onClick={handleToggleNavigation}
                          disabled={navLoading || !routeReady}
                        >
                          {navLoading
                            ? "Calculating..."
                            : navStarted
                            ? "Pause navigation"
                            : routeReady
                            ? "Start navigation"
                            : "Preparing route"}
                        </button>
                      </div>
                    </div>
                    {navError ? (
                      <p className="map-navigation__error">{navError}</p>
                    ) : routeReady ? (
                      <>
                        {currentStep ? (
                          <div className="map-navigation__step-card">
                            <span className="map-navigation__index">{boundedStepIndex + 1}</span>
                            <div className="map-navigation__step-detail">
                              <span className="map-navigation__chip">{navStarted ? "Next up" : "Preview"}</span>
                              <p className="map-navigation__instruction">
                                {currentStep.instruction || "Continue straight"}
                              </p>
                              <p className="map-navigation__step-meta">
                                {[currentStep.distanceText || "--", currentStep.durationText]
                                  .filter(Boolean)
                                  .join(" - ") || "--"}
                              </p>
                            </div>
                          </div>
                        ) : null}
                        {stepCount > 1 ? (
                          <ol className={`map-navigation__steps${showStepList ? " is-expanded" : ""}`}>
                            {navData.steps.map((step, index) => (
                              <li
                                key={`nav-step-${index}`}
                                className={`map-navigation__step${navStarted && index === boundedStepIndex ? " is-active" : ""}`}
                              >
                                <span className="map-navigation__index">{index + 1}</span>
                                <div className="map-navigation__body">
                                  <p className="map-navigation__instruction">
                                    {step.instruction || "Continue"}
                                  </p>
                                  <p className="map-navigation__step-meta">
                                    {[step.distanceText || "--", step.durationText]
                                      .filter(Boolean)
                                      .join(" - ") || "--"}
                                  </p>
                                </div>
                              </li>
                            ))}
                          </ol>
                        ) : null}
                        {navStarted && stepCount > 0 ? (
                          <div className="map-navigation__controls">
                            <button
                              type="button"
                              className="btn ghost"
                              onClick={handlePrevStep}
                              disabled={boundedStepIndex === 0}
                            >
                              Back
                            </button>
                            <button
                              type="button"
                              className="btn"
                              onClick={handleNextStep}
                              disabled={isLastStep}
                            >
                              {isLastStep ? "Arrived" : "Next step"}
                            </button>
                          </div>
                        ) : null}
                      </>
                    ) : navLoading ? (
                      <p className="map-navigation__status">Calculating the best route...</p>
                    ) : (
                      <p className="map-navigation__status">
                        Tap "Start navigation" to view step-by-step directions.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="vendor-map-card">
                  <div className="map-head">
                    <h2>Navigation</h2>
                    <p className="muted">
                      Live mapping is disabled by your administrator. Use the link below
                      to launch your preferred navigation app.
                    </p>
                  </div>
                  <div className="map-body">
                    <p className="muted small">
                      {navigationUrl
                        ? "Tap the button to open Google Maps with the pickup destination pre-filled."
                        : "Navigation is unavailable for this job."}
                    </p>
                  </div>
                  {navigationUrl ? (
                    <div className="map-footer">
                      <a
                        href={navigationUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="map-footer__external"
                      >
                        Open in Google Maps
                      </a>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
