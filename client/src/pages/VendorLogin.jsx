import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { vendorApi } from "../lib/vendorApi";
import "./VendorLogin.css";

const normalizePhone = (input = "") => {
  const trimmed = String(input).trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) {
    return "+" + trimmed.slice(1).replace(/\D+/g, "");
  }
  return trimmed.replace(/\D+/g, "");
};

export default function VendorLogin() {
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { login, logout, token } = useAuth();
  const nav = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");

    try {
      logout?.();

      const normalized = normalizePhone(phone);
      if (!normalized) {
        throw new Error("Enter a valid phone number");
      }

      const { data } = await vendorApi.post("/api/vendor/auth/phone-login", {
        phone: normalized,
      });

      const vendor = data.vendor || {};
      const vendToken = data.token || "";

      if (vendToken) {
        localStorage.setItem("vendorToken", vendToken);
      }

      const nextToken = vendToken || token || "";

      login(
        {
          ...vendor,
          role: "vendor",
          name: vendor.name || "Vendor",
        },
        nextToken
      );

      if (nextToken) {
        vendorApi.defaults.headers.common.Authorization =
          "Bearer " + nextToken;
      } else {
        delete vendorApi.defaults.headers.common.Authorization;
      }

      nav("/vendor/app", { replace: true });
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "We couldn't find a vendor with that number."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vendor-login">
      <div className="vendor-login-card">
        <header className="vendor-login-head">
          <p className="vendor-login-eyebrow">Vendor Access</p>
          <h1>Sign in with your phone</h1>
          <p className="vendor-login-sub">
            Enter the phone number associated with your vendor profile to open
            your live dispatch board.
          </p>
        </header>

        {error && <div className="vendor-login-alert error">{error}</div>}

        <form className="vendor-login-form" onSubmit={handleSubmit}>
          <label className="form-label">Phone number</label>
          <input
            className="form-input"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+1 555 555 1234"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            required
            disabled={busy}
          />

          <button className="vendor-login-btn" disabled={busy} type="submit">
            {busy ? <div className="btn-loader" /> : "Continue"}
          </button>
        </form>

        <footer className="vendor-login-footer">
          <p className="vendor-login-help">
            Don't have a profile yet? Contact dispatch so we can add your
            details and route requests your way.
          </p>
        </footer>
      </div>
    </div>
  );
}

