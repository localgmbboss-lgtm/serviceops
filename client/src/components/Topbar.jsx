import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useNotifications } from "../contexts/NotificationsContext";

/**
 * Topbar (fixed)
 * - nav gets "nav--open" class when menuOpen is true
 * - mobile nav panel (.nav-panel) is always rendered inside .nav
 * - keyboard focus trap and escape key supported
 * - minimal/landing headers respected
 */

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusable(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (el) =>
      !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true"
  );
}

export default function Topbar() {
  const loc = useLocation();
  const navigate = useNavigate();
  const { user, logout, isAdmin, isVendor, isCustomer } = useAuth();
  const { unreadCount, markAllRead } = useNotifications();

  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef(null);
  const toggleRef = useRef(null);

  const isLanding = loc.pathname === "/";
  const isCustomerLogin = loc.pathname === "/customer/login";
  const isVendorLogin = loc.pathname === "/vendor/login";

  // open/close helpers
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => {
    // move focus to toggle BEFORE hiding to avoid aria-hidden while focused
    if (toggleRef.current?.focus) toggleRef.current.focus();
    setMenuOpen(false);
  }, []);

  // Close on route/auth changes
  useEffect(() => {
    closeMenu();
  }, [loc.pathname, user, closeMenu]);

  // When menu opens, focus first focusable item and lock scroll
  useEffect(() => {
    if (!menuOpen) return;
    const panel = navRef.current?.querySelector(".nav-panel");
    setTimeout(() => {
      const focusables = getFocusable(panel);
      if (focusables.length) focusables[0].focus();
    }, 0);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [menuOpen]);

  // Focus-trap & Escape handling
  useEffect(() => {
    if (!menuOpen) return;
    const panel = navRef.current?.querySelector(".nav-panel");
    if (!panel) return;
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
        return;
      }
      if (e.key === "Tab") {
        const focusables = getFocusable(panel);
        if (!focusables.length) {
          e.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen, closeMenu]);

  // click/touch outside to close
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      const navEl = navRef.current;
      const toggleEl = toggleRef.current;
      if (navEl?.contains(e.target) || toggleEl?.contains(e.target)) return;
      closeMenu();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [menuOpen, closeMenu]);

  // close when resizing to desktop
  useEffect(() => {
    function onResize() {
      if (window.innerWidth > 900) setMenuOpen(false);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const roleLabel = useMemo(() => {
    if (isAdmin) return "Admin";
    if (isVendor) return "Vendor";
    if (isCustomer) return "Customer";
    return "";
  }, [isAdmin, isVendor, isCustomer]);

  const profilePath = useMemo(() => {
    if (isVendor) return "/vendor/profile";
    if (isAdmin) return "/admin/settings";
    if (isCustomer) return "/customer/home";
    return "/profile";
  }, [isVendor, isAdmin, isCustomer]);

  const desktopLinks = useMemo(() => {
    if (isLanding && !user) {
      return [
        { to: "/request", label: "Request service", type: "link" },
        { to: "/vendor/login", label: "Vendor login", type: "link" },
      ];
    }
    if (isCustomerLogin) {
      return [
        {
          action: () => navigate("/vendor/login"),
          label: "Vendor login",
          type: "action",
        },
        { action: () => navigate(-1), label: "Go back", type: "action" },
      ];
    }
    if (isVendorLogin) {
      return [
        {
          action: () => navigate("/customer/login"),
          label: "Customer login",
          type: "action",
        },
        { action: () => navigate(-1), label: "Go back", type: "action" },
      ];
    }
    if (!user) {
      return [
        { to: "/customer/login", label: "Customer login", type: "link" },
        { to: "/vendor/login", label: "Vendor login", type: "link" },
      ];
    }
    if (isAdmin) {
      return [
        { to: "/admin", label: "Dashboard", type: "link" },
        { to: "/jobs", label: "Jobs", type: "link" },
        { to: "/reports", label: "Reports", type: "link" },
      ];
    }
    if (isVendor) {
      return [
        { to: "/vendor/app", label: "Dashboard", type: "link" },
        { to: "/vendor/profile", label: "Profile", type: "link" },
      ];
    }
    if (isCustomer) {
      return [
        { to: "/customer/home", label: "My Dashboard", type: "link" },
        { to: "/request", label: "New Request", type: "link" },
      ];
    }
    return [];
  }, [
    isLanding,
    isCustomerLogin,
    isVendorLogin,
    user,
    isAdmin,
    isVendor,
    isCustomer,
    navigate,
  ]);

  // mobile panel render (stacked)
  const renderMobilePanel = () => {
    if (isLanding && !user) {
      return (
        <div className="nav-panel" role="menu" aria-hidden={!menuOpen}>
          <div className="nav-section">
            <button
              className="nav-panel-link"
              role="menuitem"
              onClick={() => handleNavigate("/request")}
            >
              Request service
            </button>
            <button
              className="nav-panel-link"
              role="menuitem"
              onClick={() => handleNavigate("/vendor/login")}
            >
              Vendor login
            </button>
          </div>
        </div>
      );
    }

    if (isCustomerLogin) {
      return (
        <div className="nav-panel" role="menu" aria-hidden={!menuOpen}>
          <div className="nav-section">
            <button
              className="nav-panel-link"
              role="menuitem"
              onClick={() => handleNavigate("/vendor/login")}
            >
              Vendor login
            </button>
            <button
              className="nav-panel-link"
              role="menuitem"
              onClick={() => navigate(-1)}
            >
              Go back
            </button>
          </div>
        </div>
      );
    }

    if (isVendorLogin) {
      return (
        <div className="nav-panel" role="menu" aria-hidden={!menuOpen}>
          <div className="nav-section">
            <button
              className="nav-panel-link"
              role="menuitem"
              onClick={() => handleNavigate("/customer/login")}
            >
              Customer login
            </button>
            <button
              className="nav-panel-link"
              role="menuitem"
              onClick={() => navigate(-1)}
            >
              Go back
            </button>
          </div>
        </div>
      );
    }

    // Authenticated stacked panel
    return (
      <div className="nav-panel" role="menu" aria-hidden={!menuOpen}>
        <div className="nav-section">
          <div className="nav-section__title">Navigation</div>

          <button
            className="nav-panel-link"
            role="menuitem"
            onClick={() =>
              handleNavigate(
                user
                  ? isAdmin
                    ? "/admin"
                    : isVendor
                    ? "/vendor/app"
                    : "/customer/home"
                  : "/"
              )
            }
          >
            Dashboard
          </button>

          <button
            className="nav-panel-link"
            role="menuitem"
            onClick={() => handleNavigate("/request")}
          >
            Request service
          </button>
        </div>

        <div className="nav-section">
          <div className="nav-section__title">Account</div>

          {user ? (
            <>
              <div className="account-info">
                <div className="account-name">{user.name || "Signed in"}</div>
                {user.email && (
                  <div className="account-email">{user.email}</div>
                )}
                <button
                  className="nav-panel-link"
                  role="menuitem"
                  onClick={() => handleNavigate(profilePath)}
                >
                  Update profile
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                className="nav-panel-link"
                role="menuitem"
                onClick={() => handleNavigate("/customer/login")}
              >
                Customer login
              </button>
              <button
                className="nav-panel-link"
                role="menuitem"
                onClick={() => handleNavigate("/vendor/login")}
              >
                Vendor login
              </button>
            </>
          )}
        </div>

        <div className="nav-section">
          <div className="nav-section__title">Actions</div>

          {user && (
            <button
              className="nav-panel-link"
              role="menuitem"
              onClick={() => {
                markAllRead();
                handleNavigate("/notifications");
              }}
            >
              View notifications
            </button>
          )}

          {user && (
            <button
              className="nav-action-btn"
              role="menuitem"
              onClick={() => {
                closeMenu();
                logout();
                navigate("/");
              }}
            >
              Sign out
            </button>
          )}
        </div>
      </div>
    );
  };

  const handleNavigate = (path) => {
    if (toggleRef.current?.focus) toggleRef.current.focus();
    setMenuOpen(false);
    setTimeout(() => navigate(path), 120);
  };

  const handleNotificationsClick = () => {
    markAllRead();
    closeMenu();
    setTimeout(() => navigate("/notifications"), 120);
  };

  const handleLogout = () => {
    closeMenu();
    setTimeout(() => {
      logout();
      navigate("/");
    }, 120);
  };

  return (
    <header role="banner" className={user ? "topbar topbar--authed" : "topbar"}>
      <div className="inner">
        <div className="topbar-brand">
          <Link
            to={
              user
                ? isAdmin
                  ? "/admin"
                  : isVendor
                  ? "/vendor/app"
                  : "/customer/home"
                : "/"
            }
            className="brand-link"
            onClick={() => setMenuOpen(false)}
          >
            <span className="brand-dot" aria-hidden="true" />
            <span className="brand-text">ServiceOps</span>
          </Link>

          {user && roleLabel && (
            <span className="topbar-role desktop-only">{roleLabel}</span>
          )}
        </div>

        {/* NAV: add nav--open class when open so CSS shows the panel */}
        <nav
          ref={navRef}
          id="mainnav"
          className={"nav" + (menuOpen ? " nav--open" : "")}
          role="navigation"
          aria-label="Primary navigation"
        >
          {/* desktop inline links (hidden on landing/login where appropriate) */}
          <div className="desktop-only" aria-hidden={menuOpen}>
            {desktopLinks.map((item, idx) =>
              item.type === "link" ? (
                <Link
                  key={idx}
                  to={item.to}
                  className="nav-link"
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ) : (
                <button
                  key={idx}
                  type="button"
                  className="nav-link"
                  onClick={() => item.action?.()}
                >
                  {item.label}
                </button>
              )
            )}
          </div>

          {/* mobile stacked panel — always in DOM but CSS controls visibility via .nav.nav--open */}
          {renderMobilePanel()}
        </nav>

        <div className="topbar-actions">
          {!isLanding && !isCustomerLogin && !isVendorLogin && user && (
            <>
              <div
                className="topbar-userchip desktop-only"
                aria-hidden={menuOpen}
              >
                <span className="topbar-userchip__name">
                  {user?.name || "Signed in"}
                </span>
                {user?.email && (
                  <span className="topbar-userchip__sub">{user.email}</span>
                )}
              </div>

              <button
                type="button"
                className={
                  "topbar-notify desktop-only" +
                  (unreadCount > 0 ? " has-unread" : "")
                }
                onClick={handleNotificationsClick}
                aria-label={
                  unreadCount > 0
                    ? `${unreadCount} unread notifications`
                    : "Notifications"
                }
                aria-hidden={menuOpen}
              >
                <span className="topbar-notify__icon" aria-hidden="true" />
                {unreadCount > 0 && (
                  <span className="topbar-notify__badge">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                className="topbar-action desktop-only"
                onClick={handleLogout}
                aria-hidden={menuOpen}
              >
                Logout
              </button>
            </>
          )}

          {/* Toggle — always present, CSS shows/hides as needed for desktop/mobile */}
          <button
            ref={toggleRef}
            type="button"
            className={"topbar-menu-toggle" + (menuOpen ? " is-active" : "")}
            aria-controls="mainnav"
            aria-expanded={menuOpen}
            aria-haspopup="true"
            onClick={() => (menuOpen ? closeMenu() : openMenu())}
            title={menuOpen ? "Close menu" : "Open menu"}
          >
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        className={"nav-backdrop" + (menuOpen ? " nav-backdrop--visible" : "")}
        onClick={closeMenu}
        aria-hidden="true"
      />
    </header>
  );
}
