import { Link, Route, Routes } from "react-router-dom";
import HomePage from "./components/HomePage";
import KRAForm from "./components/KRAForm";
import AuthPage from "./pages/AuthPage";
import Dashboard from "./pages/Dashboard";
import AdminPanel from "./pages/AdminPanel";
import Monitoring from "./pages/Monitoring";
import Reports from "./pages/Reports";
import GlobalHeader from "./components/GlobalHeader";
import ProtectedRoute from "./auth/ProtectedRoute";
import { useLanguage } from "./i18n/LanguageContext";
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
            path="/reports"
            element={
              <ProtectedRoute>
                <Reports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/monitoring"
            element={
              <ProtectedRoute>
                <Monitoring />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireAdmin>
                <AdminPanel />
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

// ============================================================================
// COMING SOON COMPONENT
// ============================================================================
const ComingSoon = ({ title }) => {
  const { t } = useLanguage();

  return (
    <div className="min-h-[calc(100vh-250px)] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-12 text-center max-w-md">
        <div className="text-6xl mb-6">🚧</div>
        <h1 className="text-3xl font-bold text-gray-800 mb-4">{title}</h1>
        <p className="text-xl text-gray-600 mb-8">
          {t("लवकरच येत आहे", "Coming Soon")}
        </p>
        <Link
          to="/"
          className="inline-block px-8 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-all duration-300 shadow-lg hover:shadow-xl"
        >
          {t("मुख्य पृष्ठावर परत या", "Go Back Home")}
        </Link>
      </div>
    </div>
  );
};

export default App;
