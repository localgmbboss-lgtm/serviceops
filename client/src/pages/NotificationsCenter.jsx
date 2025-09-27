import React from "react";
import { Link } from "react-router-dom";
import { useNotifications } from "../contexts/NotificationsContext";
import { useAuth } from "../contexts/AuthContext";
import "./NotificationsCenter.css";

const formatRelativeTime = (isoString) => {
  if (!isoString) return "just now";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "just now";
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return date.toLocaleString();
};

const resolveTarget = (notification) => {
  const meta = notification?.meta || {};
  if (typeof meta.route === "string") return meta.route;
  if (meta.role === "customer") {
    if (meta.kind === "bid" && meta.customerToken) {
      return `/choose/${meta.customerToken}`;
    }
    if (meta.jobId) {
      return `/status/${meta.jobId}`;
    }
    return "/customer/home";
  }
  if (meta.role === "vendor") {
    return "/vendor/app";
  }
  if (meta.role === "admin") {
    return "/admin";
  }
  return null;
};

export default function NotificationsCenter() {
  const { notifications, unreadCount, markAllRead, markRead, clearAll } = useNotifications();
  const { user } = useAuth();

  React.useEffect(() => {
    markAllRead();
  }, [markAllRead]);

  const sorted = React.useMemo(
    () => [...notifications].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [notifications]
  );
  const hasNotifications = sorted.length > 0;

  const signedOutView = (
    <div className="notifications-empty">
      <h2>Sign in to stay updated</h2>
      <p>Notifications will appear here once you have an active workspace session.</p>
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
      <Link className="btn ghost" to={user?.role === "vendor" ? "/vendor/app" : "/customer/home"}>
        Back to dashboard
      </Link>
    </div>
  );

  return (
    <div className="notifications-page">
      <header className="notifications-header">
        <div>
          <h1>Notifications</h1>
          <p className="notifications-sub">
            {user
              ? hasNotifications
                ? `${sorted.length} update${sorted.length === 1 ? "" : "s"}${unreadCount > 0 ? ` | ${unreadCount} unread` : ""}`
                : "You're all caught up"
              : "Sign in to stay updated"}
          </p>
        </div>
        <div className="notifications-header__actions">
          {user && hasNotifications ? (
            <button className="btn ghost" type="button" onClick={clearAll}>
              Clear all
            </button>
          ) : null}
        </div>
      </header>

      {!user ? (
        signedOutView
      ) : hasNotifications ? (
        <ul className="notifications-list">
          {sorted.map((notification) => {
            const target = resolveTarget(notification);
            const content = (
              <div className="notifications-item__content">
                <div className="notifications-item__header">
                  <span className="notifications-item__title">{notification.title}</span>
                  <span className="notifications-item__time">
                    {formatRelativeTime(notification.createdAt)}
                  </span>
                </div>
                {notification.body ? (
                  <p className="notifications-item__body">{notification.body}</p>
                ) : null}
                <div className="notifications-item__meta">
                  <span className="badge badge--tone">{notification.severity}</span>
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
                  "notifications-item" + (notification.read ? "" : " notifications-item--unread")
                }
              >
                {target ? (
                  <Link
                    to={target}
                    className="notifications-item__link"
                    onClick={() => markRead(notification.id)}
                  >
                    {content}
                    <span className="notifications-item__chevron" aria-hidden="true">
                      >
                    </span>
                  </Link>
                ) : (
                  <div className="notifications-item__static">{content}</div>
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
