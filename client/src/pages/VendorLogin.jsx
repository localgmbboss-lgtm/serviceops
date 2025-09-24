import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { vendorApi } from "../lib/vendorApi";
import "./VendorLogin.css";

function normalizePhone(input) {
  if (!input) return "";
  const trimmed = String(input).trim();
  return trimmed.startsWith("+")
    ? "+" + trimmed.slice(1).replace(/\D+/g, "")
    : trimmed.replace(/\D+/g, "");
}
function normalizeEmail(input) {
  return String(input || "")
    .trim()
    .toLowerCase();
}

export default function VendorLogin() {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [idMode, setIdMode] = useState("phone"); // "phone" | "email"
  const [form, setForm] = useState({
    name: "",
    identifier: "", // phone or email depending on idMode
    phone: "",
    email: "",
    city: "",
    password: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState(false);
  const nav = useNavigate();
  const { login, logout } = useAuth();

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    setSuccess(false);

    try {
      // Clear any stale session (prevents UI mixing users)
      logout?.();

      let res;
      if (mode === "login") {
        if (!form.identifier || !form.password) {
          throw new Error("Enter your phone or email and password.");
        }
        const payload =
          idMode === "phone"
            ? {
                phone: normalizePhone(form.identifier),
                password: form.password,
              }
            : {
                email: normalizeEmail(form.identifier),
                password: form.password,
              };

        if (!payload.phone && !payload.email) {
          throw new Error("Enter a valid phone or email.");
        }

        res = await vendorApi.post("/api/vendor/auth/login", payload);
      } else {
        // register
        if (!form.name || !form.password || !form.identifier) {
          throw new Error(
            `Please enter ${
              idMode === "phone" ? "phone" : "email"
            }, business/driver name, and password.`
          );
        }

        const payload =
          idMode === "phone"
            ? {
                name: form.name.trim(),
                phone: normalizePhone(form.identifier),
                email: form.email ? normalizeEmail(form.email) : undefined,
                city: form.city || undefined,
                password: form.password,
              }
            : {
                name: form.name.trim(),
                email: normalizeEmail(form.identifier),
                phone: form.phone ? normalizePhone(form.phone) : undefined,
                city: form.city || undefined,
                password: form.password,
              };

        if (idMode === "phone" && !payload.phone) {
          throw new Error("Enter a valid phone number.");
        }
        if (idMode === "email" && !payload.email) {
          throw new Error("Enter a valid email address.");
        }

        res = await vendorApi.post("/api/vendor/auth/register", payload);
      }

      const { data } = res;
      const vendor = data.vendor || data.user || {};
      const token = data.token;

      // Log in through context (will persist vendorToken)
      login(
        {
          ...vendor,
          role: "vendor",
          name: vendor.name || form.name || "Vendor",
        },
        token,
        { tokenBucket: "vendorToken" } // if your context supports specifying a bucket
      );

      // Fallback: ensure localStorage token is set for vendorApi interceptor
      if (token) localStorage.setItem("vendorToken", token);

      setSuccess(true);
      setTimeout(() => nav("/vendor/app"), 1200);
    } catch (ex) {
      setErr(ex?.response?.data?.message || ex.message || "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const identifierLabel = idMode === "phone" ? "Phone" : "Email";
  const identifierType = idMode === "phone" ? "tel" : "email";
  const identifierPlaceholder =
    idMode === "phone" ? "+1 555 123 4567" : "you@company.com";
  const identifierAutoComplete =
    idMode === "phone" ? "tel" : mode === "login" ? "email" : "username";
  const identifierInputMode = idMode === "phone" ? "tel" : "email";

  return (
    <div className="vendor-login-container">
      {/* Animated Background Elements */}
      <div className="vendor-login-bg-shapes">
        <div className="shape shape-1"></div>
        <div className="shape shape-2"></div>
        <div className="shape shape-3"></div>
      </div>

      <div className="vendor-login-card">
        {/* Success Animation */}
        {success && (
          <div className="vendor-login-success">
            <div className="success-animation">
              <svg
                className="checkmark"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 52 52"
              >
                <circle
                  className="checkmark__circle"
                  cx="26"
                  cy="26"
                  r="25"
                  fill="none"
                />
                <path
                  className="checkmark__check"
                  fill="none"
                  d="M14.1 27.2l7.1 7.2 16.7-16.8"
                />
              </svg>
            </div>
            <p className="success-message">
              {mode === "login"
                ? "Login successful!"
                : "Account created successfully!"}
            </p>
          </div>
        )}

        <header className="vendor-login-header">
          <div className="vendor-login-icon">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
            </svg>
          </div>
          <h1 className="vendor-login-title">
            {mode === "login" ? "Vendor Sign In" : "Create Vendor Account"}
          </h1>
          <p className="vendor-login-subtitle">
            {mode === "login"
              ? "Access your vendor dashboard to receive jobs and place bids."
              : "Join our network of service providers and start receiving job requests."}
          </p>
        </header>

        {err && (
          <div className="vendor-login-alert error">
            <span className="alert-icon">⚠️</span>
            {err}
          </div>
        )}

        <form className="vendor-login-form" onSubmit={submit}>
          {mode === "register" && (
            <>
              <div className="form-group">
                <label className="form-label">Business / Driver Name</label>
                <input
                  className="form-input"
                  value={form.name}
                  onChange={set("name")}
                  placeholder="e.g., Fast Tow LLC"
                  required
                  disabled={busy}
                  autoComplete="organization"
                />
              </div>
              <div className="form-group">
                <label className="form-label">
                  City <span className="optional">(optional)</span>
                </label>
                <input
                  className="form-input"
                  value={form.city}
                  onChange={set("city")}
                  placeholder="Your service area"
                  disabled={busy}
                  autoComplete="address-level2"
                />
              </div>
            </>
          )}

          {/* Identifier + toggle */}
          <div className="form-group">
            <div className="form-label-row">
              <label className="form-label">{identifierLabel}</label>
              <div className="id-toggle">
                <button
                  type="button"
                  className={`id-toggle-btn ${
                    idMode === "phone" ? "active" : ""
                  }`}
                  onClick={() => setIdMode("phone")}
                  disabled={busy}
                >
                  Phone
                </button>
                <button
                  type="button"
                  className={`id-toggle-btn ${
                    idMode === "email" ? "active" : ""
                  }`}
                  onClick={() => setIdMode("email")}
                  disabled={busy}
                >
                  Email
                </button>
              </div>
            </div>

            <input
              className="form-input"
              type={identifierType}
              value={form.identifier}
              onChange={set("identifier")}
              placeholder={identifierPlaceholder}
              disabled={busy}
              inputMode={identifierInputMode}
              autoComplete={identifierAutoComplete}
              required
            />
            <p className="help-text">
              Use phone or email—switch above anytime.
            </p>
          </div>

          {/* Optional complementary contact on register */}
          {mode === "register" && (
            <>
              {idMode === "phone" && (
                <div className="form-group">
                  <label className="form-label">
                    Email <span className="optional">(optional)</span>
                  </label>
                  <input
                    className="form-input"
                    type="email"
                    value={form.email}
                    onChange={set("email")}
                    placeholder="you@company.com"
                    disabled={busy}
                    autoComplete="email"
                  />
                </div>
              )}
              {idMode === "email" && (
                <div className="form-group">
                  <label className="form-label">
                    Phone <span className="optional">(optional)</span>
                  </label>
                  <input
                    className="form-input"
                    type="tel"
                    value={form.phone}
                    onChange={set("phone")}
                    placeholder="+1 555 123 4567"
                    disabled={busy}
                    autoComplete="tel"
                  />
                </div>
              )}
            </>
          )}

          <div className="form-group">
            <label className="form-label">
              Password <span className="required">*</span>
            </label>
            <input
              className="form-input"
              type="password"
              value={form.password}
              onChange={set("password")}
              placeholder={
                mode === "login" ? "Your password" : "Create a secure password"
              }
              required
              disabled={busy}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
          </div>

          <button
            className={`vendor-login-btn ${busy ? "loading" : ""}`}
            disabled={busy}
            type="submit"
          >
            {busy ? (
              <div className="btn-loader"></div>
            ) : mode === "login" ? (
              "Sign In"
            ) : (
              "Create Account"
            )}
          </button>
        </form>

        <div className="vendor-login-footer">
          <button
            className="mode-toggle-btn"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setErr("");
            }}
            type="button"
            disabled={busy}
          >
            {mode === "login"
              ? "Need an account? Sign up"
              : "Already have an account? Sign in"}
          </button>

          <div className="demo-link-container">
            <span className="demo-text">Want to explore first?</span>
            <a className="demo-link" href="/bid/demo">
              Try public bid page →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
