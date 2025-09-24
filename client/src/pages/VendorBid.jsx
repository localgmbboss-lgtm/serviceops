import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import "./VendorBid.css";

export default function VendorBid() {
  const { vendorToken } = useParams();
  const [job, setJob] = useState(null);
  const [form, setForm] = useState({
    vendorName: "",
    vendorPhone: "",
    etaMinutes: "",
    price: "",
  });
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const isFixed = job?.bidMode === "fixed";

  useEffect(() => {
    api
      .get(`/api/bids/job/${vendorToken}`)
      .then((response) => {
        const data = response.data;
        setJob(data);
        if (data?.bidMode === "fixed" && data?.quotedPrice != null) {
          setForm((prev) => ({ ...prev, price: String(data.quotedPrice) }));
        }
      })
      .catch((error) =>
        setErr(error?.response?.data?.message || "Link invalid or bidding closed")
      );
  }, [vendorToken]);

  const updateField = (key) => (event) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setErr("");
    setOk("");

    const eta = Number(form.etaMinutes);
    const quoted = Number(job?.quotedPrice ?? 0);
    const price = isFixed ? quoted : Number(form.price);

    if (!Number.isFinite(eta) || eta <= 0) {
      setErr("Enter a valid ETA in minutes.");
      return;
    }
    if (!isFixed && (!Number.isFinite(price) || price < 0)) {
      setErr("Enter a valid price.");
      return;
    }

    try {
      await api.post(`/api/bids/${vendorToken}`, {
        vendorName: form.vendorName.trim(),
        vendorPhone: form.vendorPhone.trim(),
        etaMinutes: eta,
        price,
      });
      setOk(isFixed ? "ETA submitted!" : "Bid submitted!");
    } catch (error) {
      setErr(error?.response?.data?.message || "Failed to submit bid");
    }
  };

  if (err)
    return (
      <div className="card">
        <p className="error">{err}</p>
      </div>
    );
  if (!job) return <p>Loading...</p>;

  return (
    <div className="card">
      <h2>{isFixed ? "Confirm ETA" : "Bid this job"}</h2>
      <p>
        <strong>Service:</strong> {job.serviceType}
      </p>
      <p>
        <strong>Pickup:</strong> {job.pickupAddress}
      </p>
      {isFixed && (
        <p>
          <strong>Fixed payout:</strong> ₦{Number(job?.quotedPrice ?? 0).toFixed(2)}
        </p>
      )}
      {job.dropoffAddress && (
        <p>
          <strong>Drop-off:</strong> {job.dropoffAddress}
        </p>
      )}

      <form onSubmit={submit} className="stack">
        <input
          placeholder="Your company / name"
          value={form.vendorName}
          onChange={updateField("vendorName")}
          required
        />
        <input
          placeholder="Your phone"
          value={form.vendorPhone}
          onChange={updateField("vendorPhone")}
          required
        />
        <input
          type="number"
          min="1"
          placeholder="ETA (minutes)"
          value={form.etaMinutes}
          onChange={updateField("etaMinutes")}
          required
        />
        {isFixed ? (
          <div className="vendorbid-fixed">
            <strong>Fixed payout:</strong>
            <span>₦{Number(job?.quotedPrice ?? 0).toFixed(2)}</span>
            <small>Only an ETA is required for this job.</small>
          </div>
        ) : (
          <input
            type="number"
            min="0"
            step="1"
            placeholder="Price"
            value={form.price}
            onChange={updateField("price")}
            required
          />
        )}
        <button className="btn" type="submit">
          {isFixed ? "Submit ETA" : "Submit Bid"}
        </button>
      </form>

      {ok && <div className="alert ok">{ok}</div>}
      {err && <div className="alert error">{err}</div>}
    </div>
  );
}


