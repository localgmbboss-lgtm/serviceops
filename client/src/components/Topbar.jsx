import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LuSettings, LuChevronLeft, LuChevronRight } from "react-icons/lu";
import { useAuth } from "../contexts/AuthContext";
import { useNotifications } from "../contexts/NotificationsContext";
import brandMark from "../assets/brand-mark.png";
import {
  ensureAdminPushSubscription,
  ensureVendorPushSubscription,
} from "../lib/pushNotifications.js";

const NAV_SCROLL_ID = "topbar-nav-items";

export default function Topbar() {
  const loc = useLocation();
  const navigate = useNavigate();
  const { user, logout, isAdmin, isVendor, isCustomer } = useAuth();
  const { unreadCount, markAllRead } = useNotifications();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [userMenuPosition, setUserMenuPosition] = useState(null);
  const [isHidden, setIsHidden] = useState(false);
  const [navScrollState, setNavScrollState] = useState({
    isOverflow: false,
    canScrollStart: false,
    canScrollEnd: false,
  });
  const navRef = useRef(null);
  const navScrollRef = useRef(null);
  const toggleRef = useRef(null);
  const userMenuRef = useRef(null);
  const userMenuButtonRef = useRef(null);
  const vendorPushAttemptedRef = useRef(false);
  const adminPushAttemptedRef = useRef(false);
  const updateUserMenuPosition = useCallback(() => {
    if (
      typeof window === "undefined" ||
      !userMenuButtonRef.current
    ) {
      return;
    }
    const rect = userMenuButtonRef.current.getBoundingClientRect();
    setUserMenuPosition({
      top: rect.bottom + 8,
      right: window.innerWidth - rect.right,
    });
  }, []);
  const lastScrollY = useRef(
    typeof window !== "undefined" ? window.scrollY || 0 : 0
  );

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const updateNavScrollState = useCallback(() => {
    const scrollEl = navScrollRef.current;
    if (!scrollEl) {
      setNavScrollState((prev) =>
        prev.isOverflow || prev.canScrollStart || prev.canScrollEnd
          ? { isOverflow: false, canScrollStart: false, canScrollEnd: false }
          : prev
      );
      return;
    }
    if (typeof window !== "undefined") {
      const compact = window.innerWidth <= 900;
      if (menuOpen || compact) {
        setNavScrollState((prev) =>
          prev.isOverflow || prev.canScrollStart || prev.canScrollEnd
            ? { isOverflow: false, canScrollStart: false, canScrollEnd: false }
            : prev
        );
        return;
      }
    }
    const maxScrollLeft = scrollEl.scrollWidth - scrollEl.clientWidth;
    const threshold = 8;
    const isOverflow = maxScrollLeft > threshold;
    const canScrollStart = scrollEl.scrollLeft > threshold;
    const canScrollEnd = scrollEl.scrollLeft < maxScrollLeft - threshold;
    setNavScrollState((prev) => {
      if (
        prev.isOverflow === isOverflow &&
        prev.canScrollStart === canScrollStart &&
        prev.canScrollEnd === canScrollEnd
      ) {
        return prev;
      }
      return { isOverflow, canScrollStart, canScrollEnd };
    });
  }, [menuOpen]);

  const scrollNavBy = useCallback((direction) => {
    const el = navScrollRef.current;
    if (!el) return;
    const amount = el.clientWidth ? el.clientWidth * 0.8 : 240;
    el.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  }, []);

  const handleNavWheel = useCallback(
    (event) => {
      if (!navScrollState.isOverflow || menuOpen) return;
      const el = navScrollRef.current;
      if (!el) return;
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        return;
      }
      event.preventDefault();
      el.scrollBy({
        left: event.deltaY,
        behavior: "smooth",
      });
    },
    [menuOpen, navScrollState.isOverflow]
  );

  useEffect(() => {
    closeMenu();
    setUserMenuOpen(false);
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
    if (!userMenuOpen) {
      setUserMenuPosition(null);
      return undefined;
    }
    updateUserMenuPosition();
    window.addEventListener("resize", updateUserMenuPosition);
    window.addEventListener("scroll", updateUserMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateUserMenuPosition);
      window.removeEventListener("scroll", updateUserMenuPosition, true);
    };
  }, [userMenuOpen, updateUserMenuPosition]);

  useEffect(() => {
    if (menuOpen) {
      setUserMenuOpen(false);
    }
  }, [menuOpen]);

  useEffect(() => {
    if (!userMenuOpen || typeof document === "undefined") return undefined;
    const handlePointer = (event) => {
      const menuEl = userMenuRef.current;
      if (menuEl && menuEl.contains(event.target)) return;
      setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("touchstart", handlePointer);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("touchstart", handlePointer);
    };
  }, [userMenuOpen]);

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

  useEffect(() => {
    if (!isVendor || vendorPushAttemptedRef.current) return undefined;
    vendorPushAttemptedRef.current = true;
    ensureVendorPushSubscription({ source: "vendor-app" }).catch((error) => {
      console.warn("Vendor push subscription failed:", error);
    });
  }, [isVendor]);

  useEffect(() => {
    if (!isAdmin || adminPushAttemptedRef.current) return undefined;
    adminPushAttemptedRef.current = true;
    ensureAdminPushSubscription({ source: "admin-app" }).catch((error) => {
      console.warn("Admin push subscription failed:", error);
    });
  }, [isAdmin]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let ticking = false;

    const handleScroll = () => {
      const currentY = window.scrollY || document.documentElement.scrollTop || 0;
      const delta = currentY - lastScrollY.current;

      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (delta > 20 && currentY > 60 && !isHidden) {
            setIsHidden(true);
          } else if ((delta < -10 || currentY <= 10) && isHidden) {
            setIsHidden(false);
          }
          lastScrollY.current = currentY;
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isHidden]);

  useEffect(() => {
    if (menuOpen) {
      setIsHidden(false);
    }
  }, [menuOpen]);

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
        { to: "/admin/ops", label: "Ops Center" },
        { to: "/jobs", label: "Jobs" },
        { to: "/admin/crm/leads", label: "Leads" },
        { to: "/admin/crm/reviews", label: "Reviews" },
        { to: "/reports", label: "Reports" },
        { to: "/financials", label: "Financials" },
        { to: "/admin/vendors", label: "Vendors" },
        { to: "/admin/documents", label: "Docs" },
        { to: "/admin/knowledge", label: "Knowledge" },
        { to: "/admin/map", label: "Live Map" },
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

  const navScrollWrapperClassName = useMemo(() => {
    const classes = ["nav-scroll-wrapper"];
    if (navScrollState.isOverflow) {
      classes.push("nav-scroll-wrapper--overflow");
      if (navScrollState.canScrollStart) classes.push("nav-scroll-wrapper--show-left");
      if (navScrollState.canScrollEnd) classes.push("nav-scroll-wrapper--show-right");
    }
    return classes.join(" ");
  }, [navScrollState]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const scrollEl = navScrollRef.current;
    const handleScroll = () => updateNavScrollState();
    updateNavScrollState();
    if (scrollEl) {
      scrollEl.addEventListener("scroll", handleScroll);
    }
    window.addEventListener("resize", handleScroll);
    let resizeObserver;
    if (scrollEl && typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(handleScroll);
      resizeObserver.observe(scrollEl);
    }
    return () => {
      if (scrollEl) {
        scrollEl.removeEventListener("scroll", handleScroll);
      }
      window.removeEventListener("resize", handleScroll);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [navItems, menuOpen, updateNavScrollState]);

  useEffect(() => {
    updateNavScrollState();
  }, [loc.pathname, updateNavScrollState]);

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
    setUserMenuOpen(false);
    navigate("/notifications");
  };

  const handleLogout = () => {
    logout();
    closeMenu();
    setUserMenuOpen(false);
    navigate("/");
  };

  const handleOpenSettings = () => {
    setUserMenuOpen(false);
    closeMenu();
    if (isAdmin) {
      navigate("/admin/settings");
    }
  };

  const headerClassName = [
    topbarClassName,
    isHidden ? "topbar--hidden" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <header className={headerClassName}>
      <div className="inner">
        <div className="topbar-brand">
          <Link to={homePath} className="brand-link" onClick={closeMenu}>
            <span className="brand-dot" aria-hidden="true">
              <img src={brandMark} alt="" className="brand-dot__img" />
            </span>
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
          <div className={navScrollWrapperClassName}>
            {navScrollState.isOverflow ? (
              <button
                type="button"
                className="nav-scroll-btn nav-scroll-btn--left"
                onClick={() => scrollNavBy("left")}
                aria-label="Scroll navigation left"
                aria-controls={NAV_SCROLL_ID}
                disabled={!navScrollState.canScrollStart}
              >
                <LuChevronLeft aria-hidden="true" />
              </button>
            ) : null}
            <div
              id={NAV_SCROLL_ID}
              className="nav-scroll"
              ref={navScrollRef}
              role="presentation"
              onWheel={handleNavWheel}
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
            </div>
            {navScrollState.isOverflow ? (
              <button
                type="button"
                className="nav-scroll-btn nav-scroll-btn--right"
                onClick={() => scrollNavBy("right")}
                aria-label="Scroll navigation right"
                aria-controls={NAV_SCROLL_ID}
                disabled={!navScrollState.canScrollEnd}
              >
                <LuChevronRight aria-hidden="true" />
              </button>
            ) : null}
          </div>
          {user && (
            <div className="nav-mobile-actions">
              {isAdmin ? (
                <button
                  type="button"
                  className="nav-link nav-link--mobile"
                  onClick={() => {
                    closeMenu();
                    navigate("/admin/settings");
                  }}
                >
                  Settings
                </button>
              ) : null}
              <button
                type="button"
                className="nav-link nav-link--mobile nav-link--logout"
                onClick={handleLogout}
              >
                Logout
              </button>
            </div>
          )}
        </nav>

        <div className="topbar-actions">
          {user && (
            <>
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
              <div className="topbar-user-menu" ref={userMenuRef}>
                <button
                  type="button"
                  className={"topbar-icon-btn" + (userMenuOpen ? " is-open" : "")}
                  onClick={() =>
                    setUserMenuOpen((prev) => {
                      if (prev) return false;
                      updateUserMenuPosition();
                      return true;
                    })
                  }
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                  aria-label={userMenuOpen ? "Close user menu" : "Open user menu"}
                  ref={userMenuButtonRef}
                >
                  <LuSettings aria-hidden="true" />
                </button>
                {userMenuOpen ? (
                <div
                  className="topbar-user-menu__dropdown"
                  role="menu"
                  style={
                    userMenuPosition
                      ? {
                          top: `${userMenuPosition.top}px`,
                          right: `${userMenuPosition.right}px`,
                        }
                      : undefined
                  }
                >
                    {isAdmin ? (
                      <button
                        type="button"
                        className="topbar-user-menu__item"
                        onClick={() => handleOpenSettings()}
                        role="menuitem"
                      >
                        Settings
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="topbar-user-menu__item"
                      onClick={handleLogout}
                      role="menuitem"
                    >
                      Logout
                    </button>
                  </div>
                ) : null}
              </div>
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

