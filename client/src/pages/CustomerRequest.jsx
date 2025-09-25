import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import GuestRequest from "./GuestRequest";

export default function CustomerRequest() {
  const navigate = useNavigate();
  const [initialValues, setInitialValues] = useState({});
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/api/customer/auth/me");
        if (cancelled) return;
        const profile =
          data?.customer || data?.profile || (data?._id ? data : null) || {};
        setInitialValues({
          name: profile.name || "",
          phone: profile.phone || "",
          email: profile.email || "",
        });
        setLoadError("");
      } catch (error) {
        if (cancelled) return;
        setLoadError(
          error?.response?.data?.message || "We couldn't load your saved details."
        );
        setInitialValues({});
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const subtitleText = loadError
    ? "We couldn't fetch your saved details. Enter them below."
    : "You're signed in. We'll keep this tied to your account.";

  const transformCustomerPayload = (data) => {
    const trimmedAddress = data.address?.trim();
    const hasCoordinates =
      data.coordinates &&
      typeof data.coordinates.lat === "number" &&
      typeof data.coordinates.lng === "number";

    if (!trimmedAddress) {
      throw new Error("Please enter your pickup address.");
    }

    if (!hasCoordinates && data.locationType !== "manual") {
      throw new Error("Please set your vehicle location on the map.");
    }

    const coords = hasCoordinates ? data.coordinates : null;

    return {
      name: data.name.trim(),
      phone: data.phone.trim(),
      email: data.email?.trim() || undefined,
      serviceType: data.serviceType.trim(),
      notes: data.description ? data.description.trim() : undefined,
      urgency: data.urgency,
      heavyDuty: /heavy/i.test(data.serviceType),
      dropoffAddress: data.destination || undefined,
      pickupAddress: trimmedAddress,
      pickupLat: coords?.lat,
      pickupLng: coords?.lng,
      shareLive: data.locationType === "current",
      vehiclePinned: data.locationType !== "map",
      vehicle: {
        make: data.vehicleMake,
        model: data.vehicleModel,
        color: data.vehicleColor,
      },
      vehicleMake: data.vehicleMake,
      vehicleModel: data.vehicleModel,
      vehicleColor: data.vehicleColor,
      distanceMeters: data.distanceInfo?.meters,
      distanceText: data.distanceInfo?.distance,
      etaSeconds: data.distanceInfo?.seconds,
    };
  };

  const submitCustomerRequest = async (payload) => {
    const { data } = await api.post("/api/public/jobs", payload);
    return data;
  };

  const handleCustomerSuccess = (result) => {
    const token =
      result?.customerToken ||
      (result?.customerLink ? String(result.customerLink).split("/").pop() : null);
    if (token) {
      navigate(`/choose/${token}`);
      return;
    }
    if (result?.statusPath) {
      navigate(result.statusPath);
      return;
    }
    navigate("/customer/home");
  };

  if (loadingProfile) {
    return (
      <div className="guest-request-container">
        <div className="request-header">
          <h1>Preparing your request...</h1>
          <p className="subtitle">Loading your profile details.</p>
        </div>
      </div>
    );
  }

  return (
    <GuestRequest
      variant="customer"
      heading="Request roadside assistance"
      subtitle={subtitleText}
      initialValues={initialValues}
      requireEmail={false}
      transformRequest={transformCustomerPayload}
      submitRequest={submitCustomerRequest}
      onSuccess={(result) => handleCustomerSuccess(result)}
    />
  );
}
