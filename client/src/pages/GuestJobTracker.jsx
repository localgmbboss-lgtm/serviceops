// src/pages/GuestJobTracker.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import GMap from "../components/GMap";
import { deriveCustomerCoordinates, deriveDropoffCoordinates, deriveDriverCoordinates } from "../utils/geo";
import LiveMap from "../components/LiveMap";
import { getGoogleMapsKey } from "../config/env.js";
import ReviewFunnel from "../components/ReviewFunnel";
import "./GuestJobTracker.css";

const REFRESH_MS = 10000;
const STEPS = ["Unassigned", "Assigned", "OnTheWay", "Arrived", "Completed"];

export default function GuestJobTracker() {
  const { jobToken } = useParams();
  const [job, setJob] = useState(null);
  const [vendor, setVendor] = useState(null);
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [selecting, setSelecting] = useState("");
  const timerRef = useRef(null);

  const hasGoogle = Boolean(getGoogleMapsKey());

  const fetchData = async () => {
    if (!jobToken) return;
    setError("");
    setRefreshing(true);
    try {
      const { data: jobData } = await api.get(`/api/jobs/guest/${jobToken}`);
      if (!jobData?.success) {
        throw new Error(jobData?.message || "Job not found or token expired");
      }

      const bidsRes = await api
        .get(`/api/bids/list/${jobToken}`)
        .then((res) => res.data)
        .catch((err) => {
          if (err?.response?.status === 404) return null;
          throw err;
        });

      const mergedJob = {
        ...(jobData.job || {}),
        ...(bidsRes?.job ? { selectedBidId: bidsRes.job.selectedBidId } : {}),
        biddingOpen:
          bidsRes?.job?.biddingOpen ?? jobData.job?.biddingOpen ?? false,
      };

      setJob(mergedJob);
      setVendor(jobData.vendor || null);
      setBids(Array.isArray(bidsRes?.bids) ? bidsRes.bids : []);
    } catch (err) {
      const msg =
        err?.response?.data?.message || err?.message || "Failed to load job";
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchData();
    timerRef.current = setInterval(fetchData, REFRESH_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobToken]);

  const selectBid = async (bidId) => {
    try {
      setSelecting(bidId);
      await api.post(`/api/bids/${bidId}/select`);
      await fetchData();
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to select bid";
      setError(msg);
    } finally {
      setSelecting("");
    }
  };

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

  const customerCoordinates = useMemo(() => deriveCustomerCoordinates(job), [job]);
  const dropoffCoordinates = useMemo(() => deriveDropoffCoordinates(job), [job]);

  const routeDestination = useMemo(() => {
    if (customerCoordinates) {
      return {
        position: customerCoordinates,
        label: "CUST",
        role: "customer",
        title: pickupAddress || "Pickup location",
        color: "#f97316",
        textColor: "#0f172a",
        avatarUrl: (job?.customer?.avatarUrl || job?.customer?.photoUrl || job?.customer?.photo || job?.customer?.image) ?? null,
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
  }, [customerCoordinates, dropoffCoordinates, pickupAddress, dropoffAddress]);

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
    if (!vendor) return [];
    const coords = deriveDriverCoordinates(vendor);
    if (!coords) return [];
    return [
      {
        ...vendor,
        lat: coords.lat,
        lng: coords.lng,
        label: "DRV",
        avatarUrl: vendor?.avatarUrl || vendor?.photoUrl || vendor?.photo || vendor?.image || null,
        title: vendor.name ? `${vendor.name}` : "Driver",
        color: "#2563eb",
        textColor: "#ffffff",
      },
    ];
  }, [vendor]);

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

  const canShowRoute = driverMarkers.length > 0 && Boolean(routeDestination?.position);


if (loading) {
    return (
      <div className="guestdash guestdash--state">
        <div className="guestdash-state-card">
          <p className="guestdash-state-text">Loading job details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="guestdash guestdash--state">
        <div className="guestdash-state-card">
          <p className="guestdash-state-text guestdash-state-text--error">{error}</p>
          <button className="btn" onClick={fetchData} disabled={refreshing}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="guestdash guestdash--state">
        <div className="guestdash-state-card">
          <p className="guestdash-state-text">Unable to locate this job.</p>
        </div>
      </div>
    );
  }

  const currentStatus = job.status || "Unassigned";
  const createdAt = job?.created
    ? new Date(job.created).toLocaleString()
    : job?.createdAt
    ? new Date(job.createdAt).toLocaleString()
    : "-";

  const currentIndex = Math.max(STEPS.indexOf(currentStatus), 0);
  const statusClass = currentStatus.toLowerCase();

  return (
    <div className="guestdash">
      <div className="card guestdash-card">
        <div className="guestdash-card__header">
          <h2>Job Status</h2>
          <button className="btn ghost" onClick={fetchData} disabled={refreshing}>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
        <p>
          <strong>Current status:</strong>{" "}
          <span className={`badge status ${statusClass}`}>{currentStatus}</span>
        </p>
        <ul className="timeline">
          {STEPS.map((step, index) => {
            const state =
              index === currentIndex ? "active" : index < currentIndex ? "done" : "";
            return (
              <li key={step} className={state}>
                {step}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="card guestdash-card">
        <h3>Job details</h3>
        <p>
          <strong>Service:</strong> {job.serviceType || "Service request"}
        </p>
        <p>
          <strong>Pickup:</strong> {job.pickupAddress || "-"}
        </p>
        {job.dropoffAddress && (
          <p>
            <strong>Drop-off:</strong> {job.dropoffAddress}
          </p>
        )}
        {job.notes && (
          <p>
            <strong>Notes:</strong> {job.notes}
          </p>
        )}
        <p>
          <strong>Created:</strong> {createdAt}
        </p>
      </div>

      {driverMarkers.length > 0 && (
        <div className="card guestdash-card">
          <h3>Live driver map</h3>
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
                center={mapCenter ? [mapCenter.lat, mapCenter.lng] : [6.5244, 3.3792]}
                destination={fallbackDestination}
              />
              <p className="muted tiny">
                Add a Google Maps key for routing. Showing driver position only.
              </p>
            </>
          )}
          <p className="muted tiny">
            Last updated: {vendor?.lastSeenAt ? new Date(vendor.lastSeenAt).toLocaleString() : "unknown"}
          </p>
        </div>
      )}

      <div className="card guestdash-card">
        <h3>Vendor updates</h3>
        {vendor ? (
          <ul className="list">
            <li>
              <strong>{vendor.name || "Vendor"}</strong>
              {vendor.phone && <span className="muted"> - {vendor.phone}</span>}
            </li>
            {vendor.city && (
              <li>
                <strong>City:</strong> {vendor.city}
              </li>
            )}
            {vendor.totalJobs && (
              <li>
                <strong>Jobs completed:</strong> {vendor.totalJobs}
              </li>
            )}
          </ul>
        ) : (
          <p className="muted">
            A vendor has not been assigned yet. You will see updates here once a bid is chosen.
          </p>
        )}
      </div>

      {job.biddingOpen && bids.length > 0 && (
        <div className="card guestdash-card">
          <h3>Available bids</h3>
          <ul className="list">
            {bids.map((bid) => (
              <li key={bid._id} className="bid-card">
                <div>
                  <strong>{bid.vendorName || "Vendor"}</strong>
                  <span className="muted"> - ETA {bid.etaMinutes} min</span>
                </div>
                <div className="row gap">
                  <span className="chip">${Number(bid.price || 0).toLocaleString()}</span>
                  <button
                    className="btn"
                    onClick={() => selectBid(bid._id)}
                    disabled={!!selecting}
                  >
                    {selecting === bid._id ? "Selecting..." : "Select bid"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {job.status === "Completed" && (
        <div className="card guestdash-card">
          <h3>Share your experience</h3>
          <ReviewFunnel jobId={job._id} />
        </div>
      )}
    </div>
  );
}




















