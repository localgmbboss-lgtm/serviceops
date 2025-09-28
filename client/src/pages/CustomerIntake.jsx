import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import "./CustomerIntake.css";

const SERVICES = [
  "Towing service",
  "Jumpstart",
  "Flat tire",
  "Lockout",
  "Fuel delivery",
  "Heavy duty",
  "Custom",
];

export default function CustomerIntake() {
  const { token } = useParams();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    serviceType: "Towing service",
    vehicleType: "",
    pickupAddress: "",
    dropoffAddress: "",
    notes: "",
    lat: null,
    lng: null,
  });
  const [done, setDone] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    // capture GPS (best-effort)
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }));
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 8000 }
    );
    return () => id && navigator.geolocation.clearWatch?.(id);
  }, []);

  const submit = async () => {
    try {
      const payload = { ...form };
      // if Custom, keep serviceType as entered in "vehicleType"? No: prompt separately
      if (!payload.name || !payload.phone || !payload.pickupAddress) {
        setErr("Name, phone and pickup address are required.");
        return;
      }
      const { data } = await api.post(
        `/api/public/intake/${token}/submit`,
        payload
      );
      setDone(data);
      setErr("");
    } catch (e) {
      setErr(e?.response?.data?.message || "Failed to submit");
    }
  };

  if (done) {
    return (
      <div className="container intake">
        <div className="card">
          <h2>Request received </h2>
          <p>We've sent your request to nearby operators.</p>
          <p>You can view bids here:</p>
          <p>
            <a className="btn" href={done.customerLink}>
              Open Bids
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container intake">
      <div className="card">
        <h2>Request Tow / Roadside Help</h2>
        {err && <p className="error">{err}</p>}
        <div className="row stack">
          <input
            placeholder="Your name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <input
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
          <label>
            <span>Service</span>
            <select
              value={form.serviceType}
              onChange={(e) =>
                setForm((f) => ({ ...f, serviceType: e.target.value }))
              }
            >
              {SERVICES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <input
            placeholder="Vehicle (e.g., Car / SUV / Heavy duty)"
            value={form.vehicleType}
            onChange={(e) =>
              setForm((f) => ({ ...f, vehicleType: e.target.value }))
            }
          />
          <input
            placeholder="Pickup address"
            value={form.pickupAddress}
            onChange={(e) =>
              setForm((f) => ({ ...f, pickupAddress: e.target.value }))
            }
          />
          <input
            placeholder="Drop-off (optional)"
            value={form.dropoffAddress}
            onChange={(e) =>
              setForm((f) => ({ ...f, dropoffAddress: e.target.value }))
            }
          />
          <textarea
            rows="3"
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
          <div className="muted small">
            {form.lat && form.lng
              ? `Location captured  (${form.lat.toFixed(
                  5
                )}, ${form.lng.toFixed(5)})`
              : "We'll try to capture your GPS location automatically."}
          </div>
          <button onClick={submit}>Submit Request</button>
        </div>
      </div>
    </div>
  );
}

