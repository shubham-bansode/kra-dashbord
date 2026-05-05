import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { adminApi, corporationApi, divisionApi, kraApi } from "../services/api";
import { useLanguage } from "../i18n/LanguageContext";
import { localizeName } from "../utils/localize";

const sumNumberField = (items, field) =>
  (Array.isArray(items) ? items : []).reduce(
    (sum, item) => sum + (Number(item?.[field]) || 0),
    0,
  );

const getSelectedKraIds = (entry) => {
  const ids = Array.isArray(entry?.selectedKraIds) ? entry.selectedKraIds : [];
  if (ids.length > 0) return ids;

  return (Array.isArray(entry?.kras) ? entry.kras : [])
    .filter(
      (k) =>
        (Number(k?.annualTarget) || 0) > 0 ||
        (Number(k?.kraAchievement) || 0) > 0,
    )
    .map((k) => k.kraId)
    .filter((v) => Number.isFinite(Number(v)));
};

const buildKraRemarkMap = (remarksText) => {
  const map = new Map();
  const lines = String(remarksText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  lines.forEach((line) => {
    const numbered = line.match(/^(\d+)\.\s.*?:\s*(.+)$/);
    if (numbered) {
      const kraId = Number(numbered[1]);
      const remark = String(numbered[2] || "").trim();
      if (Number.isFinite(kraId) && remark) map.set(kraId, remark);
      return;
    }

    const kraPrefix = line.match(/^KRA\s*(\d+)\s*[:-]\s*(.+)$/i);
    if (kraPrefix) {
      const kraId = Number(kraPrefix[1]);
      const remark = String(kraPrefix[2] || "").trim();
      if (Number.isFinite(kraId) && remark) map.set(kraId, remark);
    }
  });

  return map;
};

// ==========================================
// CONSTANTS
// ==========================================
const SIDEBAR_ITEMS = [
  { id: "dashboard", label: "Dashboard", labelMr: "डॅशबोर्ड", icon: "📊" },
  { id: "entries", label: "All Entries", labelMr: "सर्व नोंदी", icon: "📝" },
  { id: "users", label: "User Management", labelMr: "वापरकर्ते", icon: "👥" },
  {
    id: "years",
    label: "Financial Years",
    labelMr: "आर्थिक वर्षे",
    icon: "📅",
  },
];

const MONTHS_MARATHI = {
  1: "जानेवारी",
  2: "फेब्रुवारी",
  3: "मार्च",
  4: "एप्रिल",
  5: "मे",
  6: "जून",
  7: "जुलै",
  8: "ऑगस्ट",
  9: "सप्टेंबर",
  10: "ऑक्टोबर",
  11: "नोव्हेंबर",
  12: "डिसेंबर",
};

const MONTHS_EN = {
  1: "Jan",
  2: "Feb",
  3: "Mar",
  4: "Apr",
  5: "May",
  6: "Jun",
  7: "Jul",
  8: "Aug",
  9: "Sep",
  10: "Oct",
  11: "Nov",
  12: "Dec",
};

// Default KRA options (fallback when API is unavailable)
const DEFAULT_KRA_OPTIONS = [
  {
    id: 1,
    name: "KRA 1 - प्रत्यक्ष सिंचन (लक्ष हेक्टर)",
    nameEn: "KRA 1 - Actual irrigation (Lakh hectares)",
  },
  {
    id: 2,
    name: "KRA 2 - पाणीपट्टी वसुली (रु. लक्ष)",
    nameEn: "KRA 2 - Water cess collection (Rs. lakh)",
  },
  {
    id: 3,
    name: "KRA 3 - प्रकल्प पूर्ण (संख्या)",
    nameEn: "KRA 3 - Projects completion (Count)",
  },
  {
    id: 4,
    name: "KRA 4 - सिंचन निर्मिती (हेक्टर)",
    nameEn: "KRA 4 - Irrigation creation (Hectares)",
  },
  {
    id: 5,
    name: "KRA 5 - पाणीसाठा निर्मिती (दलघमी)",
    nameEn: "KRA 5 - Water storage creation (MCM)",
  },
  {
    id: 6,
    name: "KRA 6 - लाभक्षेत्र हस्तांतरण (हेक्टर)",
    nameEn: "KRA 6 - Benefit area transfer (Hectares)",
  },
  {
    id: 7,
    name: "KRA 7 - अवशिष्ट प्रकल्प पूर्ण (संख्या)",
    nameEn: "KRA 7 - Residual project completion (Count)",
  },
];

const mapKraDocToOption = (kraDoc) => {
  const number =
    Number(kraDoc?.kraNumber) || Number(kraDoc?.sortOrder) || undefined;
  const id = Number.isFinite(number) ? number : undefined;

  const mrName = String(kraDoc?.name || "").trim();
  const enName = String(kraDoc?.nameEnglish || "").trim();

  const baseMr = mrName || enName || "KRA";
  const baseEn = enName || mrName || "KRA";

  return {
    id,
    _id: kraDoc?._id,
    name: id ? `KRA ${id} - ${baseMr}` : baseMr,
    nameEn: id ? `KRA ${id} - ${baseEn}` : baseEn,
  };
};

// ==========================================
// CONFIRM MODAL COMPONENT
// ==========================================
function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  titleMr,
  message,
  messageMr,
  confirmText = "Confirm",
  confirmTextMr = "पुष्टी करा",
  cancelText = "Cancel",
  cancelTextMr = "रद्द करा",
  type = "warning", // "warning", "danger", "success"
  icon,
  isLoading = false,
}) {
  if (!isOpen) return null;

  const { t, language } = useLanguage();
  const resolvedTitle = language === "mr" ? titleMr || title : title;
  const resolvedMessage = language === "mr" ? messageMr || message : message;
  const resolvedCancelText = language === "mr" ? cancelTextMr : cancelText;
  const resolvedConfirmText = language === "mr" ? confirmTextMr : confirmText;

  const typeStyles = {
    warning: {
      iconBg: "bg-gradient-to-br from-amber-400 to-orange-500",
      iconColor: "text-white",
      confirmBtn:
        "bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700",
      headerBg: "from-amber-500 to-orange-600",
    },
    danger: {
      iconBg: "bg-gradient-to-br from-red-400 to-rose-500",
      iconColor: "text-white",
      confirmBtn:
        "bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700",
      headerBg: "from-red-500 to-rose-600",
    },
    success: {
      iconBg: "bg-gradient-to-br from-green-400 to-emerald-500",
      iconColor: "text-white",
      confirmBtn:
        "bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700",
      headerBg: "from-green-500 to-emerald-600",
    },
  };

  const styles = typeStyles[type];
  const defaultIcons = {
    warning: "⚠️",
    danger: "🗑️",
    success: "✅",
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        {/* Header with gradient */}
        <div className={`bg-gradient-to-r ${styles.headerBg} px-6 py-4`}>
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 ${styles.iconBg} rounded-xl flex items-center justify-center text-2xl shadow-lg`}
            >
              {icon || defaultIcons[type]}
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">{resolvedTitle}</h3>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
            <p className="text-slate-700 leading-relaxed">{resolvedMessage}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-5 py-2.5 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-100 hover:border-slate-400 transition-all duration-200 flex items-center gap-2 disabled:opacity-50"
          >
            <span>✕</span>
            <span>{resolvedCancelText}</span>
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-5 py-2.5 ${styles.confirmBtn} text-white font-semibold rounded-xl shadow-lg transition-all duration-200 flex items-center gap-2 disabled:opacity-50`}
          >
            {isLoading ? (
              <>
                <svg
                  className="animate-spin h-5 w-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span>{t("प्रक्रिया सुरू आहे...", "Processing...")}</span>
              </>
            ) : (
              <>
                <span>✓</span>
                <span>{resolvedConfirmText}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// AUTO-DISMISS TOAST COMPONENT
// ==========================================
function AutoToast({
  isVisible,
  type = "info", // "success", "warning", "error", "info"
  title,
  titleMr,
  message,
  messageMr,
  icon,
  duration = 2000,
}) {
  const [show, setShow] = useState(isVisible);
  const [isExiting, setIsExiting] = useState(false);

  const { language } = useLanguage();
  const resolvedTitle = language === "mr" ? titleMr || title : title;
  const resolvedMessage = language === "mr" ? messageMr || message : message;

  useEffect(() => {
    if (isVisible) {
      setShow(true);
      setIsExiting(false);

      const exitTimer = setTimeout(() => {
        setIsExiting(true);
      }, duration - 300);

      const hideTimer = setTimeout(() => {
        setShow(false);
      }, duration);

      return () => {
        clearTimeout(exitTimer);
        clearTimeout(hideTimer);
      };
    }
  }, [isVisible, duration]);

  if (!show) return null;

  const typeStyles = {
    success: {
      bg: "bg-gradient-to-r from-green-500 to-emerald-600",
      iconBg: "bg-white/20",
      ring: "ring-green-400",
      defaultIcon: "✅",
    },
    warning: {
      bg: "bg-gradient-to-r from-amber-500 to-orange-600",
      iconBg: "bg-white/20",
      ring: "ring-amber-400",
      defaultIcon: "⚠️",
    },
    error: {
      bg: "bg-gradient-to-r from-red-500 to-rose-600",
      iconBg: "bg-white/20",
      ring: "ring-red-400",
      defaultIcon: "❌",
    },
    info: {
      bg: "bg-gradient-to-r from-blue-500 to-indigo-600",
      iconBg: "bg-white/20",
      ring: "ring-blue-400",
      defaultIcon: "ℹ️",
    },
  };

  const styles = typeStyles[type];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
      <div
        className={`
          ${styles.bg} 
          px-8 py-6 
          rounded-2xl 
          shadow-2xl 
          ring-4 ${styles.ring} ring-opacity-30
          flex items-center gap-4
          max-w-lg
          transform transition-all duration-300 ease-out
          ${isExiting ? "opacity-0 scale-95 translate-y-4" : "opacity-100 scale-100 translate-y-0"}
        `}
      >
        {/* Icon */}
        <div
          className={`w-16 h-16 ${styles.iconBg} rounded-xl flex items-center justify-center text-4xl backdrop-blur-sm`}
        >
          {icon || styles.defaultIcon}
        </div>

        {/* Content */}
        <div className="flex-1">
          <h3 className="text-xl font-bold text-white mb-1">{resolvedTitle}</h3>
          {resolvedMessage && (
            <p className="text-white/90 text-sm">{resolvedMessage}</p>
          )}
        </div>

        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 rounded-b-2xl overflow-hidden">
          <div
            className="h-full bg-white/50 rounded-b-2xl"
            style={{
              animation: `shrinkWidth ${duration}ms linear forwards`,
            }}
          />
        </div>
      </div>

      {/* Keyframes for progress bar */}
      <style>{`
        @keyframes shrinkWidth {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}

// ==========================================
// ADMIN PANEL COMPONENT
// ==========================================
export default function AdminPanel() {
  const { user, refreshMe } = useAuth();
  const { t } = useLanguage();
  const [activeSection, setActiveSection] = useState("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [kraOptions, setKraOptions] = useState(DEFAULT_KRA_OPTIONS);

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const isSuperAdmin = user?.role === "superadmin";

  useEffect(() => {
    refreshMe({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load master KRAs for filters & displays
  useEffect(() => {
    const loadKras = async () => {
      try {
        const res = await kraApi.getAll();
        const data = Array.isArray(res?.data?.data) ? res.data.data : [];

        const options = data
          .map(mapKraDocToOption)
          .filter((o) => Number.isFinite(Number(o.id)))
          .sort((a, b) => Number(a.id) - Number(b.id));

        setKraOptions(options.length > 0 ? options : DEFAULT_KRA_OPTIONS);
      } catch {
        setKraOptions(DEFAULT_KRA_OPTIONS);
      }
    };

    loadKras();
  }, []);

  // Auto-hide notifications
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError("");
        setSuccess("");
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-12 text-center max-w-md">
          <div className="text-6xl mb-6">🔒</div>
          <h1 className="text-3xl font-bold text-red-600 mb-4">
            {t("प्रवेश नाकारला", "Access Denied")}
          </h1>
          <p className="text-lg text-gray-500 mb-8">
            {t("प्रशासक प्रवेश आवश्यक आहे.", "Admin access required.")}
          </p>
          <a
            href="/"
            className="inline-block px-8 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold rounded-lg"
          >
            {t("मुख्य पृष्ठावर परत", "Go Back Home")}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex">
      {/* Sidebar */}
      <aside
        className={`${sidebarCollapsed ? "w-20" : "w-64"} bg-gradient-to-b from-slate-900 to-slate-800 text-white flex flex-col transition-all duration-300 fixed h-screen z-40`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center justify-between">
            {!sidebarCollapsed && (
              <div>
                <h1 className="text-lg font-bold text-white">Admin Panel</h1>
                <p className="text-xs text-slate-400">
                  {t("व्यवस्थापन पॅनेल", "Management Panel")}
                </p>
              </div>
            )}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
            >
              {sidebarCollapsed ? "→" : "←"}
            </button>
          </div>
        </div>

        {/* User Info */}
        <div
          className={`p-4 border-b border-slate-700 ${sidebarCollapsed ? "text-center" : ""}`}
        >
          <div
            className={`w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white font-bold ${sidebarCollapsed ? "mx-auto" : ""}`}
          >
            {user?.fullName?.charAt(0) || "A"}
          </div>
          {!sidebarCollapsed && (
            <div className="mt-2">
              <p className="font-medium text-white truncate">
                {user?.fullName}
              </p>
              <span
                className={`inline-block mt-1 px-2 py-0.5 text-xs rounded-full ${isSuperAdmin ? "bg-yellow-500 text-yellow-900" : "bg-purple-500 text-white"}`}
              >
                {user?.role?.toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {SIDEBAR_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                activeSection === item.id
                  ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg"
                  : "text-slate-300 hover:bg-slate-700/50 hover:text-white"
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              {!sidebarCollapsed && (
                <div className="text-left">
                  <p className="font-medium text-sm">
                    {t(item.labelMr, item.label)}
                  </p>
                </div>
              )}
            </button>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-700">
          <a
            href="/"
            className={`flex items-center gap-3 px-4 py-2 text-slate-400 hover:text-white transition-colors ${sidebarCollapsed ? "justify-center" : ""}`}
          >
            <span>🏠</span>
            {!sidebarCollapsed && (
              <span className="text-sm">{t("मुख्यपृष्ठ", "Back to Home")}</span>
            )}
          </a>
        </div>
      </aside>

      {/* Main Content */}
      <main
        className={`flex-1 ${sidebarCollapsed ? "ml-20" : "ml-64"} transition-all duration-300`}
      >
        {/* Top Bar */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-30">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-800">
                {SIDEBAR_ITEMS.find((i) => i.id === activeSection)?.icon}{" "}
                {t(
                  SIDEBAR_ITEMS.find((i) => i.id === activeSection)?.labelMr,
                  SIDEBAR_ITEMS.find((i) => i.id === activeSection)?.label,
                )}
              </h2>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-500">
                {new Date().toLocaleDateString("en-IN", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
          </div>
        </header>

        {/* Notifications */}
        {(error || success) && (
          <div className="px-6 pt-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center justify-between animate-pulse">
                <span>❌ {error}</span>
                <button
                  onClick={() => setError("")}
                  className="text-red-500 hover:text-red-700 font-bold"
                >
                  ✕
                </button>
              </div>
            )}
            {success && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl flex items-center justify-between">
                <span>✅ {success}</span>
                <button
                  onClick={() => setSuccess("")}
                  className="text-green-500 hover:text-green-700 font-bold"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        )}

        {/* Content Area */}
        <div className="p-6">
          {activeSection === "dashboard" && (
            <DashboardSection setError={setError} />
          )}
          {activeSection === "entries" && (
            <EntriesSection
              kraOptions={kraOptions}
              setError={setError}
              setSuccess={setSuccess}
            />
          )}
          {activeSection === "users" && (
            <UsersSection
              isSuperAdmin={isSuperAdmin}
              setError={setError}
              setSuccess={setSuccess}
            />
          )}
          {activeSection === "years" && (
            <YearsSection setError={setError} setSuccess={setSuccess} />
          )}
        </div>
      </main>
    </div>
  );
}

// ==========================================
// DASHBOARD SECTION
// ==========================================
function DashboardSection({ setError }) {
  const { t, language } = useLanguage();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recentEntries, setRecentEntries] = useState([]);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const { data } = await adminApi.getStats();
      setStats(data.data);
      setRecentEntries(data.data?.recentEntries || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  if (loading && !stats)
    return (
      <LoadingSpinner
        text={t("डॅशबोर्ड लोड होत आहे...", "Loading dashboard...")}
      />
    );

  return (
    <div className="space-y-6">
      {/* Header with Refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">
            {t("डॅशबोर्ड सारांश", "Dashboard Overview")}
          </h2>
          <p className="text-sm text-slate-500">
            {t("शेवटचे अपडेट:", "Last updated:")}{" "}
            {lastRefresh.toLocaleTimeString("en-IN")} (Manual refresh)
          </p>
        </div>
        <button
          onClick={() => {
            fetchDashboardData();
            setLastRefresh(new Date());
          }}
          className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all flex items-center gap-2 shadow-lg"
        >
          {t("🔄 आत्ता रिफ्रेश करा", "🔄 Refresh Now")}
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          icon="📝"
          title={t("एकूण नोंदी", "Total Entries")}
          value={stats?.totalEntries || 0}
          subtitle={t("या महिन्यात", "This month")}
          trend={t("+12%", "+12%")}
          color="blue"
        />
        <StatCard
          icon="👥"
          title={t("सक्रिय वापरकर्ते", "Active Users")}
          value={stats?.totalUsers || 0}
          subtitle={t("या आठवड्यात", "This week")}
          trend={t("सक्रिय", "Active")}
          color="green"
        />
        <StatCard
          icon="🏢"
          title={t("महामंडळे", "Corporations")}
          value={stats?.totalCorporations || 0}
          subtitle={t("स्थिती", "Status")}
          trend={t("सर्व सक्रिय", "All active")}
          color="purple"
        />
        <StatCard
          icon="📅"
          title={t("आर्थिक वर्ष", "Financial Year")}
          value={stats?.activeFinancialYear || "N/A"}
          subtitle={t("सक्रिय", "Active")}
          trend={t("सध्याचे", "Current")}
          color="orange"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Trend Chart */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-4">
            {t("📈 मासिक प्रवृत्ती", "📈 Monthly Entry Trend")}
          </h3>
          {stats?.entriesByMonth?.length > 0 ? (
            <div className="space-y-3">
              {stats.entriesByMonth.slice(0, 6).map((item, idx) => {
                const maxCount = Math.max(
                  ...stats.entriesByMonth.map((i) => i.count),
                );
                const percentage =
                  maxCount > 0 ? (item.count / maxCount) * 100 : 0;
                return (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="text-sm text-slate-500 w-20">
                      {(language === "mr"
                        ? MONTHS_MARATHI[item._id.month]
                        : MONTHS_EN[item._id.month]) ||
                        MONTHS_EN[item._id.month]}{" "}
                      {item._id.year}
                    </span>
                    <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full flex items-center justify-end pr-2 transition-all duration-500"
                        style={{ width: `${Math.max(percentage, 10)}%` }}
                      >
                        <span className="text-xs text-white font-bold">
                          {item.count}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-slate-500 text-center py-8">
              {t("डेटा उपलब्ध नाही", "No data available")}
            </p>
          )}
        </div>

        {/* Corporation-wise Distribution */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-4">
            {t("🏢 महामंडळ वितरण", "🏢 Corporation Distribution")}
          </h3>
          {stats?.entriesByCorporation?.length > 0 ? (
            <div className="space-y-3">
              {stats.entriesByCorporation.map((corp, idx) => {
                const colors = [
                  "from-blue-500 to-cyan-500",
                  "from-green-500 to-emerald-500",
                  "from-purple-500 to-pink-500",
                  "from-orange-500 to-yellow-500",
                  "from-red-500 to-rose-500",
                ];
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-3 h-3 rounded-full bg-gradient-to-r ${colors[idx % colors.length]}`}
                      ></div>
                      <span className="font-medium text-slate-700">
                        {corp._id || t("अज्ञात", "Unknown")}
                      </span>
                    </div>
                    <span className="px-3 py-1 bg-slate-200 rounded-full text-sm font-bold text-slate-700">
                      {corp.count}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-slate-500 text-center py-8">
              {t("डेटा उपलब्ध नाही", "No data available")}
            </p>
          )}
        </div>
      </div>

      {/* Recent Entries Table */}
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-slate-800 to-slate-700 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">
            {t("📝 अलीकडील नोंदी", "📝 Recent Entries")}
          </h3>
          <span className="text-sm text-slate-300">
            {t("शेवटच्या 10 नोंदी", "Last 10 entries")}
          </span>
        </div>
        {recentEntries.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {t("महामंडळ", "Corporation")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    KRA
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {t("वर्ष", "Year")}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {t("लक्ष्य", "Target")}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {t("साध्य", "Achievement")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {t("तारीख", "Date")}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {t("वापरकर्ता", "User")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentEntries.map((entry) => {
                  const totalTarget = sumNumberField(
                    entry.kras,
                    "annualTarget",
                  );
                  const totalAchievement = sumNumberField(
                    entry.kras,
                    "kraAchievement",
                  );
                  const selectedIds = getSelectedKraIds(entry);

                  return (
                    <tr
                      key={entry._id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium">
                          {entry.corporation?.code || "N/A"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        <span
                          title={(Array.isArray(entry.kras) ? entry.kras : [])
                            .filter((k) => selectedIds.includes(k.kraId))
                            .map((k) => `KRA ${k.kraId}: ${k.kraName}`)
                            .join("\n")}
                        >
                          {selectedIds.length > 0
                            ? `KRAs: ${selectedIds.join(", ")}`
                            : "KRAs: -"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {entry.kraYear}
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-slate-700">
                        {totalTarget.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded-lg font-bold">
                          {totalAchievement.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-sm">
                        {new Date(
                          entry.achievementDate || entry.createdAt,
                        ).toLocaleDateString("en-IN")}
                      </td>
                      <td className="px-6 py-4 text-slate-600 text-sm">
                        {entry.submittedBy || "System"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-slate-500">
            <div className="text-4xl mb-4">📭</div>
            <p>No recent entries</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// ENTRIES SECTION (All User Entries with CRUD)
// ==========================================
function EntriesSection({ kraOptions, setError, setSuccess }) {
  const { t, language } = useLanguage();
  const effectiveKraOptions =
    Array.isArray(kraOptions) && kraOptions.length > 0
      ? kraOptions
      : DEFAULT_KRA_OPTIONS;
  const [entries, setEntries] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    corporation: "",
    region: "",
    circle: "",
    division: "",
    kraYear: "",
    search: "",
    kra: "",
  });
  const [dropdownData, setDropdownData] = useState(null);
  const [filteredRegions, setFilteredRegions] = useState([]);
  const [filteredCircles, setFilteredCircles] = useState([]);
  const [filteredDivisions, setFilteredDivisions] = useState([]);
  const [selectedEntries, setSelectedEntries] = useState([]);
  const [editingEntry, setEditingEntry] = useState(null);
  const [viewingEntry, setViewingEntry] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  useEffect(() => {
    fetchDropdownData();
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [filters, pagination.page]);

  // Filter regions based on selected corporation
  useEffect(() => {
    if (filters.corporation && dropdownData?.regions) {
      const regions = dropdownData.regions.filter(
        (r) => r.corporation?._id === filters.corporation,
      );
      setFilteredRegions(regions);
    } else {
      setFilteredRegions([]);
    }
  }, [filters.corporation, dropdownData?.regions]);

  // Filter circles based on selected region
  useEffect(() => {
    if (filters.region && dropdownData?.circles) {
      const circles = dropdownData.circles.filter(
        (c) => c.region?._id === filters.region,
      );
      setFilteredCircles(circles);
    } else {
      setFilteredCircles([]);
    }
  }, [filters.region, dropdownData?.circles]);

  // Load divisions based on selected circle
  useEffect(() => {
    const loadDivisions = async () => {
      if (!filters.circle) {
        setFilteredDivisions([]);
        return;
      }

      try {
        const res = await divisionApi.getByCircle(filters.circle);
        setFilteredDivisions(
          Array.isArray(res.data?.data) ? res.data.data : [],
        );
      } catch (err) {
        setFilteredDivisions([]);
      }
    };

    loadDivisions();
  }, [filters.circle]);

  // Handle corporation change - reset region and circle
  const handleCorporationChange = (value) => {
    setFilters((f) => ({
      ...f,
      corporation: value,
      region: "",
      circle: "",
      division: "",
    }));
    setFilteredCircles([]);
    setFilteredDivisions([]);
  };

  // Handle region change - reset circle
  const handleRegionChange = (value) => {
    setFilters((f) => ({ ...f, region: value, circle: "", division: "" }));
    setFilteredDivisions([]);
  };

  const fetchDropdownData = async () => {
    try {
      const { data } = await adminApi.getDropdownData();
      setDropdownData(data.data);
    } catch (err) {
      console.error("Failed to load dropdown data:", err);
    }
  };

  const fetchEntries = async () => {
    try {
      setLoading(true);
      const params = { page: pagination.page, limit: 20, ...filters };
      Object.keys(params).forEach((key) => !params[key] && delete params[key]);

      const { data } = await adminApi.getEntries(params);
      setEntries(data.data.entries);
      setPagination(data.data.pagination);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load entries");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (
      !window.confirm(
        t(
          "ही नोंद हटवायची आहे का?",
          "Are you sure you want to delete this entry?",
        ),
      )
    )
      return;

    try {
      await adminApi.deleteEntry(id);
      setSuccess(t("नोंद यशस्वीरित्या हटवली", "Entry deleted successfully"));
      fetchEntries();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete entry");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedEntries.length === 0) return;
    const count = selectedEntries.length;
    if (
      !window.confirm(
        t(`${count} नोंदी हटवायच्या आहेत का?`, `Delete ${count} entries?`),
      )
    )
      return;

    try {
      await adminApi.bulkDeleteEntries(selectedEntries);
      setSuccess(
        t(
          `${count} नोंदी यशस्वीरित्या हटवल्या`,
          `${count} entries deleted successfully`,
        ),
      );
      setSelectedEntries([]);
      fetchEntries();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete entries");
    }
  };

  const toggleSelectAll = () => {
    if (selectedEntries.length === entries.length) {
      setSelectedEntries([]);
    } else {
      setSelectedEntries(entries.map((e) => e._id));
    }
  };

  const toggleSelect = (id) => {
    setSelectedEntries((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const clearFilters = () => {
    setFilters({
      corporation: "",
      region: "",
      circle: "",
      division: "",
      kraYear: "",
      search: "",
      kra: "",
    });
    setFilteredRegions([]);
    setFilteredCircles([]);
    setFilteredDivisions([]);
    setPagination((p) => ({ ...p, page: 1 }));
  };

  return (
    <div className="space-y-6">
      {/* Header with Refresh Info */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">
            {t("सर्व नोंदी", "All Entries")}
          </h2>
          <p className="text-sm text-slate-500">
            {t("शेवटचे अपडेट:", "Last updated:")}{" "}
            {lastRefresh.toLocaleTimeString("en-IN")} (Auto-refresh: 10s)
          </p>
        </div>
        <button
          onClick={() => {
            fetchEntries();
            setLastRefresh(new Date());
          }}
          className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all flex items-center gap-2 shadow-lg"
        >
          {t("🔄 आत्ता रिफ्रेश करा", "🔄 Refresh Now")}
        </button>
      </div>

      {/* Filters Card */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <div className="flex flex-wrap gap-4 items-end">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-slate-600 mb-1">
              {t("शोधा", "Search")}
            </label>
            <input
              type="text"
              placeholder={t(
                "संपर्क, टिप्पणी इ. ने शोधा...",
                "Search by contact, remarks...",
              )}
              value={filters.search}
              onChange={(e) =>
                setFilters((f) => ({ ...f, search: e.target.value }))
              }
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
            />
          </div>

          {/* Corporation Filter */}
          <div className="w-48">
            <label className="block text-sm font-medium text-slate-600 mb-1">
              {t("महामंडळ", "Corporation")}
            </label>
            <select
              value={filters.corporation}
              onChange={(e) => handleCorporationChange(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">{t("सर्व महामंडळे", "All Corporations")}</option>
              {dropdownData?.corporations?.map((c) => (
                <option key={c._id} value={c._id}>
                  {localizeName(c, language)}
                </option>
              ))}
            </select>
          </div>

          {/* Region Filter */}
          <div className="w-48">
            <label className="block text-sm font-medium text-slate-600 mb-1">
              {t("प्रदेश", "Region")}
            </label>
            <select
              value={filters.region}
              onChange={(e) => handleRegionChange(e.target.value)}
              disabled={!filters.corporation || filteredRegions.length === 0}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
            >
              <option value="">{t("सर्व प्रदेश", "All Regions")}</option>
              {filteredRegions.map((r) => (
                <option key={r._id} value={r._id}>
                  {localizeName(r, language)}
                </option>
              ))}
            </select>
          </div>

          {/* Circle Filter */}
          <div className="w-48">
            <label className="block text-sm font-medium text-slate-600 mb-1">
              {t("मंडळ", "Circle")}
            </label>
            <select
              value={filters.circle}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  circle: e.target.value,
                  division: "",
                }))
              }
              disabled={!filters.region || filteredCircles.length === 0}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
            >
              <option value="">{t("सर्व मंडळे", "All Circles")}</option>
              {filteredCircles.map((c) => (
                <option key={c._id} value={c._id}>
                  {localizeName(c, language)}
                </option>
              ))}
            </select>
          </div>

          {/* Division Filter */}
          <div className="w-56">
            <label className="block text-sm font-medium text-slate-600 mb-1">
              {t("Division", "Division")}
            </label>
            <select
              value={filters.division}
              onChange={(e) =>
                setFilters((f) => ({ ...f, division: e.target.value }))
              }
              disabled={!filters.circle || filteredDivisions.length === 0}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
            >
              <option value="">{t("All Divisions", "All Divisions")}</option>
              {filteredDivisions.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Year Filter */}
          <div className="w-40">
            <label className="block text-sm font-medium text-slate-600 mb-1">
              {t("वर्ष", "Year")}
            </label>
            <select
              value={filters.kraYear}
              onChange={(e) =>
                setFilters((f) => ({ ...f, kraYear: e.target.value }))
              }
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">{t("सर्व वर्षे", "All Years")}</option>
              {dropdownData?.financialYears?.map((y) => (
                <option key={y._id} value={y.year}>
                  {y.year}
                </option>
              ))}
            </select>
          </div>

          {/* KRA Filter */}
          <div className="w-48">
            <label className="block text-sm font-medium text-slate-600 mb-1">
              {t("फलनिष्पत्ती", "KRA")}
            </label>
            <select
              value={filters.kra}
              onChange={(e) =>
                setFilters((f) => ({ ...f, kra: e.target.value }))
              }
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">{t("सर्व KRA", "All KRAs")}</option>
              {effectiveKraOptions.map((k) => (
                <option key={k.id} value={k.id}>
                  {localizeName(k, language)}
                </option>
              ))}
            </select>
          </div>

          {/* Clear & Actions */}
          <div className="flex gap-2">
            <button
              onClick={clearFilters}
              className="px-4 py-2.5 border border-slate-300 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors"
            >
              {t("क्लिअर", "Clear")}
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg shadow-indigo-200"
            >
              {t("➕ नोंद जोडा", "➕ Add Entry")}
            </button>
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedEntries.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between">
            <span className="text-sm text-slate-600">
              <strong>{selectedEntries.length}</strong>{" "}
              {t("नोंदी निवडल्या", "entries selected")}
            </span>
            <button
              onClick={handleBulkDelete}
              className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors"
            >
              🗑️ Delete Selected
            </button>
          </div>
        )}
      </div>

      {/* Entries Table */}
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        {loading ? (
          <LoadingSpinner text="Loading entries..." />
        ) : entries.length === 0 ? (
          <div className="p-16 text-center">
            <div className="text-6xl mb-4">📭</div>
            <h3 className="text-xl font-semibold text-slate-700 mb-2">
              No Entries Found
            </h3>
            <p className="text-slate-500">कोणतीही नोंद आढळली नाही</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-slate-800 to-slate-700">
                  <tr>
                    <th className="px-4 py-4 text-left">
                      <input
                        type="checkbox"
                        checked={selectedEntries.length === entries.length}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-400"
                      />
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-white uppercase tracking-wider">
                      Corporation
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-white uppercase tracking-wider">
                      KRA
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-white uppercase tracking-wider">
                      Year
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold text-white uppercase tracking-wider">
                      Target
                    </th>
                    <th className="px-4 py-4 text-right text-xs font-semibold text-white uppercase tracking-wider">
                      Achievement
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-white uppercase tracking-wider">
                      Month/Year
                    </th>
                    <th className="px-4 py-4 text-left text-xs font-semibold text-white uppercase tracking-wider">
                      Added By
                    </th>
                    <th className="px-4 py-4 text-center text-xs font-semibold text-white uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {entries.map((entry, idx) => {
                    const totalTarget = sumNumberField(
                      entry.kras,
                      "annualTarget",
                    );
                    const totalAchievement = sumNumberField(
                      entry.kras,
                      "kraAchievement",
                    );
                    const selectedIds = getSelectedKraIds(entry);

                    return (
                      <tr
                        key={entry._id}
                        className={`hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedEntries.includes(entry._id)}
                            onChange={() => toggleSelect(entry._id)}
                            className="rounded border-slate-300"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm font-semibold">
                            {entry.corporation?.code || "N/A"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="max-w-[200px]">
                            <p
                              className="text-sm font-medium text-slate-700 truncate"
                              title={
                                selectedIds.length > 0
                                  ? `KRAs: ${selectedIds.join(", ")}`
                                  : "KRAs: -"
                              }
                            >
                              {selectedIds.length > 0
                                ? `KRAs: ${selectedIds.join(", ")}`
                                : "KRAs: -"}
                            </p>
                            <p className="text-xs text-slate-400 truncate">
                              {selectedIds.length > 0
                                ? `${selectedIds.length} selected`
                                : "No KRA values"}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {entry.kraYear}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-700">
                          {totalTarget.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded-lg font-bold">
                            {totalAchievement.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-sm">
                          {MONTHS_MARATHI[entry.achievementMonth]}{" "}
                          {entry.achievementYear}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-slate-600">
                            {entry.submittedBy || "System"}
                          </p>
                          <p className="text-xs text-slate-400">
                            {new Date(entry.createdAt).toLocaleDateString(
                              "en-IN",
                            )}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center gap-1">
                            <button
                              onClick={() => setViewingEntry(entry)}
                              className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                              title="View"
                            >
                              👁️
                            </button>
                            <button
                              onClick={() => setEditingEntry(entry)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Edit"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => handleDelete(entry._id)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <p className="text-sm text-slate-600">
                Showing <strong>{entries.length}</strong> of{" "}
                <strong>{pagination.total}</strong> entries
              </p>
              <div className="flex gap-2">
                <button
                  disabled={pagination.page === 1}
                  onClick={() =>
                    setPagination((p) => ({ ...p, page: p.page - 1 }))
                  }
                  className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  ← Previous
                </button>
                <span className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-medium">
                  {pagination.page} / {pagination.pages}
                </span>
                <button
                  disabled={pagination.page === pagination.pages}
                  onClick={() =>
                    setPagination((p) => ({ ...p, page: p.page + 1 }))
                  }
                  className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next →
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* View Modal */}
      {viewingEntry && (
        <ViewEntryModal
          entry={viewingEntry}
          kraOptions={effectiveKraOptions}
          onClose={() => setViewingEntry(null)}
        />
      )}

      {/* Edit Modal */}
      {editingEntry && (
        <EntryModal
          entry={editingEntry}
          dropdownData={dropdownData}
          onClose={() => setEditingEntry(null)}
          onSave={() => {
            setEditingEntry(null);
            fetchEntries();
            setSuccess(
              t(
                "नोंद यशस्वीरित्या अद्यतनित केली",
                "Entry updated successfully",
              ),
            );
          }}
          setError={setError}
        />
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <EntryModal
          dropdownData={dropdownData}
          onClose={() => setShowCreateModal(false)}
          onSave={() => {
            setShowCreateModal(false);
            fetchEntries();
            setSuccess(t("नवीन नोंद तयार केली", "Entry created successfully"));
          }}
          setError={setError}
        />
      )}
    </div>
  );
}

// ==========================================
// VIEW ENTRY MODAL
// ==========================================
function ViewEntryModal({ entry, kraOptions, onClose }) {
  const { t, language } = useLanguage();
  const effectiveKraOptions =
    Array.isArray(kraOptions) && kraOptions.length > 0
      ? kraOptions
      : DEFAULT_KRA_OPTIONS;
  const totalTarget = sumNumberField(entry?.kras, "annualTarget");
  const totalAchievement = sumNumberField(entry?.kras, "kraAchievement");
  const selectedIds = getSelectedKraIds(entry);
  const kraRemarkMap = buildKraRemarkMap(entry?.remarks);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 bg-gradient-to-r from-slate-800 to-slate-700 rounded-t-2xl flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">
            {t("📋 नोंद तपशील", "📋 Entry Details")}
          </h2>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <InfoItem
              label={t("महामंडळ", "Corporation")}
              value={localizeName(entry.corporation, language)}
            />
            <InfoItem label={t("वर्ष", "Year")} value={entry.kraYear} />
            <InfoItem
              label={t("विभाग", "Region")}
              value={
                localizeName(entry.region, language) || t("लागू नाही", "N/A")
              }
            />
            <InfoItem
              label={t("वर्तुळ", "Circle")}
              value={
                localizeName(entry.circle, language) || t("लागू नाही", "N/A")
              }
            />
            <InfoItem
              label={t("विभाग (Division)", "Division")}
              value={entry?.division?.name || t("लागू नाही", "N/A")}
            />
          </div>

          {/* KRA Info */}
          <div className="bg-indigo-50 rounded-xl p-4">
            <h4 className="font-semibold text-indigo-800 mb-2">
              {t("KRA तपशील", "KRA Details")}
            </h4>
            <p className="text-indigo-700 text-sm">
              {t("निवडलेले KRA:", "Selected KRAs:")}{" "}
              {selectedIds.length > 0
                ? selectedIds.join(", ")
                : t("काहीही नाही", "None")}
            </p>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-indigo-900 text-white">
                  <tr>
                    <th className="px-3 py-2 text-left">Sr.</th>
                    <th className="px-3 py-2 text-left">{t("KRA", "KRA")}</th>
                    <th className="px-3 py-2 text-left">{t("नाव", "Name")}</th>
                    <th className="px-3 py-2 text-right">
                      {t("लक्ष्य", "Target")}
                    </th>
                    <th className="px-3 py-2 text-right">
                      {t("साध्य", "Achievement")}
                    </th>
                    <th className="px-3 py-2 text-left">
                      {t("टिप्पणी / अडचणी", "Remarks / Issues")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-indigo-100">
                  {(Array.isArray(entry.kras) ? entry.kras : []).map(
                    (k, idx) => {
                      const kraOption = effectiveKraOptions.find(
                        (o) => o.id === k.kraId,
                      );
                      const displayName = kraOption
                        ? localizeName(kraOption, language)
                        : k.kraName;
                      const kraRemark =
                        kraRemarkMap.get(Number(k.kraId)) || "-";

                      return (
                        <tr key={k.kraId}>
                          <td className="px-3 py-2 text-slate-700">
                            {idx + 1}
                          </td>
                          <td className="px-3 py-2 font-semibold text-indigo-800">
                            KRA {k.kraId}
                          </td>
                          <td className="px-3 py-2 text-indigo-700">
                            {displayName}
                          </td>
                          <td className="px-3 py-2 text-right text-indigo-700">
                            {(Number(k.annualTarget) || 0).toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-right text-indigo-700">
                            {(Number(k.kraAchievement) || 0).toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {kraRemark}
                          </td>
                        </tr>
                      );
                    },
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Achievement Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 rounded-xl p-4 text-center">
              <p className="text-sm text-blue-600 mb-1">
                {t("वार्षिक लक्ष्य", "Annual Target")}
              </p>
              <p className="text-3xl font-bold text-blue-700">
                {totalTarget.toLocaleString()}
              </p>
            </div>
            <div className="bg-green-50 rounded-xl p-4 text-center">
              <p className="text-sm text-green-600 mb-1">
                {t("साध्य", "Achievement")}
              </p>
              <p className="text-3xl font-bold text-green-700">
                {totalAchievement.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Other Details */}
          <div className="grid grid-cols-2 gap-4">
            <InfoItem
              label="Achievement Date"
              value={new Date(entry.achievementDate).toLocaleDateString(
                "en-IN",
              )}
            />
            <InfoItem label="Contact Number" value={entry.contactNumber} />
          </div>

          {/* Remarks */}
          {entry.remarks && (
            <div className="bg-slate-50 rounded-xl p-4">
              <h4 className="font-semibold text-slate-700 mb-2">
                {t("टिप्पणी", "Remarks")}
              </h4>
              <p className="text-slate-600">{entry.remarks}</p>
            </div>
          )}

          {/* Meta Info */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between text-sm text-slate-500">
            <span>Created by: {entry.user?.fullName || "System"}</span>
            <span>
              Created: {new Date(entry.createdAt).toLocaleString("en-IN")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// USERS SECTION
// ==========================================
function UsersSection({ isSuperAdmin, setError, setSuccess }) {
  const { t, language } = useLanguage();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [corporations, setCorporations] = useState([]);
  const [corpLoading, setCorpLoading] = useState(false);

  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState({
    fullName: "",
    userId: "",
    mobileNumber: "",
    corporation: "",
    password: "",
    role: "user",
  });
  const [savingUser, setSavingUser] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [deletingUser, setDeletingUser] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, [pagination.page, search]);

  useEffect(() => {
    fetchCorporations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchCorporations = async () => {
    try {
      setCorpLoading(true);
      const { data } = await adminApi.getDropdownData();
      setCorporations(data.data?.corporations || []);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          t("महामंडळे लोड करण्यात अयशस्वी", "Failed to load corporations"),
      );
    } finally {
      setCorpLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const params = { page: pagination.page, limit: 15 };
      if (search) params.search = search;

      const { data } = await adminApi.getUsers(params);
      setUsers(data.data.users);
      setPagination(data.data.pagination);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          t("वापरकर्ते लोड करण्यात अयशस्वी", "Failed to load users"),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (id) => {
    try {
      const { data } = await adminApi.toggleUserStatus(id);
      setSuccess(
        data.data.isActive
          ? t("वापरकर्ता सक्रिय केला", "User activated")
          : t("वापरकर्ता निष्क्रिय केला", "User deactivated"),
      );
      fetchUsers();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          t("वापरकर्ता अपडेट करण्यात अयशस्वी", "Failed to update user"),
      );
    }
  };

  const handleRoleChange = async (id, newRole) => {
    if (
      !window.confirm(
        t(
          `वापरकर्त्याची भूमिका ${newRole} अशी बदलायची?`,
          `Change user role to ${newRole}?`,
        ),
      )
    )
      return;

    try {
      await adminApi.updateUserRole(id, newRole);
      setSuccess(t("वापरकर्त्याची भूमिका अपडेट केली", "User role updated"));
      fetchUsers();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          t("भूमिका अपडेट करण्यात अयशस्वी", "Failed to update role"),
      );
    }
  };

  const openCreateUser = () => {
    setEditingUser(null);
    setUserForm({
      fullName: "",
      userId: "",
      mobileNumber: "",
      corporation: "",
      password: "",
      role: "user",
    });
    setUserModalOpen(true);
  };

  const openEditUser = (u) => {
    setEditingUser(u);
    setUserForm({
      fullName: u?.fullName || "",
      userId: u?.userId || u?.username || u?.mobileNumber || "",
      mobileNumber: u?.mobileNumber || "",
      corporation: u?.corporation?._id || u?.corporation || "",
      password: "",
      role: u?.role || "user",
    });
    setUserModalOpen(true);
  };

  const closeUserModal = () => {
    if (savingUser) return;
    setUserModalOpen(false);
    setEditingUser(null);
  };

  const handleSaveUser = async () => {
    if (!isSuperAdmin) return;

    const payload = {
      fullName: userForm.fullName?.trim(),
      userId: userForm.userId?.trim().toLowerCase(),
      mobileNumber: userForm.mobileNumber?.trim(),
      corporation: userForm.corporation,
    };

    if (
      !payload.fullName ||
      !payload.userId ||
      !payload.mobileNumber ||
      !payload.corporation
    ) {
      setError(
        t("कृपया सर्व आवश्यक माहिती भरा", "Please fill all required fields"),
      );
      return;
    }

    try {
      setSavingUser(true);

      if (editingUser?._id) {
        const updatePayload = { ...payload };
        if (userForm.password?.trim())
          updatePayload.password = userForm.password.trim();
        await adminApi.updateUser(editingUser._id, updatePayload);
        setSuccess(t("वापरकर्ता अपडेट केला", "User updated"));
      } else {
        if (!userForm.password?.trim()) {
          setError(t("पासवर्ड आवश्यक आहे", "Password is required"));
          return;
        }
        await adminApi.createUser({
          ...payload,
          password: userForm.password.trim(),
          role: userForm.role,
        });
        setSuccess(t("वापरकर्ता तयार केला", "User created"));
      }

      setUserModalOpen(false);
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          t("वापरकर्ता जतन करण्यात अयशस्वी", "Failed to save user"),
      );
    } finally {
      setSavingUser(false);
    }
  };

  const requestDeleteUser = (u) => {
    if (!isSuperAdmin) return;
    setUserToDelete(u);
    setDeleteModalOpen(true);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete?._id) return;
    try {
      setDeletingUser(true);
      await adminApi.deleteUser(userToDelete._id);
      setSuccess(t("वापरकर्ता हटवला", "User deleted"));
      setDeleteModalOpen(false);
      setUserToDelete(null);

      if (users.length === 1 && pagination.page > 1) {
        setPagination((p) => ({ ...p, page: p.page - 1 }));
      } else {
        fetchUsers();
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
          t("वापरकर्ता हटवण्यात अयशस्वी", "Failed to delete user"),
      );
    } finally {
      setDeletingUser(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <div className="flex items-center gap-4">
          <div className="flex-1 max-w-md">
            <label className="block text-sm font-medium text-slate-600 mb-1">
              {t("वापरकर्ते शोधा", "Search Users")}
            </label>
            <input
              type="text"
              placeholder={t(
                "नाव, युजर आयडी किंवा मोबाईलने शोधा...",
                "Search by name, user ID, or mobile...",
              )}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {isSuperAdmin && (
            <div className="flex items-end">
              <button
                type="button"
                onClick={openCreateUser}
                className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all"
              >
                + {t("वापरकर्ता जोडा", "Add User")}
              </button>
            </div>
          )}
          <div className="text-right">
            <p className="text-sm text-slate-500">
              {t("एकूण वापरकर्ते", "Total Users")}
            </p>
            <p className="text-2xl font-bold text-slate-700">
              {pagination.total}
            </p>
          </div>
        </div>
        {!isSuperAdmin && (
          <p className="mt-3 text-sm text-slate-500">
            {t(
              "टीप: वापरकर्ता तयार/संपादित/हटवण्यासाठी मुख्य प्रशासक अधिकार आवश्यक आहेत.",
              "Note: Creating/editing/deleting users requires Superadmin access.",
            )}
          </p>
        )}
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        {loading ? (
          <LoadingSpinner
            text={t("वापरकर्ते लोड होत आहेत...", "Loading users...")}
          />
        ) : users.length === 0 ? (
          <div className="p-16 text-center">
            <div className="text-6xl mb-4">👥</div>
            <h3 className="text-xl font-semibold text-slate-700 mb-2">
              {t("वापरकर्ते सापडले नाहीत", "No Users Found")}
            </h3>
            <p className="text-slate-500">
              {t(
                "कोणताही वापरकर्ता आढळला नाही",
                "No users matched your search",
              )}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-slate-800 to-slate-700">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-white uppercase">
                      User
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-white uppercase">
                      User ID
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-white uppercase">
                      Mobile
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-white uppercase">
                      Corporation
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-white uppercase">
                      Role
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-white uppercase">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-white uppercase">
                      Joined
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-semibold text-white uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => (
                    <tr
                      key={u._id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                              u.role === "superadmin"
                                ? "bg-gradient-to-br from-yellow-500 to-orange-500"
                                : u.role === "admin"
                                  ? "bg-gradient-to-br from-purple-500 to-indigo-500"
                                  : "bg-gradient-to-br from-blue-500 to-cyan-500"
                            }`}
                          >
                            {u.fullName?.charAt(0) || "U"}
                          </div>
                          <div>
                            <p className="font-medium text-slate-700">
                              {u.fullName}
                            </p>
                            <p className="text-xs text-slate-400">
                              {u.email || t("ईमेल नाही", "No email")}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {u.userId || u.username || u.mobileNumber || "-"}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {u.mobileNumber}
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-sm">
                          {localizeName(u.corporation, language) ||
                            t("लागू नाही", "N/A")}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {isSuperAdmin ? (
                          <select
                            value={u.role}
                            onChange={(e) =>
                              handleRoleChange(u._id, e.target.value)
                            }
                            className={`px-3 py-1.5 text-xs rounded-full font-semibold border-0 cursor-pointer ${
                              u.role === "superadmin"
                                ? "bg-yellow-100 text-yellow-800"
                                : u.role === "admin"
                                  ? "bg-purple-100 text-purple-800"
                                  : "bg-slate-100 text-slate-800"
                            }`}
                          >
                            <option value="user">
                              {t("वापरकर्ता", "User")}
                            </option>
                            <option value="admin">
                              {t("प्रशासक", "Admin")}
                            </option>
                            <option value="superadmin">
                              {t("मुख्य प्रशासक", "Superadmin")}
                            </option>
                          </select>
                        ) : (
                          <span
                            className={`px-3 py-1.5 text-xs rounded-full font-semibold ${
                              u.role === "superadmin"
                                ? "bg-yellow-100 text-yellow-800"
                                : u.role === "admin"
                                  ? "bg-purple-100 text-purple-800"
                                  : "bg-slate-100 text-slate-800"
                            }`}
                          >
                            {u.role?.toUpperCase()}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`px-3 py-1.5 text-xs rounded-full font-semibold ${
                            u.isActive
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {u.isActive ? "✓ Active" : "✗ Inactive"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500 text-sm">
                        {new Date(u.createdAt).toLocaleDateString("en-IN")}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => handleToggleStatus(u._id)}
                          className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                            u.isActive
                              ? "bg-red-100 text-red-700 hover:bg-red-200"
                              : "bg-green-100 text-green-700 hover:bg-green-200"
                          }`}
                        >
                          {u.isActive ? "Deactivate" : "Activate"}
                        </button>

                        {isSuperAdmin && (
                          <div className="mt-2 flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEditUser(u)}
                              className="px-3 py-2 text-xs font-medium rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
                            >
                              {t("संपादन", "Edit")}
                            </button>
                            <button
                              type="button"
                              disabled={
                                String(currentUser?.id) === String(u._id)
                              }
                              onClick={() => requestDeleteUser(u)}
                              className="px-3 py-2 text-xs font-medium rounded-lg bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
                              title={
                                String(currentUser?.id) === String(u._id)
                                  ? t(
                                      "तुमचे स्वतःचे खाते हटवू शकत नाही",
                                      "You cannot delete your own account",
                                    )
                                  : undefined
                              }
                            >
                              {t("हटवा", "Delete")}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-6 py-4 bg-slate-50 border-t flex items-center justify-between">
              <p className="text-sm text-slate-600">
                Showing <strong>{users.length}</strong> of{" "}
                <strong>{pagination.total}</strong> users
              </p>
              <div className="flex gap-2">
                <button
                  disabled={pagination.page === 1}
                  onClick={() =>
                    setPagination((p) => ({ ...p, page: p.page - 1 }))
                  }
                  className="px-4 py-2 border rounded-lg hover:bg-slate-100 disabled:opacity-50"
                >
                  ← Previous
                </button>
                <span className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg">
                  {pagination.page} / {pagination.pages}
                </span>
                <button
                  disabled={pagination.page === pagination.pages}
                  onClick={() =>
                    setPagination((p) => ({ ...p, page: p.page + 1 }))
                  }
                  className="px-4 py-2 border rounded-lg hover:bg-slate-100 disabled:opacity-50"
                >
                  Next →
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Create/Edit User Modal */}
      {userModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeUserModal}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
              <h3 className="text-xl font-bold text-white">
                {editingUser
                  ? t("वापरकर्ता संपादित करा", "Edit User")
                  : t("वापरकर्ता जोडा", "Add User")}
              </h3>
              <p className="text-indigo-100 text-sm mt-1">
                {t(
                  "नाव, युजर आयडी, मोबाईल आणि महामंडळ आवश्यक आहे.",
                  "Name, user ID, mobile and corporation are required.",
                )}
              </p>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  {t("पूर्ण नाव", "Full Name")} *
                </label>
                <input
                  type="text"
                  value={userForm.fullName}
                  onChange={(e) =>
                    setUserForm((f) => ({ ...f, fullName: e.target.value }))
                  }
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  {t("वापरकर्ता आयडी", "User ID")} *
                </label>
                <input
                  type="text"
                  value={userForm.userId}
                  onChange={(e) =>
                    setUserForm((f) => ({
                      ...f,
                      userId: e.target.value.toLowerCase().trim(),
                    }))
                  }
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  placeholder="user_01"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  {t("मोबाईल क्रमांक", "Mobile Number")} *
                </label>
                <input
                  type="text"
                  value={userForm.mobileNumber}
                  onChange={(e) =>
                    setUserForm((f) => ({
                      ...f,
                      mobileNumber: e.target.value,
                    }))
                  }
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  placeholder="9XXXXXXXXX"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  {t("महामंडळ", "Corporation")} *
                </label>
                <select
                  value={userForm.corporation}
                  onChange={(e) =>
                    setUserForm((f) => ({ ...f, corporation: e.target.value }))
                  }
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  disabled={corpLoading}
                >
                  <option value="">{t("निवडा", "Select")}</option>
                  {corporations.map((c) => (
                    <option key={c._id} value={c._id}>
                      {localizeName(c, language) || c.name}
                    </option>
                  ))}
                </select>
              </div>

              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">
                    {t("भूमिका", "Role")}
                  </label>
                  <select
                    value={userForm.role}
                    onChange={(e) =>
                      setUserForm((f) => ({ ...f, role: e.target.value }))
                    }
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="user">{t("वापरकर्ता", "User")}</option>
                    <option value="admin">{t("प्रशासक", "Admin")}</option>
                    <option value="superadmin">
                      {t("मुख्य प्रशासक", "Superadmin")}
                    </option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  {editingUser
                    ? t("नवीन पासवर्ड (ऐच्छिक)", "New Password (optional)")
                    : t("पासवर्ड", "Password")}{" "}
                  {editingUser ? "" : "*"}
                </label>
                <input
                  type="password"
                  value={userForm.password}
                  onChange={(e) =>
                    setUserForm((f) => ({ ...f, password: e.target.value }))
                  }
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                />
                {editingUser && (
                  <p className="text-xs text-slate-500 mt-1">
                    {t(
                      "पासवर्ड रिकामा ठेवल्यास बदलला जाणार नाही.",
                      "Leave blank to keep the current password.",
                    )}
                  </p>
                )}
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3 justify-end">
              <button
                type="button"
                onClick={closeUserModal}
                disabled={savingUser}
                className="px-5 py-2.5 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-100 transition-all disabled:opacity-50"
              >
                {t("रद्द करा", "Cancel")}
              </button>
              <button
                type="button"
                onClick={handleSaveUser}
                disabled={savingUser || !isSuperAdmin}
                className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold rounded-xl shadow-lg disabled:opacity-50"
              >
                {savingUser
                  ? t("जतन होत आहे...", "Saving...")
                  : t("जतन करा", "Save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      <ConfirmModal
        isOpen={deleteModalOpen}
        onClose={() => {
          if (deletingUser) return;
          setDeleteModalOpen(false);
          setUserToDelete(null);
        }}
        onConfirm={handleDeleteUser}
        title={t("Delete User", "Delete User")}
        titleMr={t("वापरकर्ता हटवा", "Delete User")}
        message={
          userToDelete
            ? t(
                `Are you sure you want to delete ${userToDelete.fullName}?`,
                `Are you sure you want to delete ${userToDelete.fullName}?`,
              )
            : t("Are you sure?", "Are you sure?")
        }
        messageMr={
          userToDelete
            ? t(
                `${userToDelete.fullName} हा वापरकर्ता हटवायचा?`,
                `${userToDelete.fullName} हा वापरकर्ता हटवायचा?`,
              )
            : t("खात्री आहे का?", "Are you sure?")
        }
        confirmText={t("Delete", "Delete")}
        confirmTextMr={t("हटवा", "Delete")}
        cancelText={t("Cancel", "Cancel")}
        cancelTextMr={t("रद्द करा", "Cancel")}
        type="danger"
        isLoading={deletingUser}
      />
    </div>
  );
}

// ==========================================
// YEARS SECTION
// ==========================================
function YearsSection({ setError, setSuccess }) {
  const { t, language } = useLanguage();
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newYear, setNewYear] = useState("");
  const [creating, setCreating] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Toast state for auto-dismiss notifications
  const [toast, setToast] = useState({
    isVisible: false,
    type: "success",
    title: "",
    titleMr: "",
    message: "",
    messageMr: "",
    icon: "",
    key: 0, // Key to force re-render for new toasts
  });

  // Modal states for delete/deactivate confirmations
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    type: "warning",
    title: "",
    titleMr: "",
    message: "",
    messageMr: "",
    confirmText: "",
    confirmTextMr: "",
    icon: "",
    onConfirm: () => {},
  });

  useEffect(() => {
    fetchYears();
  }, []);

  const fetchYears = async () => {
    try {
      setLoading(true);
      const { data } = await adminApi.getFinancialYears();
      setYears(data.data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load financial years");
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setConfirmModal((prev) => ({ ...prev, isOpen: false }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newYear.match(/^\d{4}-\d{2}$/)) {
      setError("Year must be in format YYYY-YY (e.g., 2024-25)");
      return;
    }

    try {
      setCreating(true);
      await adminApi.createFinancialYear({ year: newYear });
      setSuccess("Financial year created successfully");
      setNewYear("");
      fetchYears();
    } catch (err) {
      setError(
        err.response?.data?.message || "Failed to create financial year",
      );
    } finally {
      setCreating(false);
    }
  };

  const handleSetActive = async (id) => {
    const yearToActivate = years.find((y) => y._id === id);
    const currentActive = years.find((y) => y.isActive);

    try {
      setActionLoading(true);

      // Show toast immediately with activation info
      let toastMessage = `Users can now make entries for ${yearToActivate?.year}`;
      let toastMessageMr = `वापरकर्ते आता ${yearToActivate?.year} साठी नोंदी करू शकतात`;

      if (currentActive) {
        toastMessage = `${currentActive.year} is now locked`;
        toastMessageMr = `${currentActive.year} आता लॉक झाले आहे`;
      }

      // Make API call
      await adminApi.updateFinancialYear(id, {
        isActive: true,
        isLocked: false,
      });

      // Show auto-dismiss toast
      setToast({
        isVisible: true,
        type: "success",
        title: `${yearToActivate?.year} Activated!`,
        titleMr: `${yearToActivate?.year} सक्रिय झाले!`,
        message: toastMessage,
        messageMr: toastMessageMr,
        icon: "✅",
        key: Date.now(), // Force new render
      });

      // Clear toast visibility after delay
      setTimeout(() => {
        setToast((prev) => ({ ...prev, isVisible: false }));
      }, 2100);

      fetchYears();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSetInactive = (id) => {
    const yearToDeactivate = years.find((y) => y._id === id);

    setConfirmModal({
      isOpen: true,
      type: "warning",
      title: `Deactivate ${yearToDeactivate?.year}?`,
      titleMr: `${yearToDeactivate?.year} निष्क्रिय करायचे?`,
      message: `Deactivating this year will lock it and prevent all users from making new entries. You'll need to activate another year for data entry to continue.`,
      messageMr: `हे वर्ष निष्क्रिय केल्याने ते लॉक होईल आणि सर्व वापरकर्त्यांना नवीन नोंदी करण्यापासून प्रतिबंधित करेल. डेटा एंट्री सुरू ठेवण्यासाठी तुम्हाला दुसरे वर्ष सक्रिय करावे लागेल.`,
      confirmText: "Deactivate",
      confirmTextMr: "निष्क्रिय करा",
      icon: "⏸️",
      onConfirm: async () => {
        try {
          setActionLoading(true);
          await adminApi.updateFinancialYear(id, {
            isActive: false,
            isLocked: true,
          });
          setSuccess(
            t(
              "आर्थिक वर्ष निष्क्रिय आणि लॉक केले",
              "Financial year deactivated & locked",
            ),
          );
          fetchYears();
          closeModal();
        } catch (err) {
          setError(err.response?.data?.message || "Failed to deactivate");
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  const handleDelete = (id) => {
    const yearToDelete = years.find((y) => y._id === id);

    setConfirmModal({
      isOpen: true,
      type: "danger",
      title: `Delete ${yearToDelete?.year}?`,
      titleMr: `${yearToDelete?.year} हटवायचे?`,
      message: `This action cannot be undone. The financial year ${yearToDelete?.year} will be permanently deleted from the system.`,
      messageMr: `ही क्रिया पूर्ववत केली जाऊ शकत नाही. ${yearToDelete?.year} आर्थिक वर्ष सिस्टममधून कायमचे हटवले जाईल.`,
      confirmText: "Delete",
      confirmTextMr: "हटवा",
      icon: "🗑️",
      onConfirm: async () => {
        try {
          setActionLoading(true);
          await adminApi.deleteFinancialYear(id);
          setSuccess(t("आर्थिक वर्ष हटवले", "Financial year deleted"));
          fetchYears();
          closeModal();
        } catch (err) {
          setError(err.response?.data?.message || "Failed to delete");
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  if (loading)
    return (
      <LoadingSpinner
        text={t("आर्थिक वर्षे लोड होत आहेत...", "Loading financial years...")}
      />
    );

  return (
    <div className="space-y-6">
      {/* Auto-dismiss Toast for Set Active */}
      <AutoToast
        key={toast.key}
        isVisible={toast.isVisible}
        type={toast.type}
        title={toast.title}
        titleMr={toast.titleMr}
        message={toast.message}
        messageMr={toast.messageMr}
        icon={toast.icon}
        duration={2000}
      />

      {/* Confirm Modal for Deactivate & Delete */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={closeModal}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        titleMr={confirmModal.titleMr}
        message={confirmModal.message}
        messageMr={confirmModal.messageMr}
        confirmText={confirmModal.confirmText}
        confirmTextMr={confirmModal.confirmTextMr}
        type={confirmModal.type}
        icon={confirmModal.icon}
        isLoading={actionLoading}
      />

      {/* Create New Year */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4">
          {t("➕ नवीन आर्थिक वर्ष", "➕ Add New Financial Year")}
        </h2>
        <form onSubmit={handleCreate} className="flex gap-4 items-end">
          <div className="flex-1 max-w-xs">
            <label className="block text-sm font-medium text-slate-600 mb-1">
              {t("वर्ष स्वरूप: YYYY-YY", "Year Format: YYYY-YY")}
            </label>
            <input
              type="text"
              value={newYear}
              onChange={(e) => setNewYear(e.target.value)}
              placeholder="e.g., 2024-25"
              pattern="\d{4}-\d{2}"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition-all shadow-lg"
          >
            {creating
              ? t("तयार होत आहे...", "Creating...")
              : t("वर्ष जोडा", "Add Year")}
          </button>
        </form>
      </div>

      {/* Years List */}
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-slate-800 to-slate-700">
          <h2 className="text-lg font-bold text-white">
            {t("📅 आर्थिक वर्षे", "📅 Financial Years")}
          </h2>
        </div>

        {years.length === 0 ? (
          <div className="p-16 text-center">
            <div className="text-6xl mb-4">📅</div>
            <h3 className="text-xl font-semibold text-slate-700 mb-2">
              {t("आर्थिक वर्षे नाहीत", "No Financial Years")}
            </h3>
            <p className="text-slate-500">
              {t(
                "वरील फॉर्ममध्ये पहिले आर्थिक वर्ष जोडा",
                "Add your first financial year above",
              )}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {years.map((year) => (
              <div
                key={year._id}
                className={`p-6 flex items-center justify-between ${year.isActive ? "bg-green-50" : ""}`}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${year.isActive ? "bg-green-500 text-white" : "bg-slate-100"}`}
                  >
                    📅
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-bold text-slate-800">
                        {year.year}
                      </h3>
                      {year.isActive ? (
                        <span className="px-2 py-0.5 bg-green-500 text-white text-xs rounded-full font-semibold">
                          {t("✓ सक्रिय", "✓ ACTIVE")}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-slate-400 text-white text-xs rounded-full font-semibold">
                          {t("🔒 निष्क्रिय", "🔒 INACTIVE")}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500">
                      {new Date(year.startDate).toLocaleDateString("en-IN")} -{" "}
                      {new Date(year.endDate).toLocaleDateString("en-IN")}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {year.isActive ? (
                    <button
                      onClick={() => handleSetInactive(year._id)}
                      className="px-4 py-2 bg-orange-600 text-white text-sm rounded-xl hover:bg-orange-700 transition-colors"
                    >
                      {t("⏸️ निष्क्रिय करा", "⏸️ Deactivate")}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSetActive(year._id)}
                      className="px-4 py-2 bg-green-600 text-white text-sm rounded-xl hover:bg-green-700 transition-colors"
                    >
                      {t("✅ सक्रिय करा", "✅ Set Active")}
                    </button>
                  )}
                  {!year.isActive && (
                    <button
                      onClick={() => handleDelete(year._id)}
                      className="px-4 py-2 bg-red-100 text-red-700 text-sm rounded-xl hover:bg-red-200 transition-colors"
                    >
                      {t("🗑️ हटवा", "🗑️ Delete")}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
        <h3 className="font-bold text-blue-800 mb-3">
          {t("ℹ️ आर्थिक वर्षांबद्दल", "ℹ️ About Financial Years")}
        </h3>
        {language === "mr" ? (
          <ul className="text-sm text-blue-700 space-y-2">
            <li>
              • <strong>फक्त एक सक्रिय वर्ष:</strong> एकावेळी फक्त एकच आर्थिक
              वर्ष सक्रिय असू शकते. नवीन वर्ष सक्रिय केल्यावर मागील सक्रिय वर्ष
              आपोआप निष्क्रिय आणि लॉक होते.
            </li>
            <li>
              • <strong>सक्रिय वर्ष:</strong> वापरकर्ते फक्त सक्रिय वर्षासाठीच
              नोंदी सबमिट करू शकतात. सक्रिय वर्ष आपोआप अनलॉक असते.
            </li>
            <li>
              • <strong>निष्क्रिय वर्ष:</strong> निष्क्रिय वर्षे आपोआप लॉक
              असतात. नवीन नोंदी करता येत नाहीत.
            </li>
            <li>
              • <strong>हटवा:</strong> फक्त निष्क्रिय आणि नोंदी नसलेली वर्षेच
              हटवता येतात.
            </li>
          </ul>
        ) : (
          <ul className="text-sm text-blue-700 space-y-2">
            <li>
              • <strong>Only One Active Year:</strong> Only one financial year
              can be active at a time. Activating a new year automatically
              deactivates and locks the previous one.
            </li>
            <li>
              • <strong>Active Year:</strong> Users can submit entries only for
              the active year. The active year is automatically unlocked.
            </li>
            <li>
              • <strong>Inactive Year:</strong> Inactive years are automatically
              locked. No new entries can be made.
            </li>
            <li>
              • <strong>Delete:</strong> Only inactive years with no entries can
              be deleted.
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}

// ==========================================
// KRAs SECTION (CRUD)
// ==========================================
function KrasSection({ setError, setSuccess, onKrasChanged }) {
  const { t } = useLanguage();
  const [kras, setKras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Toast popup state
  const [toast, setToast] = useState({
    show: false,
    type: "success",
    title: "",
    message: "",
  });
  const [toastKey, setToastKey] = useState(0);
  const showToast = (type, title, message = "") => {
    setToastKey((k) => k + 1);
    setToast({ show: true, type, title, message });
  };

  const [formData, setFormData] = useState({
    kraNumber: "",
    name: "",
    nameEnglish: "",
    unit: "",
    description: "",
    sortOrder: "",
    isActive: true,
  });

  const load = async () => {
    try {
      setLoading(true);
      const res = await kraApi.getAll();
      const list = Array.isArray(res?.data?.data) ? res.data.data : [];
      setKras(list);
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to load KRAs";
      setError(msg);
      showToast("error", t("त्रुटी", "Error"), msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setFormData({
      kraNumber: "",
      name: "",
      nameEnglish: "",
      unit: "",
      description: "",
      sortOrder: "",
      isActive: true,
    });
    setShowModal(true);
  };

  const save = async () => {
    // Basic validation
    if (!formData.name || !formData.name.trim()) {
      const msg = t("KRA चे नाव आवश्यक आहे", "KRA name is required");
      setError(msg);
      showToast("warning", msg);
      return;
    }
    try {
      setSaving(true);
      const payload = {
        ...formData,
        name: formData.name.trim(),
        nameEnglish: (formData.nameEnglish || "").trim(),
        kraNumber:
          formData.kraNumber === "" ? undefined : Number(formData.kraNumber),
        sortOrder: formData.sortOrder === "" ? 0 : Number(formData.sortOrder),
      };
      // Remove kraNumber from payload if undefined so it's not sent as null
      if (payload.kraNumber === undefined) delete payload.kraNumber;

      await kraApi.create(payload);
      const msg = t("KRA तयार झाले", "KRA created successfully");
      setSuccess(msg);
      showToast("success", msg);

      setShowModal(false);
      await load();
      if (typeof onKrasChanged === "function") await onKrasChanged();
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to save KRA";
      setError(msg);
      showToast("error", t("त्रुटी", "Error"), msg);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (kra) => {
    if (!kra?._id) return;
    if (!window.confirm(t("KRA डिलीट करायचे?", "Delete this KRA?"))) return;
    try {
      setDeletingId(kra._id);
      await kraApi.delete(kra._id);
      const msg = t("KRA डिलीट झाले", "KRA deleted successfully");
      setSuccess(msg);
      showToast("success", msg);
      await load();
      if (typeof onKrasChanged === "function") await onKrasChanged();
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to delete KRA";
      setError(msg);
      showToast("error", t("त्रुटी", "Error"), msg);
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return <LoadingSpinner text={t("KRA लोड होत आहे...", "Loading KRAs...")} />;
  }

  return (
    <div className="space-y-6">
      {/* Toast popup */}
      <AutoToast
        key={toastKey}
        isVisible={toast.show}
        type={toast.type}
        title={toast.title}
        message={toast.message}
        duration={2500}
      />
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              {t("KRA व्यवस्थापन", "KRA Management")}
            </h2>
            <p className="text-sm text-slate-500">
              {t(
                "KRA मास्टरसाठी CRUD (गरजेनुसार कितीही KRA)",
                "CRUD for KRA master (add any number of KRAs)",
              )}
            </p>
          </div>

          <button
            onClick={openCreate}
            className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg shadow-indigo-200"
          >
            {t("➕ KRA जोडा", "➕ Add KRA")}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">
                  {t("क्रमांक", "No.")}
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">
                  {t("नाव (मराठी)", "Name (Marathi)")}
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">
                  {t("नाव (English)", "Name (English)")}
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">
                  {t("युनिट", "Unit")}
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-slate-700">
                  {t("स्थिती", "Status")}
                </th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-slate-700">
                  {t("क्रिया", "Actions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {kras.map((k) => (
                <tr key={k._id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-slate-700 font-semibold">
                    {k.kraNumber ?? k.sortOrder ?? "-"}
                  </td>
                  <td className="px-6 py-4 text-slate-700">{k.name}</td>
                  <td className="px-6 py-4 text-slate-600">
                    {k.nameEnglish || "-"}
                  </td>
                  <td className="px-6 py-4 text-slate-600">{k.unit || "-"}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                        k.isActive !== false
                          ? "bg-green-100 text-green-700"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {k.isActive !== false
                        ? t("Active", "Active")
                        : t("Inactive", "Inactive")}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => remove(k)}
                        disabled={deletingId === k._id}
                        className="px-3 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {deletingId === k._id
                          ? t("Deleting...", "Deleting...")
                          : t("Delete", "Delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !saving && setShowModal(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-slate-800 to-slate-700 text-white">
              <h3 className="text-lg font-bold">{t("KRA जोडा", "Add KRA")}</h3>
              <p className="text-sm opacity-80">
                {t(
                  "टीप: KRA 3 साठी {year} वापरू शकता",
                  "Tip: You can use {year} placeholder for KRA 3",
                )}
              </p>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t("KRA क्रमांक", "KRA Number")}
                </label>
                <input
                  type="number"
                  min={1}
                  value={formData.kraNumber}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, kraNumber: e.target.value }))
                  }
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t("Sort Order", "Sort Order")}
                </label>
                <input
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, sortOrder: e.target.value }))
                  }
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t("नाव (मराठी)", "Name (Marathi)")}
                </label>
                <input
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, name: e.target.value }))
                  }
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t("नाव (English)", "Name (English)")}
                </label>
                <input
                  value={formData.nameEnglish}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, nameEnglish: e.target.value }))
                  }
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t("युनिट", "Unit")}
                </label>
                <input
                  value={formData.unit}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, unit: e.target.value }))
                  }
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-end gap-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, isActive: e.target.checked }))
                    }
                  />
                  {t("Active", "Active")}
                </label>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t("वर्णन", "Description")}
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, description: e.target.value }))
                  }
                  rows={3}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowModal(false)}
                disabled={saving}
                className="px-4 py-2.5 border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 disabled:opacity-50"
              >
                {t("रद्द करा", "Cancel")}
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
              >
                {saving ? t("Saving...", "Saving...") : t("सेव्ह", "Save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// SETTINGS SECTION
// ==========================================
function SettingsSection({ isSuperAdmin, setError, setSuccess }) {
  const { t, language } = useLanguage();
  const [corporations, setCorporations] = useState([]);
  const [loading, setLoading] = useState(true);

  const [toast, setToast] = useState({
    isVisible: false,
    type: "success",
    title: "",
    titleMr: "",
    message: "",
    messageMr: "",
    icon: "",
    key: 0,
  });

  const [corpModalOpen, setCorpModalOpen] = useState(false);
  const [editingCorp, setEditingCorp] = useState(null);
  const [corpName, setCorpName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCorporations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchCorporations = async () => {
    try {
      setLoading(true);
      // Use dropdown-data since it's already present in older backend builds.
      // This avoids hard dependency on the newer /api/admin/corporations endpoint.
      const { data } = await adminApi.getDropdownData();
      setCorporations(
        Array.isArray(data.data?.corporations) ? data.data.corporations : [],
      );
    } catch (err) {
      setError(
        err.response?.data?.message ||
          t("महामंडळे लोड करण्यात अयशस्वी", "Failed to load corporations"),
      );
    } finally {
      setLoading(false);
    }
  };

  const openRename = (c) => {
    if (!isSuperAdmin) return;
    setEditingCorp(c);
    setCorpName(c?.name || "");
    setCorpModalOpen(true);
  };

  const closeRename = (opts = {}) => {
    const { force = false } = opts;
    if (saving && !force) return;
    setCorpModalOpen(false);
    setEditingCorp(null);
    setCorpName("");
  };

  const saveRename = async () => {
    if (!editingCorp?._id) return;
    const nextName = corpName.trim();
    if (!nextName) {
      setError(t("महामंडळ नाव आवश्यक आहे", "Corporation name is required"));
      return;
    }
    try {
      setSaving(true);
      try {
        await adminApi.updateCorporation(editingCorp._id, { name: nextName });
      } catch (e) {
        // If backend hasn't been restarted yet, the new admin endpoint may not exist (404).
        // Fall back to existing /api/corporations/:id PUT so the feature works immediately.
        const status = e?.response?.status;
        if (status === 404) {
          await corporationApi.update(editingCorp._id, { name: nextName });
        } else {
          throw e;
        }
      }
      await fetchCorporations();

      setToast({
        isVisible: true,
        type: "success",
        title: "Updated!",
        titleMr: "अपडेट झाले!",
        message: `Corporation renamed to ${nextName}`,
        messageMr: `महामंडळाचे नाव ${nextName} असे केले`,
        icon: "✅",
        key: Date.now(),
      });

      setTimeout(() => {
        setToast((prev) => ({ ...prev, isVisible: false }));
      }, 2100);

      setSuccess(t("महामंडळ नाव अपडेट केले", "Corporation name updated"));
      closeRename({ force: true });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          t("महामंडळ अपडेट करण्यात अयशस्वी", "Failed to update corporation"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <AutoToast
        key={toast.key}
        isVisible={toast.isVisible}
        type={toast.type}
        title={toast.title}
        titleMr={toast.titleMr}
        message={toast.message}
        messageMr={toast.messageMr}
        icon={toast.icon}
        duration={2000}
      />

      {/* Corporation Management */}
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              {t("महामंडळ व्यवस्थापन", "Corporation Management")}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {t(
                "येथे महामंडळांचे नाव बदलू शकता.",
                "You can rename corporations here.",
              )}
            </p>
          </div>
          {!isSuperAdmin && (
            <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-amber-100 text-amber-800">
              {t("फक्त मुख्य प्रशासक", "Superadmin only")}
            </span>
          )}
        </div>

        {loading ? (
          <LoadingSpinner text={t("महामंडळे लोड होत आहेत...", "Loading...")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-slate-800 to-slate-700">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-white uppercase">
                    {t("महामंडळ", "Corporation")}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-white uppercase">
                    {t("कोड", "Code")}
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-white uppercase">
                    {t("स्थिती", "Status")}
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-white uppercase">
                    {t("क्रिया", "Actions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {corporations.map((c) => (
                  <tr
                    key={c._id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-700">
                        {localizeName(c, language) || c.name}
                      </div>
                      <div className="text-xs text-slate-400">
                        {t("ID:", "ID:")} {c._id}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{c.code}</td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`px-3 py-1.5 text-xs rounded-full font-semibold ${
                          c.isActive
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {c.isActive
                          ? t("सक्रिय", "Active")
                          : t("निष्क्रिय", "Inactive")}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        type="button"
                        disabled={!isSuperAdmin}
                        onClick={() => openRename(c)}
                        className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                      >
                        {t("नाव बदला", "Rename")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* System Info */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className="text-lg font-bold text-slate-800 mb-4">
          System Information
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <InfoItem label="Application" value="KRA Report System" />
          <InfoItem label="Version" value="1.0.0" />
          <InfoItem label="Department" value="जलसंपदा विभाग" />
          <InfoItem label="Organization" value="बांधकाम कामगार विभाग" />
        </div>
      </div>

      {/* Rename Corporation Modal */}
      {corpModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeRename}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
              <h3 className="text-xl font-bold text-white">
                {t("महामंडळ नाव बदला", "Rename Corporation")}
              </h3>
              <p className="text-indigo-100 text-sm mt-1">
                {editingCorp?.code
                  ? `${t("कोड", "Code")}: ${editingCorp.code}`
                  : ""}
              </p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  {t("नवीन नाव", "New Name")} *
                </label>
                <input
                  type="text"
                  value={corpName}
                  onChange={(e) => setCorpName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  disabled={!isSuperAdmin}
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3 justify-end">
              <button
                type="button"
                onClick={closeRename}
                disabled={saving}
                className="px-5 py-2.5 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-100 transition-all disabled:opacity-50"
              >
                {t("रद्द करा", "Cancel")}
              </button>
              <button
                type="button"
                onClick={saveRename}
                disabled={saving || !isSuperAdmin}
                className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold rounded-xl shadow-lg disabled:opacity-50"
              >
                {saving
                  ? t("जतन होत आहे...", "Saving...")
                  : t("जतन करा", "Save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// ENTRY MODAL (Create/Edit)
// ==========================================
function EntryModal({ entry, dropdownData, onClose, onSave, setError }) {
  const isEdit = !!entry;
  const { t, language } = useLanguage();
  const [formData, setFormData] = useState({
    corporation: entry?.corporation?._id || "",
    region: entry?.region?._id || "",
    circle: entry?.circle?._id || "",
    division: entry?.division?._id || "",
    kraYear: entry?.kraYear || "",
    achievementDate: entry?.achievementDate
      ? new Date(entry.achievementDate).toISOString().split("T")[0]
      : "",
    contactNumber: entry?.contactNumber || "",
    remarks: entry?.remarks || "",
  });

  const [kraRows, setKraRows] = useState(() => {
    const map = new Map(
      (Array.isArray(entry?.kras) ? entry.kras : []).map((k) => [k.kraId, k]),
    );

    return Array.from({ length: 7 }, (_, i) => {
      const kraId = i + 1;
      const existing = map.get(kraId);
      return {
        kraId,
        annualTarget:
          existing?.annualTarget === 0 || existing?.annualTarget
            ? String(existing.annualTarget)
            : "",
        kraAchievement:
          existing?.kraAchievement === 0 || existing?.kraAchievement
            ? String(existing.kraAchievement)
            : "",
      };
    });
  });
  const [saving, setSaving] = useState(false);
  const [filteredRegions, setFilteredRegions] = useState([]);
  const [filteredCircles, setFilteredCircles] = useState([]);
  const [divisions, setDivisions] = useState([]);

  const selectedCorporation = dropdownData?.corporations?.find(
    (c) => c._id === formData.corporation,
  );
  const needsRegionCircle = Boolean(selectedCorporation?.hasRegions);

  useEffect(() => {
    if (formData.corporation && dropdownData?.regions) {
      const regions = dropdownData.regions.filter(
        (r) => r.corporation?._id === formData.corporation,
      );
      setFilteredRegions(regions);
    } else {
      setFilteredRegions([]);
    }
  }, [formData.corporation, dropdownData]);

  useEffect(() => {
    if (formData.region && dropdownData?.circles) {
      const circles = dropdownData.circles.filter(
        (c) => c.region?._id === formData.region,
      );
      setFilteredCircles(circles);
    } else {
      setFilteredCircles([]);
    }
  }, [formData.region, dropdownData]);

  useEffect(() => {
    const fetchDivisions = async () => {
      if (!needsRegionCircle || !formData.circle) {
        setDivisions([]);
        return;
      }

      try {
        const res = await divisionApi.getByCircle(formData.circle);
        setDivisions(Array.isArray(res.data?.data) ? res.data.data : []);
      } catch (err) {
        setDivisions([]);
      }
    };

    fetchDivisions();
  }, [needsRegionCircle, formData.circle]);

  useEffect(() => {
    if (
      !needsRegionCircle &&
      (formData.region || formData.circle || formData.division)
    ) {
      setFormData((prev) => ({
        ...prev,
        region: "",
        circle: "",
        division: "",
      }));
    }
  }, [needsRegionCircle]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (name === "corporation") {
      setFormData((prev) => ({
        ...prev,
        region: "",
        circle: "",
        division: "",
      }));
    }
    if (name === "region") {
      setFormData((prev) => ({ ...prev, circle: "", division: "" }));
    }
    if (name === "circle") {
      setFormData((prev) => ({ ...prev, division: "" }));
    }
  };

  const handleKraRowChange = (kraId, field, value) => {
    setKraRows((prev) =>
      prev.map((row) =>
        row.kraId === kraId ? { ...row, [field]: value } : row,
      ),
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setSaving(true);
      if (
        needsRegionCircle &&
        (!formData.region || !formData.circle || !formData.division)
      ) {
        setError(
          t(
            "कृपया विभाग, वर्तुळ आणि Division निवडा",
            "Please select Region, Circle and Division",
          ),
        );
        return;
      }

      const payload = {
        ...formData,
        kras: kraRows.map((row) => ({
          kraId: row.kraId,
          annualTarget: Math.max(0, Number(row.annualTarget) || 0),
          kraAchievement: Math.max(0, Number(row.kraAchievement) || 0),
        })),
      };

      if (!payload.region) delete payload.region;
      if (!payload.circle) delete payload.circle;
      if (!payload.division) delete payload.division;

      if (isEdit) {
        await adminApi.updateEntry(entry._id, payload);
      } else {
        await adminApi.createEntry(payload);
      }

      onSave();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          `Failed to ${isEdit ? "update" : "create"} entry`,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-t-2xl flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">
            {isEdit
              ? t("✏️ नोंद संपादित करा", "✏️ Edit Entry")
              : t("➕ नवीन नोंद", "➕ New Entry")}
          </h2>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Corporation */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t("महामंडळ", "Corporation")} *
              </label>
              <select
                name="corporation"
                value={formData.corporation}
                onChange={handleChange}
                required
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">
                  {t("महामंडळ निवडा", "Select Corporation")}
                </option>
                {dropdownData?.corporations?.map((c) => (
                  <option key={c._id} value={c._id}>
                    {localizeName(c, language)} ({c.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Financial Year */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t("आर्थिक वर्ष", "Financial Year")} *
              </label>
              <select
                name="kraYear"
                value={formData.kraYear}
                onChange={handleChange}
                required
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">{t("वर्ष निवडा", "Select Year")}</option>
                {dropdownData?.financialYears?.map((y) => (
                  <option key={y._id} value={y.year}>
                    {y.year}
                  </option>
                ))}
              </select>
            </div>

            {/* Region */}
            {needsRegionCircle && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t("विभाग", "Region")} *
                </label>
                <select
                  name="region"
                  value={formData.region}
                  onChange={handleChange}
                  required
                  disabled={!formData.corporation}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">{t("विभाग निवडा", "Select Region")}</option>
                  {filteredRegions.map((r) => (
                    <option key={r._id} value={r._id}>
                      {localizeName(r, language)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Circle */}
            {needsRegionCircle && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t("वर्तुळ", "Circle")} *
                </label>
                <select
                  name="circle"
                  value={formData.circle}
                  onChange={handleChange}
                  required
                  disabled={!formData.region}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">{t("वर्तुळ निवडा", "Select Circle")}</option>
                  {filteredCircles.map((c) => (
                    <option key={c._id} value={c._id}>
                      {localizeName(c, language)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Division */}
            {needsRegionCircle && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  {t("Division", "Division")} *
                </label>
                <select
                  name="division"
                  value={formData.division}
                  onChange={handleChange}
                  required
                  disabled={!formData.circle}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">
                    {t("Division निवडा", "Select Division")}
                  </option>
                  {divisions.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Achievement Date */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t("तारीख", "Achievement Date")} *
              </label>
              <input
                type="date"
                name="achievementDate"
                value={formData.achievementDate}
                onChange={handleChange}
                required
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* KRA Table (All 7 KRAs) */}
            <div className="md:col-span-2">
              <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 bg-gradient-to-r from-slate-800 to-slate-700 text-white font-semibold">
                  {t("KRA मासिक सबमिशन", "KRA Monthly Submission")}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-white">
                      <tr className="text-left text-slate-600">
                        <th className="px-4 py-2">KRA</th>
                        <th className="px-4 py-2">{t("नाव", "Name")}</th>
                        <th className="px-4 py-2 text-right">
                          {t("वार्षिक लक्ष्य", "Annual Target")}
                        </th>
                        <th className="px-4 py-2 text-right">
                          {t("साध्य", "Achievement")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {kraRows.map((row) => {
                        const name =
                          dropdownData?.kras?.find(
                            (k) => k.kraNumber === row.kraId,
                          )?.name ||
                          entry?.kras?.find((k) => k.kraId === row.kraId)
                            ?.kraName ||
                          "";

                        return (
                          <tr key={row.kraId} className="hover:bg-slate-50">
                            <td className="px-4 py-2 font-semibold text-slate-800">
                              KRA {row.kraId}
                            </td>
                            <td className="px-4 py-2 text-slate-600">{name}</td>
                            <td className="px-4 py-2 text-right">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={row.annualTarget}
                                onChange={(e) =>
                                  handleKraRowChange(
                                    row.kraId,
                                    "annualTarget",
                                    e.target.value,
                                  )
                                }
                                className="w-28 px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 text-right"
                              />
                            </td>
                            <td className="px-4 py-2 text-right">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={row.kraAchievement}
                                onChange={(e) =>
                                  handleKraRowChange(
                                    row.kraId,
                                    "kraAchievement",
                                    e.target.value,
                                  )
                                }
                                className="w-28 px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 text-right"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 bg-white border-t border-slate-200 text-xs text-slate-500">
                  {t(
                    "टीप: न भरलेले KRA 0 म्हणून साठवले जातील.",
                    "Note: Unfilled KRAs will be stored as 0.",
                  )}
                </div>
              </div>
            </div>

            {/* Contact Number */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t("संपर्क क्रमांक", "Contact Number")} *
              </label>
              <input
                type="tel"
                name="contactNumber"
                value={formData.contactNumber}
                onChange={handleChange}
                required
                pattern="[6-9]\d{9}"
                placeholder={t("10 अंकी मोबाईल", "10-digit mobile")}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Remarks */}
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                {t("टिप्पणी", "Remarks")}
              </label>
              <textarea
                name="remarks"
                value={formData.remarks}
                onChange={handleChange}
                rows={3}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors"
            >
              {t("रद्द करा", "Cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition-all shadow-lg"
            >
              {saving
                ? t("जतन होत आहे...", "Saving...")
                : isEdit
                  ? t("अद्यतनित करा", "Update")
                  : t("तयार करा", "Create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// HELPER COMPONENTS
// ==========================================
function LoadingSpinner({ text = "Loading..." }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
      <p className="mt-4 text-slate-600 font-medium">{text}</p>
    </div>
  );
}

function StatCard({ icon, title, value, subtitle, trend, color }) {
  const colorClasses = {
    blue: "from-blue-500 to-blue-600",
    green: "from-green-500 to-emerald-600",
    purple: "from-purple-500 to-indigo-600",
    orange: "from-orange-500 to-amber-600",
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow">
      <div className={`bg-gradient-to-r ${colorClasses[color]} p-4`}>
        <span className="text-3xl">{icon}</span>
      </div>
      <div className="p-5">
        <p className="text-sm text-slate-500 font-medium">{title}</p>
        <p className="text-3xl font-bold text-slate-800 mt-1">{value}</p>
        <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
        {trend && <p className="text-xs text-green-600 mt-2">{trend}</p>}
      </div>
    </div>
  );
}

function InfoItem({ label, value }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className="text-slate-700 font-semibold mt-0.5">{value || "N/A"}</p>
    </div>
  );
}
