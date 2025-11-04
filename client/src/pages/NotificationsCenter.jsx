import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useNotifications } from "../contexts/NotificationsContext";
import { useAuth } from "../contexts/AuthContext";
import "./NotificationsCenter.css";

/* Utilities */
const formatRelativeTime = (isoString) => {
  if (!isoString) return "just now";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "just now";
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  // fallback to a reader-friendly local string
  return date.toLocaleString();
};

const resolveTarget = (notification) => {
  if (!notification) return null;
  const meta = notification.meta || {};

  // explicit route override
  if (typeof meta.route === "string" && meta.route.trim().length > 0) {
    return meta.route;
  }

  if (meta.role === "vendor" && typeof meta.tab === "string" && meta.tab) {
    return `/vendor/app?tab=${meta.tab}`;
  }

  // role-based routing
  if (meta.role === "customer") {
    if (meta.kind === "bid" && meta.customerToken) {
      return `/choose/${meta.customerToken}`;
    }
    if (meta.jobId) {
      const query = meta.chat ? "?chat=1" : "";
      return `/status/${meta.jobId}${query}`;
    }
    return "/customer/home";
  }

  if (meta.role === "vendor") {
    if (meta.jobId) {
      const query = meta.chat ? "?chat=1" : "";
      return `/vendor/jobs/${meta.jobId}${query}`;
    }
    return "/vendor/app";
  }

  if (meta.role === "admin") {
    if (meta.jobId) {
      const query = meta.chat ? "?tab=conversation" : "";
      return `/admin/jobs/${meta.jobId}${query}`;
    }
    return "/admin";
  }

  // best-effort fallback
  return null;
};

export default function NotificationsCenter() {
  const {
    notifications = [],
    unreadCount = 0,
    markAllRead,
    markRead,
    clearAll,
  } = useNotifications();
  const { user } = useAuth();
  const navigate = useNavigate();

  // keep track so we only auto-mark once on mount (if desired)
  const autoMarkedRef = useRef(false);

  useEffect(() => {
    // Only auto-mark on initial mount if a user is signed in and there are unread notifications
    // This avoids marking read repeatedly on route updates.
    if (!user) return;
    if (autoMarkedRef.current) return;
    if (unreadCount > 0) {
      try {
        markAllRead();
      } catch (e) {
        // swallow errors; contexts should surface their own errors
        // console.error("markAllRead failed", e);
      }
    }
    autoMarkedRef.current = true;
    // We intentionally do not list markAllRead/unreadCount in the deps so this runs once on mount.
    // This is safe because the ref prevents multiple calls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, markAllRead]);

  const sorted = useMemo(
    () =>
      [...notifications].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      ),
    [notifications]
  );

  const hasNotifications = sorted.length > 0;
  const defaultDashboard =
    user?.role === "admin"
      ? "/admin"
      : user?.role === "vendor"
      ? "/vendor/app"
      : "/customer/home";

  // Confirm before clearing everything
  const handleClearAll = useCallback(() => {
    if (!hasNotifications) return;
    const confirmed = window.confirm(
      "Are you sure you want to clear all notifications?"
    );
    if (!confirmed) return;
    clearAll();
  }, [clearAll, hasNotifications]);

  // mark a single notification read and navigate (if it has a target)
  const handleOpenNotification = useCallback(
    (notification, target) => {
      if (!notification) return;
      try {
        if (!notification.read) markRead(notification.id);
      } catch (e) {
        // ignore
      }
      navigate(target || defaultDashboard);
    },
    [markRead, navigate, defaultDashboard]
  );

  const signedOutView = (
    <div className="notifications-empty">
      <h2>Sign in to stay updated</h2>
      <p>
        Notifications will appear here once you have an active workspace
        session.
      </p>
      <div className="notifications-empty__actions">
        <Link className="btn primary" to="/customer/login">
          Customer login
        </Link>
        <Link className="btn ghost" to="/vendor/login">
          Vendor login
        </Link>
      </div>
    </div>
  );

  const emptyState = (
    <div className="notifications-empty">
      <h2>No new notifications</h2>
      <p>We will let you know when there is action on your jobs or bids.</p>
      <Link className="btn ghost" to={defaultDashboard}>
        Back to dashboard
      </Link>
    </div>
  );

  return (
    <div className="notifications-page">
      <header
        className="notifications-header"
        aria-labelledby="notifications-title"
      >
        <div>
          <h1 id="notifications-title">Notifications</h1>

          {/* aria-live region to notify screen reader users of unread count changes */}
          <p className="notifications-sub" role="status" aria-live="polite">
            {user
              ? hasNotifications
                ? `${sorted.length} update${sorted.length === 1 ? "" : "s"}${
                    unreadCount > 0 ? ` | ${unreadCount} unread` : ""
                  }`
                : "You're all caught up"
              : "Sign in to stay updated"}
          </p>
        </div>

        <div className="notifications-header__actions">
          {user && hasNotifications ? (
            <>
              <button
                className="btn ghost"
                type="button"
                onClick={handleClearAll}
                aria-label="Clear all notifications"
              >
                Clear all
              </button>
            </>
          ) : null}
        </div>
      </header>

      {!user ? (
        signedOutView
      ) : hasNotifications ? (
        <ul className="notifications-list" aria-live="polite">
          {sorted.map((notification) => {
            const target = resolveTarget(notification);
            const isUnread = !notification.read;

            const content = (
              <div className="notifications-item__content">
                <div className="notifications-item__header">
                  <span className="notifications-item__title">
                    {notification.title}
                  </span>
                  <span className="notifications-item__time">
                    {formatRelativeTime(notification.createdAt)}
                  </span>
                </div>

                {notification.body ? (
                  <p className="notifications-item__body">
                    {notification.body}
                  </p>
                ) : null}

                <div className="notifications-item__meta">
                  {notification.severity ? (
                    <span
                      className={`badge badge--tone badge--${(
                        notification.severity || ""
                      ).toLowerCase()}`}
                    >
                      {notification.severity}
                    </span>
                  ) : null}

                  {notification.meta?.status ? (
                    <span className="badge">{notification.meta.status}</span>
                  ) : null}
                </div>
              </div>
            );

            return (
              <li
                key={notification.id}
                className={
                  "notifications-item" +
                  (isUnread ? " notifications-item--unread" : "")
                }
              >
                {target ? (
                  <button
                    type="button"
                    className="notifications-item__link"
                    onClick={() => handleOpenNotification(notification, target)}
                    aria-label={`${notification.title} — ${formatRelativeTime(
                      notification.createdAt
                    )}${isUnread ? " — unread" : ""}`}
                  >
                    {content}
                    <span
                      className="notifications-item__chevron"
                      aria-hidden="true"
                    >
                      &gt;
                    </span>
                  </button>
                ) : (
                  <div className="notifications-item__static" tabIndex={0}>
                    {content}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        emptyState
      )}
    </div>
  );
}
