import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { corporationApi } from "../services/api";
import { useEffect } from "react";
import { useLanguage } from "../i18n/LanguageContext";

// ============================================================================
// HELPERS
// ============================================================================
const getApiErrorMessage = (err, fallback) => {
  const firstValidationError = err?.response?.data?.errors?.[0]?.message;
  return firstValidationError || err?.response?.data?.message || fallback;
};

const normalizeIndianMobile = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  const last10 = digits.length > 10 ? digits.slice(-10) : digits;
  return last10;
};

// ============================================================================
// AUTH PAGE - Combined Login & Signup with Admin Login
// ============================================================================
export default function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register, user } = useAuth();
  const { t } = useLanguage();

  // Determine initial tab from URL state or path
  const getInitialTab = () => {
    if (location.state?.tab === "admin") return "admin";
    if (location.pathname === "/signup") return "signup";
    return "login";
  };

  const [activeTab, setActiveTab] = useState(getInitialTab());

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      if (user.role === "admin" || user.role === "superadmin") {
        navigate("/admin", { replace: true });
      } else {
        navigate("/", { replace: true });
      }
    }
  }, [user, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6">
          <Link to="/" className="inline-block">
            <div className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-full flex items-center justify-center shadow-lg">
              <svg
                className="w-10 h-10 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-gray-800">
            {t("KRA निरीक्षण प्रणाली", "KRA Monitoring System")}
          </h1>
          <p className="text-sm text-gray-600">{t()}</p>
        </div>

        {/* Auth Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          {/* Tab Navigation */}
          <div className="flex border-b bg-gray-50">
            <button
              onClick={() => setActiveTab("login")}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                activeTab === "login"
                  ? "bg-white text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              🔑 {t("वापरकर्ता लॉगिन", "User Login")}
            </button>
            <button
              onClick={() => setActiveTab("signup")}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                activeTab === "signup"
                  ? "bg-white text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              📝 {t("खाते तयार करा", "Sign Up")}
            </button>
            <button
              onClick={() => setActiveTab("admin")}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                activeTab === "admin"
                  ? "bg-white text-purple-600 border-b-2 border-purple-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              ⚙️ {t("प्रशासक", "Admin")}
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === "login" && (
              <LoginForm
                onSuccess={() => {
                  const nextPath = location.state?.from?.pathname || "/";
                  navigate(nextPath, { replace: true });
                }}
              />
            )}
            {activeTab === "signup" && (
              <SignupForm
                onSuccess={() => navigate("/", { replace: true })}
                onSwitchToLogin={() => setActiveTab("login")}
              />
            )}
            {activeTab === "admin" && (
              <AdminLoginForm
                onSuccess={() => navigate("/admin", { replace: true })}
              />
            )}
          </div>
        </div>

        {/* Back to Home Link */}
        <div className="text-center mt-6">
          <Link
            to="/"
            className="text-sm text-gray-600 hover:text-blue-600 transition-colors"
          >
            ← {t("मुख्यपृष्ठावर परत", "Back to Home")}
          </Link>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// LOGIN FORM
// ============================================================================
function LoginForm({ onSuccess }) {
  const { login, logout } = useAuth();
  const { t } = useLanguage();
  const [mobileNumber, setMobileNumber] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const res = await login({ mobileNumber, password });
      const user = res.data?.data?.user;

      // Check if user is admin trying to login via user form
      if (user?.role === "admin" || user?.role === "superadmin") {
        logout(); // Logout the admin user
        setError(
          t(
            "प्रशासक खात्यांसाठी कृपया 'Admin Login' वापरा",
            "Please use Admin Login for admin accounts",
          ),
        );
        return;
      }

      onSuccess();
    } catch (err) {
      setError(getApiErrorMessage(err, "Login failed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit}>
      <div className="mb-4">
        <label
          className="block text-sm font-medium text-gray-700 mb-1"
          htmlFor="login-mobile"
        >
          {t("मोबाईल क्रमांक", "Mobile Number")}
        </label>
        <input
          id="login-mobile"
          type="tel"
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
          value={mobileNumber}
          onChange={(e) =>
            setMobileNumber(normalizeIndianMobile(e.target.value))
          }
          inputMode="numeric"
          placeholder="10-digit mobile number"
          maxLength={10}
          pattern="[6-9][0-9]{9}"
          required
        />
      </div>

      <div className="mb-4">
        <label
          className="block text-sm font-medium text-gray-700 mb-1"
          htmlFor="login-password"
        >
          {t("पासवर्ड", "Password")}
        </label>
        <input
          id="login-password"
          type="password"
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          required
        />
      </div>

      {error && (
        <div className="mb-4 text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
          ⚠️ {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 transition-all"
      >
        {isSubmitting
          ? t("लॉगिन करत आहे...", "Logging in...")
          : t("लॉगिन", "Login")}
      </button>
    </form>
  );
}

// ============================================================================
// SIGNUP FORM
// ============================================================================
function SignupForm({ onSuccess, onSwitchToLogin }) {
  const { register } = useAuth();
  const { t } = useLanguage();
  const [corporations, setCorporations] = useState([]);
  const [corporation, setCorporation] = useState("");
  const [fullName, setFullName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadCorporations = async () => {
      try {
        const res = await corporationApi.getAll();
        setCorporations(res.data?.data || []);
      } catch (e) {
        setError("Failed to load corporations");
      } finally {
        setIsLoading(false);
      }
    };
    loadCorporations();
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await register({ corporation, fullName, mobileNumber, password });
      onSuccess();
    } catch (err) {
      setError(getApiErrorMessage(err, "Registration failed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit}>
      <div className="mb-4">
        <label
          className="block text-sm font-medium text-gray-700 mb-1"
          htmlFor="signup-corp"
        >
          {t("महामंडळ", "Corporation")}
        </label>
        <select
          id="signup-corp"
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          value={corporation}
          onChange={(e) => setCorporation(e.target.value)}
          disabled={isLoading}
          required
        >
          <option value="">{t("महामंडळ निवडा", "Select Corporation")}</option>
          {corporations.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <label
          className="block text-sm font-medium text-gray-700 mb-1"
          htmlFor="signup-name"
        >
          {t("पूर्ण नाव", "Full Name")}
        </label>
        <input
          id="signup-name"
          type="text"
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Enter your full name"
          required
        />
      </div>

      <div className="mb-4">
        <label
          className="block text-sm font-medium text-gray-700 mb-1"
          htmlFor="signup-mobile"
        >
          {t("मोबाईल क्रमांक", "Mobile Number")}
        </label>
        <input
          id="signup-mobile"
          type="tel"
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          value={mobileNumber}
          onChange={(e) =>
            setMobileNumber(normalizeIndianMobile(e.target.value))
          }
          inputMode="numeric"
          placeholder="10-digit mobile number"
          maxLength={10}
          pattern="[6-9][0-9]{9}"
          required
        />
      </div>

      <div className="mb-4">
        <label
          className="block text-sm font-medium text-gray-700 mb-1"
          htmlFor="signup-password"
        >
          {t("पासवर्ड", "Password")}
        </label>
        <input
          id="signup-password"
          type="password"
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Min 6 characters"
          minLength={6}
          required
        />
      </div>

      {error && (
        <div className="mb-4 text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
          ⚠️ {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting || isLoading}
        className="w-full py-2.5 bg-gradient-to-r from-green-600 to-green-700 text-white font-semibold rounded-lg hover:from-green-700 hover:to-green-800 disabled:opacity-50 transition-all"
      >
        {isSubmitting
          ? t("खाते तयार होत आहे...", "Creating Account...")
          : t("खाते तयार करा", "Create Account")}
      </button>

      <p className="text-center text-sm text-gray-600 mt-4">
        {t("आधीपासून खाते आहे?", "Already have an account?")}{" "}
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="text-blue-600 font-semibold hover:underline"
        >
          {t("लॉगिन", "Login")}
        </button>
      </p>
    </form>
  );
}

// ============================================================================
// ADMIN LOGIN FORM
// ============================================================================
function AdminLoginForm({ onSuccess }) {
  const { login, logout } = useAuth();
  const { t } = useLanguage();
  const [mobileNumber, setMobileNumber] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const res = await login({ mobileNumber, password });
      const user = res.data?.data?.user;

      // Check if user has admin role
      if (user?.role !== "admin" && user?.role !== "superadmin") {
        logout(); // Logout the non-admin user
        setError(
          t(
            "प्रवेश नाकारला. प्रशासक क्रेडेन्शियल आवश्यक.",
            "Access denied. Admin credentials required.",
          ),
        );
        return;
      }

      onSuccess();
    } catch (err) {
      setError(getApiErrorMessage(err, "Admin login failed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit}>
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
        <div className="flex items-center gap-2 text-purple-800">
          <span className="text-xl">🔐</span>
          <div>
            <p className="font-semibold text-sm">
              {t("केवळ प्रशासकांसाठी प्रवेश", "Admin Access Only")}
            </p>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <label
          className="block text-sm font-medium text-gray-700 mb-1"
          htmlFor="admin-mobile"
        >
          {t("प्रशासक मोबाईल क्रमांक", "Admin Mobile Number")}
        </label>
        <input
          id="admin-mobile"
          type="tel"
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
          value={mobileNumber}
          onChange={(e) =>
            setMobileNumber(normalizeIndianMobile(e.target.value))
          }
          inputMode="numeric"
          placeholder="Admin mobile number"
          maxLength={10}
          pattern="[6-9][0-9]{9}"
          required
        />
      </div>

      <div className="mb-4">
        <label
          className="block text-sm font-medium text-gray-700 mb-1"
          htmlFor="admin-password"
        >
          {t("प्रशासक पासवर्ड", "Admin Password")}
        </label>
        <input
          id="admin-password"
          type="password"
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter admin password"
          required
        />
      </div>

      {error && (
        <div className="mb-4 text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
          ⚠️ {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-purple-700 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-purple-800 disabled:opacity-50 transition-all"
      >
        {isSubmitting
          ? t("तपासणी होत आहे...", "Authenticating...")
          : t("प्रशासक लॉगिन", "Admin Login")}
      </button>
    </form>
  );
}
