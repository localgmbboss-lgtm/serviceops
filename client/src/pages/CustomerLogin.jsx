import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import "./CustomerLogin.css";

const normalizePhone = (input = "") => {
  const trimmed = String(input).trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) {
    return "+" + trimmed.slice(1).replace(/\D+/g, "");
  }
  return trimmed.replace(/\D+/g, "");
};

export default function CustomerLogin() {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const nav = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");

    try {
      const normalized = normalizePhone(phone);
      if (!normalized) {
        throw new Error("Enter a valid phone number");
      }

      const { data } = await api.post("/api/customer/auth/phone-login", {
        phone: normalized,
        name: name.trim() || undefined,
      });

      const customer = data.customer || {};
      login(
        {
          ...customer,
          role: "customer",
          name: customer.name || name.trim() || "Customer",
        },
        data.token
      );

      nav("/customer/home", { replace: true });
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "We couldn't sign you in with that number."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="customer-login-container">
      <div className="customer-login-bg-shapes" aria-hidden="true">
        <span className="shape shape-1" />
        <span className="shape shape-2" />
        <span className="shape shape-3" />
      </div>

      <div className="customer-login-card" role="presentation">
        <header className="customer-login-header">
          <p className="customer-login-eyebrow">Customer Access</p>
          <h1 className="customer-login-title">Sign in with your phone</h1>
          <p className="customer-login-subtitle">
            No passwords or codes required-just confirm the number you use with
            ServiceOps and jump right back into your dashboard.
          </p>
        </header>

        {error && <div className="customer-login-alert error">{error}</div>}

        <form className="customer-login-form" onSubmit={handleSubmit}>
          <label className="customer-login-field">
            <span className="customer-login-label">Phone number</span>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+1 555 123 4567"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              required
              disabled={busy}
            />
          </label>

          <label className="customer-login-field">
            <span className="customer-login-label">
              Name <span className="optional">(optional)</span>
            </span>
            <input
              type="text"
              autoComplete="name"
              placeholder="What should we call you?"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={busy}
            />
          </label>

          <button type="submit" className="customer-login-submit" disabled={busy}>
            {busy ? "Signing you in..." : "Continue"}
          </button>
        </form>

        <footer className="customer-login-footer">
          <p className="muted tiny">
            Need help? Reach out to support and we'll make sure your number is
            linked to your account.
          </p>
        </footer>
      </div>
    </div>
  );
}

