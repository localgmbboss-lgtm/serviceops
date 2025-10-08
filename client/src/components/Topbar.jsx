import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useNotifications } from "../contexts/NotificationsContext";

export default function Topbar() {
  const loc = useLocation();
  const navigate = useNavigate();
  const { user, logout, isAdmin, isVendor, isCustomer } = useAuth();
  const { unreadCount, markAllRead } = useNotifications();
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef(null);
  const toggleRef = useRef(null);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    closeMenu();
  }, [loc.pathname, user, closeMenu]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleResize = () => {
      if (window.innerWidth > 900) closeMenu();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [closeMenu]);

  useEffect(() => {
    if (!menuOpen || typeof document === "undefined") return undefined;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen || typeof document === "undefined") return undefined;
    const handlePointer = (event) => {
      const navEl = navRef.current;
      const toggleEl = toggleRef.current;
      if (
        (navEl && navEl.contains(event.target)) ||
        (toggleEl && toggleEl.contains(event.target))
      ) {
        return;
      }
      closeMenu();
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("touchstart", handlePointer);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("touchstart", handlePointer);
    };
  }, [menuOpen, closeMenu]);

  useEffect(() => {
    if (!menuOpen || typeof window === "undefined") return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen, closeMenu]);

  const roleLabel = useMemo(() => {
    if (isAdmin) return "Admin";
    if (isVendor) return "Vendor";
    if (isCustomer) return "Customer";
    return "";
  }, [isAdmin, isVendor, isCustomer]);

  const homePath = useMemo(() => {
    if (isAdmin) return "/admin";
    if (isVendor) return "/vendor/app";
    if (isCustomer) return "/customer/home";
    return "/";
  }, [isAdmin, isVendor, isCustomer]);

  const guestLinks = useMemo(
    () => [
      { to: "/customer/login", label: "Customer login" },
      { to: "/vendor/login", label: "Vendor login" },
    ],
    []
  );

  const navItems = useMemo(() => {
    if (!user) return guestLinks;
    if (isAdmin) {
      return [
        { to: "/admin", label: "Dashboard" },
        { to: "/jobs", label: "Jobs" },
        { to: "/reports", label: "Reports" },
        { to: "/admin/vendors", label: "Vendors" },
        { to: "/admin/documents", label: "Docs" },
        { to: "/admin/map", label: "Live Map" },
        { to: "/admin/settings", label: "Settings" },
        { to: "/financials", label: "Financials" },
      ];
    }
    if (isVendor) {
      return [
        { to: "/vendor/app", label: "Dashboard" },
        { to: "/vendor/profile", label: "Profile" },
      ];
    }
    if (isCustomer) {
      return [
        { to: "/customer/home", label: "My Dashboard" },
        { to: "/request", label: "New Request" },
      ];
    }
    return [];
  }, [user, isAdmin, isVendor, isCustomer, guestLinks]);

  const topbarClassName = user ? "topbar topbar--authed" : "topbar";

  const isActivePath = useCallback(
    (path) => {
      if (path === "/admin") return loc.pathname === "/admin";
      return loc.pathname.startsWith(path);
    },
    [loc.pathname]
  );

  const handleNavigation = (path) => {
    closeMenu();
    navigate(path);
  };

  const notificationsLabel =
    unreadCount > 0
      ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
      : "Notifications";

  const handleNotificationsClick = () => {
    markAllRead();
    closeMenu();
    navigate("/notifications");
  };

  const handleLogout = () => {
    logout();
    closeMenu();
    navigate("/");
  };

  return (
    <header className={topbarClassName}>
      <div className="inner">
        <div className="topbar-brand">
          <Link to={homePath} className="brand-link" onClick={closeMenu}>
            <span className="brand-dot" aria-hidden="true" />
            <span className="brand-text">ServiceOps</span>
          </Link>
          {user && roleLabel && <span className="topbar-role">{roleLabel}</span>}
        </div>

        <nav
          id="mainnav"
          className={"nav" + (menuOpen ? " nav--open" : "")}
          aria-label="Primary navigation"
          ref={navRef}
        >
          {navItems.map((item) =>
            user ? (
              <button
                key={item.to}
                type="button"
                className={isActivePath(item.to) ? "nav-link active" : "nav-link"}
                onClick={() => handleNavigation(item.to)}
              >
                {item.label}
              </button>
            ) : (
              <Link
                key={item.to}
                to={item.to}
                className="nav-link"
                onClick={closeMenu}
              >
                {item.label}
              </Link>
            )
          )}
        </nav>

        <div className="topbar-actions">
          {user && (
            <>
              <div className="topbar-userchip">
                <span className="topbar-userchip__name">
                  {user?.name || "Signed in"}
                </span>
                {user?.email ? (
                  <span className="topbar-userchip__sub">{user.email}</span>
                ) : null}
              </div>
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
              <button
                type="button"
                className="topbar-action topbar-action--logout"
                onClick={handleLogout}
              >
                Logout
              </button>
            </>
          )}

          <button
            type="button"
            className={"topbar-menu-toggle" + (menuOpen ? " is-active" : "")}
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
            aria-controls="mainnav"
            onClick={() => setMenuOpen((prev) => !prev)}
            ref={toggleRef}
          >
            <span />
            <span />
            <span />
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

