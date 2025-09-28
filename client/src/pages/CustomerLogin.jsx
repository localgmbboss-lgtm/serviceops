// src/pages/CustomerLogin.jsx
import { useEffect, useMemo, useState } from "react";
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

const OTP_LENGTH = 6;

export default function CustomerLogin() {
  const [authMethod, setAuthMethod] = useState("otp"); // "otp" | "password"

  // OTP state
  const [otpStep, setOtpStep] = useState("phone"); // "phone" | "code"
  const [otpPhone, setOtpPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [info, setInfo] = useState("");

  // Password fallback state
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [idMode, setIdMode] = useState("phone"); // "phone" | "email"
  const [form, setForm] = useState({
    name: "",
    identifier: "",
    phone: "",
    email: "",
    password: "",
  });

  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const nav = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    if (!otpCountdown) return undefined;
    const timer = setTimeout(() => setOtpCountdown((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(timer);
  }, [otpCountdown]);

  useEffect(() => {
    // reset states when switching auth method
    setErr("");
    setInfo("");
    setBusy(false);
    setSuccess(false);
    if (authMethod === "otp") {
      setOtpStep("phone");
      setOtpCode("");
    }
  }, [authMethod]);

  const otpDisabled = busy || (otpStep === "code" && otpCode.trim().length !== OTP_LENGTH);

  async function requestOtp(e) {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr("");
    setInfo("");

    try {
      const normalized = normalizePhone(otpPhone);
      if (!normalized) throw new Error("Enter a valid phone number");
      const { data } = await api.post("/api/customer/auth/otp/request", {
        phone: normalized,
      });
      setOtpStep("code");
      setOtpCountdown(45);
      setInfo(data?.message || "Code sent! Check your phone.");
    } catch (error) {
      const status = error?.response?.status;
      if (status === 429) {
        const retryIn = error?.response?.data?.retryIn;
        if (retryIn) setOtpCountdown(Number(retryIn));
      }
      setErr(
        error?.response?.data?.message ||
          error?.message ||
          "Could not send code"
      );
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(e) {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr("");

    try {
      const normalized = normalizePhone(otpPhone);
      if (!normalized) throw new Error("Enter a valid phone number");
      if (otpCode.trim().length !== OTP_LENGTH)
        throw new Error("Enter the 6-digit code");

      const { data } = await api.post("/api/customer/auth/otp/verify", {
        phone: normalized,
        code: otpCode.trim(),
      });

      const customer = data.customer || {};
      login(
        {
          ...customer,
          role: "customer",
          name: customer.name || customer.savedProfile?.name || "Customer",
        },
        data.token
      );

      setSuccess(true);
      setInfo("Signed in successfully!");
      setTimeout(() => nav("/customer/home"), 800);
    } catch (error) {
      setErr(
        error?.response?.data?.message ||
          error?.message ||
          "Verification failed"
      );
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

  const passwordButtonLabel = useMemo(() => {
    if (mode === "register") return busy ? "Creating account..." : "Create account";
    return busy ? "Signing in..." : "Sign in";
  }, [busy, mode]);

  async function submitPasswordFlow(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    setSuccess(false);

    try {
      let response;
      if (mode === "login") {
        if (!form.identifier || !form.password) {
          throw new Error("Enter your phone/email and password");
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
          throw new Error("Enter a valid phone or email");
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
          throw new Error("Enter a valid phone number");
        if (idMode === "email" && !payload.email)
          throw new Error("Enter a valid email address");

        response = await api.post("/api/customer/auth/register", payload);
      }

      const { data } = response;
      const customer = data.customer || {};
      login(
        {
          ...customer,
          role: "customer",
          name: customer.name || form.name || "Customer",
        },
        data.token
      );

      setSuccess(true);
      setInfo(mode === "login" ? "Signed in" : "Account created");
      setTimeout(() => nav("/customer/home"), 1200);
    } catch (error) {
      setErr(
        error?.response?.data?.message ||
          error?.message ||
          "Action failed"
      );
    } finally {
      setBusy(false);
    }
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

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
                <circle className="checkmark__circle" cx="26" cy="26" r="25" fill="none" />
                <path
                  className="checkmark__check"
                  fill="none"
                  d="M14.1 27.2l7.1 7.2 16.7-16.8"
                />
              </svg>
            </div>
            <p className="success-message">{info || "Success"}</p>
          </div>
        )}

        <header className="customer-login-header">
          <div className="customer-login-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <h1 className="customer-login-title">Access your dashboard</h1>
          <p className="customer-login-subtitle">
            {authMethod === "otp"
              ? "Enter your phone number and we’ll text you a secure code."
              : mode === "login"
              ? "Prefer a password? Sign in the traditional way."
              : "Create a password login if you don’t want to use one-time codes."}
          </p>
        </header>

        <div className="customer-login-method-toggle" role="tablist" aria-label="Login method">
          <button
            type="button"
            role="tab"
            className={`toggle-btn ${authMethod === "otp" ? "active" : ""}`}
            aria-selected={authMethod === "otp"}
            onClick={() => setAuthMethod("otp")}
          >
            SMS Code
          </button>
          <button
            type="button"
            role="tab"
            className={`toggle-btn ${authMethod === "password" ? "active" : ""}`}
            aria-selected={authMethod === "password"}
            onClick={() => setAuthMethod("password")}
          >
            Password
          </button>
        </div>

        {err && (
          <div className="customer-login-alert error">
            <span className="alert-icon">!</span>
            {err}
          </div>
        )}
        {!success && info && !err && (
          <div className="customer-login-alert info">
            <span className="alert-icon">✓</span>
            {info}
          </div>
        )}

        {authMethod === "otp" ? (
          <form
            className="customer-login-form"
            onSubmit={otpStep === "phone" ? requestOtp : verifyOtp}
          >
            {otpStep === "phone" && (
              <label className="customer-login-field">
                <span className="customer-login-label">Phone number</span>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="(555) 555-1234"
                  value={otpPhone}
                  onChange={(e) => setOtpPhone(e.target.value)}
                  disabled={busy}
                  required
                />
              </label>
            )}

            {otpStep === "code" && (
              <div className="customer-login-otp-step">
                <p className="muted small">
                  Enter the {OTP_LENGTH}-digit code we sent to
                  <strong> {otpPhone}</strong>
                </p>
                <div className="customer-login-otp-grid">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={OTP_LENGTH}
                    value={otpCode}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D+/g, "").slice(0, OTP_LENGTH);
                      setOtpCode(digits);
                    }}
                    autoFocus
                  />
                </div>
                <button
                  type="button"
                  className="link-button"
                  disabled={busy || otpCountdown > 0}
                  onClick={requestOtp}
                >
                  {otpCountdown > 0
                    ? `Resend code in ${otpCountdown}s`
                    : "Resend code"}
                </button>
              </div>
            )}

            <button
              type="submit"
              className="customer-login-submit"
              disabled={otpStep === "code" ? otpDisabled : busy}
            >
              {busy
                ? otpStep === "code"
                  ? "Verifying..."
                  : "Sending..."
                : otpStep === "code"
                ? "Verify code"
                : "Send code"}
            </button>

            {otpStep === "code" && (
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setOtpStep("phone");
                  setOtpCode("");
                  setOtpCountdown(0);
                  setInfo("");
                }}
                disabled={busy}
              >
                Use a different number
              </button>
            )}
          </form>
        ) : (
          <form className="customer-login-form" onSubmit={submitPasswordFlow}>
            <div className="customer-login-toggle-row" role="tablist">
              <button
                type="button"
                role="tab"
                className={mode === "login" ? "active" : ""}
                aria-selected={mode === "login"}
                onClick={() => setMode("login")}
              >
                Sign in
              </button>
              <button
                type="button"
                role="tab"
                className={mode === "register" ? "active" : ""}
                aria-selected={mode === "register"}
                onClick={() => setMode("register")}
              >
                Create account
              </button>
            </div>

            <div className="customer-login-toggle-row secondary">
              <button
                type="button"
                className={idMode === "phone" ? "active" : ""}
                onClick={() => setIdMode("phone")}
              >
                Use phone
              </button>
              <button
                type="button"
                className={idMode === "email" ? "active" : ""}
                onClick={() => setIdMode("email")}
              >
                Use email
              </button>
            </div>

            {mode === "register" && (
              <label className="customer-login-field">
                <span className="customer-login-label">Name</span>
                <input
                  type="text"
                  placeholder="Jane Doe"
                  value={form.name}
                  onChange={set("name")}
                  autoComplete="name"
                  required
                />
              </label>
            )}

            <label className="customer-login-field">
              <span className="customer-login-label">{identifierLabel}</span>
              <input
                type={identifierType}
                inputMode={identifierInputMode}
                autoComplete={identifierAutoComplete}
                placeholder={identifierPlaceholder}
                value={form.identifier}
                onChange={set("identifier")}
                required
              />
            </label>

            {mode === "register" && idMode === "phone" && (
              <label className="customer-login-field">
                <span className="customer-login-label">Backup email (optional)</span>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={set("email")}
                  autoComplete="email"
                />
              </label>
            )}

            {mode === "register" && idMode === "email" && (
              <label className="customer-login-field">
                <span className="customer-login-label">Backup phone (optional)</span>
                <input
                  type="tel"
                  placeholder="(555) 555-1234"
                  value={form.phone}
                  onChange={set("phone")}
                  autoComplete="tel"
                />
              </label>
            )}

            <label className="customer-login-field">
              <span className="customer-login-label">Password</span>
              <input
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder="••••••••"
                value={form.password}
                onChange={set("password")}
                required
              />
            </label>

            <button type="submit" className="customer-login-submit" disabled={busy}>
              {passwordButtonLabel}
            </button>
          </form>
        )}

        <footer className="customer-login-footer">
          <p className="muted tiny">
            We’ll only use your phone number to verify your identity and keep your
            requests linked to your history.
          </p>
        </footer>
      </div>
    </div>
  );
}
