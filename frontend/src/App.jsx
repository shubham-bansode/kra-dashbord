import { Route, Routes, Navigate } from "react-router-dom";
import HomePage from "./components/HomePage";
import KRAForm from "./components/KRAForm";
import AuthPage from "./pages/AuthPage";
import Dashboard from "./pages/Dashboard";
import AdminPanel from "./pages/AdminPanel";
import Monitoring from "./pages/Monitoring";
import Profile from "./pages/Profile";
import GlobalHeader from "./components/GlobalHeader";
import ProtectedRoute from "./auth/ProtectedRoute";
import { RadialBackground } from "./components/light-theme-tailwind-css-background-snippet";

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================
function App() {
  return (
    <div className="relative min-h-screen">
      {/* Radial Background */}
      <RadialBackground />

      <div className="relative z-0">
        {/* Global Header - Sticky on all pages */}
        <GlobalHeader />

        {/* Main Content - with padding top to account for sticky header */}
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/data-entry"
            element={
              <ProtectedRoute>
                <KRAForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/report"
            element={
              <ProtectedRoute>
                <Monitoring />
              </ProtectedRoute>
            }
          />
          <Route
            path="/monitoring"
            element={<Navigate to="/report" replace />}
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireAdmin>
                <AdminPanel />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          {/* Combined Auth Page for Login/Signup/Admin Login */}
          <Route path="/login" element={<AuthPage />} />
          <Route path="/signup" element={<AuthPage />} />
          <Route path="/auth" element={<AuthPage />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;
