import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useNotifications } from "../contexts/NotificationsContext";

export default function Topbar() {
  const loc = useLocation();
  const navigate = useNavigate();
  const { user, logout, isAdmin, isVendor, isDriver, isCustomer } = useAuth();
  const { unreadCount, markAllRead } = useNotifications();
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  useEffect(() => {
    closeMenu();
  }, [loc.pathname, user, closeMenu]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleResize = () => {
      if (window.innerWidth > 900) {
        closeMenu();
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [closeMenu]);

  useEffect(() => {
    if (!menuOpen || typeof document === "undefined") {
      return undefined;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen || typeof window === "undefined") {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen, closeMenu]);

  const roleLabel = useMemo(() => {
    if (isAdmin) return "Admin";
    if (isVendor) return "Vendor";
    if (isDriver) return "Driver";
    if (isCustomer) return "Customer";
    return "";
  }, [isAdmin, isVendor, isDriver, isCustomer]);

  const homePath = useMemo(() => {
    if (isAdmin) return "/admin";
    if (isVendor) return "/vendor/app";
    if (isDriver) return "/driver";
    if (isCustomer) return "/customer/home";
    return "/";
  }, [isAdmin, isVendor, isDriver, isCustomer]);

  const brandTitle = user
    ? roleLabel
      ? `${roleLabel} workspace`
      : "Workspace"
    : "ServiceOps";
  const topbarClassName = user ? "topbar topbar--authed" : "topbar";
  const notificationsLabel = unreadCount > 0
    ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
    : "Notifications";

  const handleNotificationsClick = () => {
    closeMenu();
    markAllRead();
    navigate("/notifications");
  };

  const handleNavigation = (path) => {
    closeMenu();
    navigate(path);
  };

  const isActivePath = (path) => {
    if (path === "/admin" && loc.pathname === "/admin") return true;
    return loc.pathname.startsWith(path) && path !== "/admin";
  };

  const guestLinks = useMemo(
    () => [
      { to: "/guest/request", label: "Request service" },
      { to: "/customer/login", label: "Customer login" },
      { to: "/vendor/login", label: "Vendor login" },
      { to: "/admin/login", label: "Admin login" },
    ],
    []
  );

  return (
    <header className={topbarClassName}>
      <div className="inner">
        <div className="brand-hub">
          <h1 className="brand">
            <Link to={homePath} className="brand-link" onClick={closeMenu}>
              {brandTitle}
            </Link>
          </h1>
          {!user ? (
            <>
              <span className="brand-split" aria-hidden="true" />
              <span className="brand-tagline">Roadside orchestration, reimagined</span>
            </>
          ) : null}
        </div>

        {user ? (
          <button
            type="button"
            className={"topbar-notify" + (unreadCount > 0 ? " has-unread" : "")}
            onClick={handleNotificationsClick}
            aria-label={notificationsLabel}
          >
            <span className="topbar-notify__icon" aria-hidden="true" />
            {unreadCount > 0 ? (
              <span className="topbar-notify__badge">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </button>
        ) : null}

        <button
          type="button"
          className={"topbar-menu-toggle" + (menuOpen ? " is-active" : "")}
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
          aria-controls="mainnav"
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          <span />
          <span />
          <span />
        </button>
        <nav
          id="mainnav"
          className={"nav" + (menuOpen ? " nav--open" : "")}
          aria-label="Primary"
        >
          {user ? (
            <>
              {isAdmin && (
                <>
                  <button
                    className={isActivePath("/admin") ? "nav-link active" : "nav-link"}
                    onClick={() => handleNavigation("/admin")}
                  >
                    Dashboard
                  </button>
                  <button
                    className={isActivePath("/jobs") ? "nav-link active" : "nav-link"}
                    onClick={() => handleNavigation("/jobs")}
                  >
                    Jobs
                  </button>
                  <button
                    className={isActivePath("/reports") ? "nav-link active" : "nav-link"}
                    onClick={() => handleNavigation("/reports")}
                  >
                    Reports
                  </button>
                  <button
                    className={
                      isActivePath("/admin/vendors") ? "nav-link active" : "nav-link"
                    }
                    onClick={() => handleNavigation("/admin/vendors")}
                  >
                    Vendors
                  </button>
                  <button
                    className={
                      isActivePath("/admin/drivers") ? "nav-link active" : "nav-link"
                    }
                    onClick={() => handleNavigation("/admin/drivers")}
                  >
                    Drivers
                  </button>
                  <button
                    className={
                      isActivePath("/admin/documents") ? "nav-link active" : "nav-link"
                    }
                    onClick={() => handleNavigation("/admin/documents")}
                  >
                    Docs
                  </button>
                  <button
                    className={isActivePath("/admin/map") ? "nav-link active" : "nav-link"}
                    onClick={() => handleNavigation("/admin/map")}
                  >
                    Live Map
                  </button>
                  <button
                    className={
                      isActivePath("/admin/settings") ? "nav-link active" : "nav-link"
                    }
                    onClick={() => handleNavigation("/admin/settings")}
                  >
                    Settings
                  </button>
                  <button
                    className={
                      isActivePath("/financials") ? "nav-link active" : "nav-link"
                    }
                    onClick={() => handleNavigation("/financials")}
                  >
                    Financials
                  </button>
                </>
              )}

              {isVendor && (
                <button
                  className={
                    isActivePath("/vendor/app") ? "nav-link active" : "nav-link"
                  }
                  onClick={() => handleNavigation("/vendor/app")}
                >
                  Vendor Dashboard
                </button>
              )}

              {isDriver && (
                <button
                  className={isActivePath("/driver") ? "nav-link active" : "nav-link"}
                  onClick={() => handleNavigation("/driver")}
                >
                  My Jobs
                </button>
              )}

              {isCustomer && (
                <>
                  <button
                    className={
                      isActivePath("/customer/home") ? "nav-link active" : "nav-link"
                    }
                    onClick={() => handleNavigation("/customer/home")}
                  >
                    My Dashboard
                  </button>
                  <button
                    className={
                      isActivePath("/request") ? "nav-link active" : "nav-link"
                    }
                    onClick={() => handleNavigation("/request")}
                  >
                    New Request
                  </button>
                </>
              )}

              <div className="nav-user-section">
                <span className="nav-user-info">
                  {user?.name ? "Hello, " + user.name : "Signed in"}
                </span>
                <button
                  className="nav-link nav-logout"
                  onClick={() => {
                    logout();
                    handleNavigation("/");
                  }}
                >
                  Logout
                </button>
              </div>
            </>
          ) : (
            <>
              {guestLinks.map((item) => (
                <Link
                  key={item.to}
                  className="nav-link"
                  to={item.to}
                  onClick={closeMenu}
                >
                  {item.label}
                </Link>
              ))}
            </>
          )}
        </nav>
      </div>
      <div
        className={"nav-backdrop" + (menuOpen ? " nav-backdrop--visible" : "")}
        onClick={closeMenu}
        aria-hidden="true"
      />
    </header>
  );
}
