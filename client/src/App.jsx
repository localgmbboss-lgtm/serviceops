import React from "react";
import { Routes, Route } from "react-router-dom";

// Import AuthProvider and ProtectedRoute
import { AuthProvider } from "./contexts/AuthContext";
import { NotificationsProvider } from "./contexts/NotificationsContext";
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

import Topbar from "./components/Topbar";
import "./App.css";


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






















