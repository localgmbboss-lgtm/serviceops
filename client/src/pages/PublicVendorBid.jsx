import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";

const clampNum = (n, lo, hi) => {
  const value = Number(n);
  if (!Number.isFinite(value)) return NaN;
  return Math.max(lo, Math.min(hi, value));
};

export default function PublicVendorBid() {
  const { vendorToken } = useParams();

  const [info, setInfo] = useState(null);
  const [form, setForm] = useState({
    vendorName: "",
    vendorPhone: "",
    etaMinutes: "",
    price: "",
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("vendorProfile");
      if (!raw) return;
      const saved = JSON.parse(raw);
      setForm((prev) => ({
        ...prev,
        vendorName: saved.vendorName || prev.vendorName,
        vendorPhone: saved.vendorPhone || prev.vendorPhone,
      }));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr("");
      setMsg("");
      try {
        const { data } = await api.get(`/api/bids/job/${vendorToken}`);
        if (!alive) return;
        setInfo(data);
        if (data?.bidMode === "fixed" && data?.quotedPrice != null) {
          setForm((prev) => ({ ...prev, price: String(data.quotedPrice) }));
        }
      } catch (error) {
        if (!alive) return;
        setErr(error?.response?.data?.message || "Link invalid or bidding closed");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [vendorToken]);

  const onChange = (field) => (event) =>
    setForm((prev) => ({
      ...prev,
      [field]: event.target.value,
    }));

  const isFixed = info?.bidMode === "fixed";

  const etaValid = useMemo(() => {
    const value = clampNum(form.etaMinutes, 1, 720);
    return Number.isFinite(value);
  }, [form.etaMinutes]);

  const priceValid = useMemo(() => {
    if (isFixed) return true;
    const value = clampNum(form.price, 0, 1_000_000);
    return Number.isFinite(value);
  }, [form.price, isFixed]);

  const canSubmit =
    !submitting &&
    form.vendorName.trim() &&
    form.vendorPhone.trim() &&
    etaValid &&
    (isFixed || priceValid);

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setErr("");
    setMsg("");

    try {
      const eta = clampNum(form.etaMinutes, 1, 720);
      const price = isFixed
        ? Number(info?.quotedPrice ?? 0)
        : clampNum(form.price, 0, 1_000_000);

      await api.post(`/api/bids/${vendorToken}`, {
        vendorName: form.vendorName.trim(),
        vendorPhone: form.vendorPhone.trim(),
        etaMinutes: eta,
        price,
      });

      try {
        localStorage.setItem(
          "vendorProfile",
          JSON.stringify({
            vendorName: form.vendorName.trim(),
            vendorPhone: form.vendorPhone.trim(),
          })
        );
      } catch {
        /* ignore */
      }

      setMsg(
        isFixed
          ? "ETA submitted. You'll be notified if selected."
          : "Bid submitted. You'll be notified if selected."
      );
    } catch (error) {
      setErr(error?.response?.data?.message || "Failed to submit bid");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="container">
        <div className="card">
          <h2>{isFixed ? "Confirm ETA" : "Place a Bid"}</h2>
          <p className="error">{err}</p>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="container">
        <div className="card">
          <p>Job not available.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 560 }}>
      <div className="card">
        <h2>{isFixed ? "Confirm ETA" : "Place a Bid"}</h2>

        <div className="muted" style={{ marginBottom: 12 }}>
          <div>
            <b>Service:</b> {info.serviceType || "Tow"}
          </div>
          <div>
            <b>Pickup:</b> {info.pickupAddress}
          </div>
          {isFixed && (
            <div>
              <b>Fixed payout:</b> ₦{Number(info?.quotedPrice ?? 0).toFixed(2)}
            </div>
          )}
          {info.dropoffAddress && (
            <div>
              <b>Drop-off:</b> {info.dropoffAddress}
            </div>
          )}
        </div>

        {msg && <div className="alert ok" style={{ marginBottom: 12 }}>{msg}</div>}
        {err && <div className="alert error" style={{ marginBottom: 12 }}>{err}</div>}

        <form onSubmit={submit} className="grid" style={{ gap: 12 }}>
          <input
            placeholder="Company / Driver name"
            value={form.vendorName}
            onChange={onChange("vendorName")}
            required
          />
          <input
            placeholder="Phone"
            value={form.vendorPhone}
            onChange={onChange("vendorPhone")}
            required
          />
          <div className="row" style={{ gap: 12 }}>
            <input
              type="number"
              min="1"
              max="720"
              inputMode="numeric"
              placeholder="ETA (minutes)"
              value={form.etaMinutes}
              onChange={onChange("etaMinutes")}
              required
              className={!etaValid && form.etaMinutes ? "error" : ""}
              style={{ flex: 1 }}
            />
            {isFixed ? (
              <div
                style={{
                  flex: 1,
                  background: "#f5f7ff",
                  borderRadius: 8,
                  padding: 10,
                  border: "1px solid rgba(59, 130, 246, 0.35)",
                }}
              >
                <strong>Fixed payout:</strong> ₦{Number(info?.quotedPrice ?? 0).toFixed(2)}
                <small style={{ display: "block", marginTop: 4 }}>
                  Price is locked. Only your ETA is required.
                </small>
              </div>
            ) : (
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="Price ($)"
                value={form.price}
                onChange={onChange("price")}
                required
                className={!priceValid && form.price ? "error" : ""}
                style={{ flex: 1 }}
              />
            )}
          </div>

          <button className="btn" disabled={!canSubmit}>
            {submitting ? "Sending..." : isFixed ? "Send ETA" : "Send bid"}
          </button>
          <p className="muted small">
            You can reopen this link to update your {isFixed ? "ETA" : "bid"} until the customer selects a vendor.
          </p>
        </form>
      </div>
    </div>
  );
}




