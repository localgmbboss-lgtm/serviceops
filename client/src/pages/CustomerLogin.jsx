// src/pages/CustomerLogin.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import "./CustomerLogin.css";

const normalizePhone = (input) => {
  if (!input) return "";
  const t = String(input).trim();
  return t.startsWith("+")
    ? "+" + t.slice(1).replace(/\D+/g, "")
    : t.replace(/\D+/g, "");
};
const normalizeEmail = (input) =>
  String(input || "")
    .trim()
    .toLowerCase();

export default function CustomerLogin() {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [idMode, setIdMode] = useState("phone"); // "phone" | "email"
  const [form, setForm] = useState({
    name: "",
    identifier: "", // phone or email, based on idMode
    phone: "",
    email: "",
    password: "",
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const nav = useNavigate();
  const { login } = useAuth();

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    setSuccess(false);

    try {
      // don’t nuke a working session here; only clear on explicit logout
      let response;

      if (mode === "login") {
        if (!form.identifier || !form.password) {
          throw new Error("Enter your phone/email and password.");
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

        response = await api.post("/api/customer/auth/login", payload);
      } else {
        if (!form.name || !form.password || !form.identifier) {
          throw new Error(
            `Please enter ${
              idMode === "phone" ? "phone" : "email"
            }, name, and password.`
          );
        }
        const payload =
          idMode === "phone"
            ? {
                name: form.name.trim(),
                phone: normalizePhone(form.identifier),
                email: form.email ? normalizeEmail(form.email) : undefined,
                password: form.password,
              }
            : {
                name: form.name.trim(),
                email: normalizeEmail(form.identifier),
                phone: form.phone ? normalizePhone(form.phone) : undefined,
                password: form.password,
              };

        if (idMode === "phone" && !payload.phone)
          throw new Error("Enter a valid phone number.");
        if (idMode === "email" && !payload.email)
          throw new Error("Enter a valid email address.");

        response = await api.post("/api/customer/auth/register", payload);
      }

      const { data } = response;
      const customer = data.customer || data.user || {};
      const token = data.token;

      // hydrate global auth (sets axios header + persists token)
      login(
        {
          ...customer,
          role: "customer",
          name: customer.name || form.name || "Customer",
        },
        token
      );

      setSuccess(true);
      setTimeout(() => nav("/customer/home"), 1200);
    } catch (ex) {
      setErr(ex?.response?.data?.message || ex.message || "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const identifierLabel = idMode === "phone" ? "Phone" : "Email";
  const identifierType = idMode === "phone" ? "tel" : "email";
  const identifierPlaceholder =
    idMode === "phone" ? "(555) 555-1234" : "you@example.com";
  const identifierAutoComplete =
    idMode === "phone" ? "tel" : mode === "login" ? "email" : "username";
  const identifierInputMode = idMode === "phone" ? "tel" : "email";

  return (
    <div className="customer-login-container">
      <div className="customer-login-bg-shapes">
        <div className="shape shape-1" />
        <div className="shape shape-2" />
        <div className="shape shape-3" />
      </div>

      <div className="customer-login-card">
        {success && (
          <div className="customer-login-success">
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

        <header className="customer-login-header">
          <div className="customer-login-icon">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <h1 className="customer-login-title">
            {mode === "login" ? "Customer Login" : "Create Account"}
          </h1>
          <p className="customer-login-subtitle">
            {mode === "login"
              ? "Welcome back — sign in to request service faster."
              : "Create an account to request service in seconds next time."}
          </p>
        </header>

        {err && (
          <div className="customer-login-alert error">
            <span className="alert-icon">⚠️</span>
            {err}
          </div>
        )}

        <form className="customer-login-form" onSubmit={submit}>
          {mode === "register" && (
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                className="form-input"
                type="text"
                value={form.name}
                onChange={set("name")}
                placeholder="Jane Doe"
                required
                disabled={busy}
                autoComplete="name"
              />
            </div>
          )}

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
              Switch between phone or email above—whichever you prefer.
            </p>
          </div>

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
                    placeholder="you@example.com"
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
                    placeholder="(555) 555-1234"
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
            className={`customer-login-btn ${busy ? "loading" : ""}`}
            disabled={busy}
            type="submit"
          >
            {busy ? (
              <div className="btn-loader" />
            ) : mode === "login" ? (
              "Sign In"
            ) : (
              "Create Account"
            )}
          </button>
        </form>

        <div className="customer-login-footer">
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

          <div className="guest-options">
            <span className="guest-text">Prefer not to create an account?</span>
            <button
              className="guest-btn"
              onClick={() => nav("/guest/request")}
              disabled={busy}
              type="button"
            >
              Continue as guest →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

