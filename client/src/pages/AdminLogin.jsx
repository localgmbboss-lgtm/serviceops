import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import "./AdminLogin.css";

export default function AdminLogin() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const { login, logout } = useAuth();
  const navigate = useNavigate();

  const update = (key) => (event) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    if (!form.email || !form.password) {
      setError("Enter your email and password.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      logout?.();
      const { data } = await api.post("/api/admin/auth/login", {
        email: String(form.email).trim().toLowerCase(),
        password: form.password,
      });

      const user = {
        ...(data.user || {}),
        role: data?.user?.role || "admin",
      };
      login?.(user, data.token);
      setSuccess(true);
      setTimeout(() => navigate("/admin"), 800);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-login-container">
      <div className="admin-login-card">
        <h1 className="admin-login-title">Admin sign in</h1>
        <p className="admin-login-subtitle">
          Access the dispatch dashboard with your admin credentials.
        </p>

        {error && <div className="admin-login-alert">{error}</div>}
        {success && (
          <div className="admin-login-success">Welcome back! Redirecting...</div>
        )}

        <form className="admin-login-form" onSubmit={submit}>
          <label className="admin-login-label" htmlFor="admin-email">
            Email
          </label>
          <input
            id="admin-email"
            type="email"
            autoComplete="username"
            value={form.email}
            onChange={update("email")}
            disabled={busy}
            className="admin-login-input"
            placeholder="you@serviceops.com"
            required
          />

          <label className="admin-login-label" htmlFor="admin-password">
            Password
          </label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={update("password")}
            disabled={busy}
            className="admin-login-input"
            placeholder="Enter your password"
            required
          />

          <button className="admin-login-button" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
