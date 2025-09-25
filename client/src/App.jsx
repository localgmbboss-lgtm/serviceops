import React from "react";
import {
  Routes,
  Route,
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";

// Import AuthProvider and ProtectedRoute
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { NotificationsProvider, useNotifications } from "./contexts/NotificationsContext";
import ProtectedRoute from "./components/ProtectedRoute";

// Import pages
import AdminDashboard from "./pages/AdminDashboard";
import AdminJobs from "./pages/AdminJobs";
import AdminReports from "./pages/AdminReports";
import DriverJobs from "./pages/DriverJobs";
import CustomerDashboard from "./pages/CustomerDashboard";
import AdminFinancials from "./pages/AdminFinancials";
import AdminDrivers from "./pages/AdminDrivers";
import DocumentsHub from "./pages/DocumentsHub";
import AdminLiveMap from "./pages/AdminLiveMap";
import AdminSettings from "./pages/AdminSettings";
import AdminVendors from "./pages/AdminVendors";
import CustomerRequest from "./pages/CustomerRequest";
import NotFound from "./pages/NotFound";
import Unauthorized from "./pages/Unauthorized";
import ScrollToTop from "./components/ScrollToTop";
import PrintReport from "./pages/PrintReport";
import VendorLogin from "./pages/VendorLogin";
import VendorApp from "./pages/VendorApp";
import AdminLogin from "./pages/AdminLogin";

// Public + auth
import Landing from "./pages/Landing";
import CustomerLogin from "./pages/CustomerLogin";
import CustomerHome from "./pages/CustomerHome";

// Public bidding / choosing / vendor portal
import PublicVendorBid from "./pages/PublicVendorBid";
import PublicCustomerChoose from "./pages/PublicCustomerChoose";
import VendorPortal from "./pages/VendorPortal";
import GuestRequest from "./pages/GuestRequest";
import GuestJobTracker from "./pages/GuestJobTracker";
// Optional self-serve intake
import CustomerIntake from "./pages/CustomerIntake";
import NotificationsCenter from "./pages/NotificationsCenter";

import "./App.css";

function Topbar() {
  const loc = useLocation();
  const navigate = useNavigate();
  const { user, logout, isAdmin, isVendor, isDriver, isCustomer } = useAuth();
  const { unreadCount, markAllRead } = useNotifications();
  const [menuOpen, setMenuOpen] = React.useState(false);

  const closeMenu = React.useCallback(() => {
    setMenuOpen(false);
  }, []);

  React.useEffect(() => {
    closeMenu();
  }, [loc.pathname, user, closeMenu]);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleResize = () => {
      if (window.innerWidth > 900) {
        closeMenu();
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [closeMenu]);

  React.useEffect(() => {
    if (!menuOpen || typeof document === "undefined") {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [menuOpen]);

  React.useEffect(() => {
    if (!menuOpen || typeof window === "undefined") {
      return;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen, closeMenu]);

  const roleLabel = React.useMemo(() => {
    if (isAdmin) return "Admin";
    if (isVendor) return "Vendor";
    if (isDriver) return "Driver";
    if (isCustomer) return "Customer";
    return "";
  }, [isAdmin, isVendor, isDriver, isCustomer]);

  const homePath = React.useMemo(() => {
    if (isAdmin) return "/admin";
    if (isVendor) return "/vendor/app";
    if (isDriver) return "/driver";
    if (isCustomer) return "/customer/home";
    return "/";
  }, [isAdmin, isVendor, isDriver, isCustomer]);

  const brandTitle = user
    ? (roleLabel ? `${roleLabel} workspace` : "Workspace")
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

  const guestLinks = [
    { to: "/guest/request", label: "Request service" },
    { to: "/customer/login", label: "Customer login" },
    { to: "/vendor/login", label: "Vendor login" },
    { to: "/admin/login", label: "Admin login" },
  ];

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

export default function App() {
  return (
    <AuthProvider>
      <NotificationsProvider>
        <ScrollToTop />
        <Topbar />
        <main className="container">
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Landing />} />
          <Route path="/vendor/login" element={<VendorLogin />} />
          <Route path="/customer/login" element={<CustomerLogin />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/bid/:vendorToken" element={<PublicVendorBid />} />
          <Route
            path="/choose/:customerToken"
            element={<PublicCustomerChoose />}
          />
          <Route path="/guest/request" element={<GuestRequest />} />
          <Route
            path="/track/guest/:jobToken"
            element={<GuestJobTracker />}
          />
          <Route
            path="/vendor/:vendorAcceptedToken"
            element={<VendorPortal />}
          />
          <Route path="/new/:token" element={<CustomerIntake />} />
          <Route path="/notifications" element={<NotificationsCenter />} />

          <Route path="/unauthorized" element={<Unauthorized />} />
          {/* Admin routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute requiredRole="admin" fallbackPath="/admin/login">
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/jobs"
            element={
              <ProtectedRoute requiredRole="admin" fallbackPath="/admin/login">
                <AdminJobs />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute requiredRole="admin" fallbackPath="/admin/login">
                <AdminReports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/vendors"
            element={
              <ProtectedRoute requiredRole="admin" fallbackPath="/admin/login">
                <AdminVendors />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/drivers"
            element={
              <ProtectedRoute requiredRole="admin" fallbackPath="/admin/login">
                <AdminDrivers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/documents"
            element={
              <ProtectedRoute requiredRole="admin" fallbackPath="/admin/login">
                <DocumentsHub />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/map"
            element={
              <ProtectedRoute requiredRole="admin" fallbackPath="/admin/login">
                <AdminLiveMap />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <ProtectedRoute requiredRole="admin" fallbackPath="/admin/login">
                <AdminSettings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/financials"
            element={
              <ProtectedRoute requiredRole="admin" fallbackPath="/admin/login">
                <AdminFinancials />
              </ProtectedRoute>
            }
          />
          <Route
            path="/print-report"
            element={
              <ProtectedRoute requiredRole="admin" fallbackPath="/admin/login">
                <PrintReport />
              </ProtectedRoute>
            }
          />
          {/* Vendor routes */}
          <Route
            path="/vendor/app"
            element={
              <ProtectedRoute requiredRole="vendor" fallbackPath="/vendor/login">
                <VendorApp />
              </ProtectedRoute>
            }
          />
          {/* Driver routes */}
          <Route
            path="/driver"
            element={
              <ProtectedRoute requiredRole="driver">
                <DriverJobs />
              </ProtectedRoute>
            }
          />
          {/* Customer routes */}
          <Route
            path="/customer/home"
            element={
              <ProtectedRoute requiredRole="customer" fallbackPath="/customer/login">
                <CustomerHome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/status/:id"
            element={
              <ProtectedRoute requiredRole="customer" fallbackPath="/customer/login">
                <CustomerDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/request"
            element={
              <ProtectedRoute requiredRole="customer" fallbackPath="/customer/login">
                <CustomerRequest />
              </ProtectedRoute>
            }
          />
          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      </NotificationsProvider>
    </AuthProvider>
  );
}





















