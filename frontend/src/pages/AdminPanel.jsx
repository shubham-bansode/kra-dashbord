import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { adminApi } from "../services/api";

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
  { id: "settings", label: "Settings", labelMr: "सेटिंग्ज", icon: "⚙️" },
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
              <h3 className="text-xl font-bold text-white">{title}</h3>
              {titleMr && <p className="text-sm text-white/80">{titleMr}</p>}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
            <p className="text-slate-700 leading-relaxed">{message}</p>
            {messageMr && (
              <p className="text-slate-500 text-sm mt-2 pt-2 border-t border-slate-200">
                {messageMr}
              </p>
            )}
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
            <span>{cancelText}</span>
            <span className="text-slate-400 text-sm">| {cancelTextMr}</span>
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
                <span>Processing...</span>
              </>
            ) : (
              <>
                <span>✓</span>
                <span>{confirmText}</span>
                <span className="text-white/70 text-sm">| {confirmTextMr}</span>
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
          <h3 className="text-xl font-bold text-white mb-1">{title}</h3>
          {titleMr && <p className="text-white/80 text-sm mb-2">{titleMr}</p>}
          {message && <p className="text-white/90 text-sm">{message}</p>}
          {messageMr && (
            <p className="text-white/70 text-xs mt-1">{messageMr}</p>
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
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const isSuperAdmin = user?.role === "superadmin";

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
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-12 text-center max-w-md">
          <div className="text-6xl mb-6">🔒</div>
          <h1 className="text-3xl font-bold text-red-600 mb-4">
            Access Denied
          </h1>
          <p className="text-xl text-gray-600 mb-2">प्रवेश नाकारला</p>
          <p className="text-lg text-gray-500 mb-8">Admin access required.</p>
          <a
            href="/"
            className="inline-block px-8 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold rounded-lg"
          >
            Go Back Home
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
                <p className="text-xs text-slate-400">व्यवस्थापन पॅनेल</p>
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
                  <p className="font-medium text-sm">{item.label}</p>
                  <p className="text-xs opacity-70">{item.labelMr}</p>
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
            {!sidebarCollapsed && <span className="text-sm">Back to Home</span>}
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
                {SIDEBAR_ITEMS.find((i) => i.id === activeSection)?.label}
              </h2>
              <p className="text-sm text-slate-500">
                {SIDEBAR_ITEMS.find((i) => i.id === activeSection)?.labelMr}
              </p>
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
            <EntriesSection setError={setError} setSuccess={setSuccess} />
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
          {activeSection === "settings" && <SettingsSection />}
        </div>
      </main>
    </div>
  );
}

// ==========================================
// DASHBOARD SECTION
// ==========================================
function DashboardSection({ setError }) {
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

  if (loading && !stats) return <LoadingSpinner text="Loading dashboard..." />;

  return (
    <div className="space-y-6">
      {/* Header with Refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">
            Dashboard Overview
          </h2>
          <p className="text-sm text-slate-500">
            Last updated: {lastRefresh.toLocaleTimeString("en-IN")} (Manual
            refresh)
          </p>
        </div>
        <button
          onClick={() => {
            fetchDashboardData();
            setLastRefresh(new Date());
          }}
          className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all flex items-center gap-2 shadow-lg"
        >
          🔄 Refresh Now
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          icon="📝"
          title="Total Entries"
          value={stats?.totalEntries || 0}
          subtitle="एकूण नोंदी"
          trend="+12% this month"
          color="blue"
        />
        <StatCard
          icon="👥"
          title="Active Users"
          value={stats?.totalUsers || 0}
          subtitle="सक्रिय वापरकर्ते"
          trend="Active this week"
          color="green"
        />
        <StatCard
          icon="🏢"
          title="Corporations"
          value={stats?.totalCorporations || 0}
          subtitle="महामंडळे"
          trend="All active"
          color="purple"
        />
        <StatCard
          icon="📅"
          title="Financial Year"
          value={stats?.activeFinancialYear || "N/A"}
          subtitle="सक्रिय आर्थिक वर्ष"
          trend="Current"
          color="orange"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Trend Chart */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-4">
            📈 Monthly Entry Trend | मासिक प्रवृत्ती
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
                      {MONTHS_EN[item._id.month]} {item._id.year}
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
            <p className="text-slate-500 text-center py-8">No data available</p>
          )}
        </div>

        {/* Corporation-wise Distribution */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-4">
            🏢 Corporation Distribution | महामंडळ वितरण
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
                        {corp._id || "Unknown"}
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
            <p className="text-slate-500 text-center py-8">No data available</p>
          )}
        </div>
      </div>

      {/* Recent Entries Table */}
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-slate-800 to-slate-700 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">
            📝 Recent Entries | अलीकडील नोंदी
          </h3>
          <span className="text-sm text-slate-300">Last 10 entries</span>
        </div>
        {recentEntries.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Corporation
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    KRA
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Year
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Target
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Achievement
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    User
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
function EntriesSection({ setError, setSuccess }) {
  const [entries, setEntries] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    corporation: "",
    kraYear: "",
    search: "",
    kra: "",
  });
  const [dropdownData, setDropdownData] = useState(null);
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
        "Are you sure you want to delete this entry? | ही नोंद हटवायची आहे का?",
      )
    )
      return;

    try {
      await adminApi.deleteEntry(id);
      setSuccess("Entry deleted successfully | नोंद यशस्वीरित्या हटवली");
      fetchEntries();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete entry");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedEntries.length === 0) return;
    if (
      !window.confirm(
        `Delete ${selectedEntries.length} entries? | ${selectedEntries.length} नोंदी हटवायच्या आहेत का?`,
      )
    )
      return;

    try {
      await adminApi.bulkDeleteEntries(selectedEntries);
      setSuccess(`${selectedEntries.length} entries deleted successfully`);
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
    setFilters({ corporation: "", kraYear: "", search: "", kra: "" });
    setPagination((p) => ({ ...p, page: 1 }));
  };

  return (
    <div className="space-y-6">
      {/* Header with Refresh Info */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">
            All Entries | सर्व नोंदी
          </h2>
          <p className="text-sm text-slate-500">
            Last updated: {lastRefresh.toLocaleTimeString("en-IN")}{" "}
            (Auto-refresh: 10s)
          </p>
        </div>
        <button
          onClick={() => {
            fetchEntries();
            setLastRefresh(new Date());
          }}
          className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all flex items-center gap-2 shadow-lg"
        >
          🔄 Refresh Now
        </button>
      </div>

      {/* Filters Card */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <div className="flex flex-wrap gap-4 items-end">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Search | शोधा
            </label>
            <input
              type="text"
              placeholder="Search by contact, remarks..."
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
              Corporation | महामंडळ
            </label>
            <select
              value={filters.corporation}
              onChange={(e) =>
                setFilters((f) => ({ ...f, corporation: e.target.value }))
              }
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Corporations</option>
              {dropdownData?.corporations?.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Year Filter */}
          <div className="w-40">
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Year | वर्ष
            </label>
            <select
              value={filters.kraYear}
              onChange={(e) =>
                setFilters((f) => ({ ...f, kraYear: e.target.value }))
              }
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Years</option>
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
              KRA
            </label>
            <select
              value={filters.kra}
              onChange={(e) =>
                setFilters((f) => ({ ...f, kra: e.target.value }))
              }
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All KRAs</option>
              {dropdownData?.kras?.map((k) => (
                <option key={k._id} value={k._id}>
                  KRA {k.kraNumber}
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
              Clear
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg shadow-indigo-200"
            >
              ➕ Add Entry
            </button>
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedEntries.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between">
            <span className="text-sm text-slate-600">
              <strong>{selectedEntries.length}</strong> entries selected
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
              "Entry updated successfully | नोंद यशस्वीरित्या अद्यतनित केली",
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
            setSuccess("Entry created successfully | नवीन नोंद तयार केली");
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
function ViewEntryModal({ entry, onClose }) {
  const totalTarget = sumNumberField(entry?.kras, "annualTarget");
  const totalAchievement = sumNumberField(entry?.kras, "kraAchievement");
  const selectedIds = getSelectedKraIds(entry);

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
            📋 Entry Details | नोंद तपशील
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
              label="Corporation | महामंडळ"
              value={entry.corporation?.name}
            />
            <InfoItem label="Year | वर्ष" value={entry.kraYear} />
            <InfoItem
              label="Region | विभाग"
              value={entry.region?.name || "N/A"}
            />
            <InfoItem
              label="Circle | वर्तुळ"
              value={entry.circle?.name || "N/A"}
            />
          </div>

          {/* KRA Info */}
          <div className="bg-indigo-50 rounded-xl p-4">
            <h4 className="font-semibold text-indigo-800 mb-2">KRA Details</h4>
            <p className="text-indigo-700 text-sm">
              Selected KRAs:{" "}
              {selectedIds.length > 0 ? selectedIds.join(", ") : "None"}
            </p>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-indigo-800">
                    <th className="py-2 pr-3">KRA</th>
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 text-right">Target</th>
                    <th className="py-2 text-right">Achievement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-indigo-100">
                  {(Array.isArray(entry.kras) ? entry.kras : []).map((k) => (
                    <tr key={k.kraId}>
                      <td className="py-2 pr-3 font-semibold text-indigo-800">
                        KRA {k.kraId}
                      </td>
                      <td className="py-2 pr-3 text-indigo-700">{k.kraName}</td>
                      <td className="py-2 text-right text-indigo-700">
                        {(Number(k.annualTarget) || 0).toLocaleString()}
                      </td>
                      <td className="py-2 text-right text-indigo-700">
                        {(Number(k.kraAchievement) || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Achievement Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 rounded-xl p-4 text-center">
              <p className="text-sm text-blue-600 mb-1">
                Annual Target | वार्षिक लक्ष्य
              </p>
              <p className="text-3xl font-bold text-blue-700">
                {totalTarget.toLocaleString()}
              </p>
            </div>
            <div className="bg-green-50 rounded-xl p-4 text-center">
              <p className="text-sm text-green-600 mb-1">
                Achievement | उपलब्धी
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
                Remarks | टिप्पणी
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
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchUsers();
  }, [pagination.page, search]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const params = { page: pagination.page, limit: 15 };
      if (search) params.search = search;

      const { data } = await adminApi.getUsers(params);
      setUsers(data.data.users);
      setPagination(data.data.pagination);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (id) => {
    try {
      const { data } = await adminApi.toggleUserStatus(id);
      setSuccess(
        `User ${data.data.isActive ? "activated" : "deactivated"} successfully`,
      );
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update user");
    }
  };

  const handleRoleChange = async (id, newRole) => {
    if (!window.confirm(`Change user role to ${newRole}?`)) return;

    try {
      await adminApi.updateUserRole(id, newRole);
      setSuccess("User role updated successfully");
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update role");
    }
  };

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <div className="flex items-center gap-4">
          <div className="flex-1 max-w-md">
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Search Users | वापरकर्ते शोधा
            </label>
            <input
              type="text"
              placeholder="Search by name or mobile..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500">Total Users</p>
            <p className="text-2xl font-bold text-slate-700">
              {pagination.total}
            </p>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        {loading ? (
          <LoadingSpinner text="Loading users..." />
        ) : users.length === 0 ? (
          <div className="p-16 text-center">
            <div className="text-6xl mb-4">👥</div>
            <h3 className="text-xl font-semibold text-slate-700 mb-2">
              No Users Found
            </h3>
            <p className="text-slate-500">कोणताही वापरकर्ता आढळला नाही</p>
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
                              {u.email || "No email"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {u.mobileNumber}
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-sm">
                          {u.corporation?.name || "N/A"}
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
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                            <option value="superadmin">Superadmin</option>
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
    </div>
  );
}

// ==========================================
// YEARS SECTION
// ==========================================
function YearsSection({ setError, setSuccess }) {
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
            "Financial year deactivated & locked | आर्थिक वर्ष निष्क्रिय आणि लॉक केले",
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
          setSuccess("Financial year deleted | आर्थिक वर्ष हटवले");
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

  if (loading) return <LoadingSpinner text="Loading financial years..." />;

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
          ➕ Add New Financial Year | नवीन आर्थिक वर्ष
        </h2>
        <form onSubmit={handleCreate} className="flex gap-4 items-end">
          <div className="flex-1 max-w-xs">
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Year Format: YYYY-YY
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
            {creating ? "Creating..." : "Add Year"}
          </button>
        </form>
      </div>

      {/* Years List */}
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-slate-800 to-slate-700">
          <h2 className="text-lg font-bold text-white">
            📅 Financial Years | आर्थिक वर्षे
          </h2>
        </div>

        {years.length === 0 ? (
          <div className="p-16 text-center">
            <div className="text-6xl mb-4">📅</div>
            <h3 className="text-xl font-semibold text-slate-700 mb-2">
              No Financial Years
            </h3>
            <p className="text-slate-500">
              Add your first financial year above
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
                          ✓ ACTIVE
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-slate-400 text-white text-xs rounded-full font-semibold">
                          🔒 INACTIVE
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
                      ⏸️ Deactivate
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSetActive(year._id)}
                      className="px-4 py-2 bg-green-600 text-white text-sm rounded-xl hover:bg-green-700 transition-colors"
                    >
                      ✅ Set Active
                    </button>
                  )}
                  {!year.isActive && (
                    <button
                      onClick={() => handleDelete(year._id)}
                      className="px-4 py-2 bg-red-100 text-red-700 text-sm rounded-xl hover:bg-red-200 transition-colors"
                    >
                      🗑️ Delete
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
          ℹ️ About Financial Years | आर्थिक वर्षांबद्दल
        </h3>
        <ul className="text-sm text-blue-700 space-y-2">
          <li>
            • <strong>Only One Active Year:</strong> Only one financial year can
            be active at a time. When you activate a new year, the previous
            active year is automatically deactivated and locked.
          </li>
          <li>
            • <strong>Active Year (सक्रिय वर्ष):</strong> Users can only submit
            entries for the active year. The active year is automatically
            unlocked.
          </li>
          <li>
            • <strong>Inactive Year (निष्क्रिय वर्ष):</strong> Inactive years
            are automatically locked. No entries can be made.
          </li>
          <li>
            • <strong>Delete (हटवा):</strong> Only inactive years with no
            entries can be deleted.
          </li>
        </ul>
      </div>
    </div>
  );
}

// ==========================================
// SETTINGS SECTION
// ==========================================
function SettingsSection() {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="text-6xl mb-6">⚙️</div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Settings</h2>
        <p className="text-slate-500 mb-4">सेटिंग्ज पृष्ठ लवकरच येत आहे</p>
        <p className="text-slate-400">Coming Soon</p>
      </div>

      {/* System Info */}
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className="text-lg font-bold text-slate-800 mb-4">
          System Information
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <InfoItem label="Application" value="KRA Monitoring System" />
          <InfoItem label="Version" value="1.0.0" />
          <InfoItem label="Department" value="जलसंपदा विभाग" />
          <InfoItem label="Organization" value="बांधकाम कामगार विभाग" />
        </div>
      </div>
    </div>
  );
}

// ==========================================
// ENTRY MODAL (Create/Edit)
// ==========================================
function EntryModal({ entry, dropdownData, onClose, onSave, setError }) {
  const isEdit = !!entry;
  const [formData, setFormData] = useState({
    corporation: entry?.corporation?._id || "",
    region: entry?.region?._id || "",
    circle: entry?.circle?._id || "",
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
    if (!needsRegionCircle && (formData.region || formData.circle)) {
      setFormData((prev) => ({ ...prev, region: "", circle: "" }));
    }
  }, [needsRegionCircle]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (name === "corporation") {
      setFormData((prev) => ({ ...prev, region: "", circle: "" }));
    }
    if (name === "region") {
      setFormData((prev) => ({ ...prev, circle: "" }));
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
      if (needsRegionCircle && (!formData.region || !formData.circle)) {
        setError("Please select Region and Circle");
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
              ? "✏️ Edit Entry | नोंद संपादित करा"
              : "➕ New Entry | नवीन नोंद"}
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
                Corporation | महामंडळ *
              </label>
              <select
                name="corporation"
                value={formData.corporation}
                onChange={handleChange}
                required
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select Corporation</option>
                {dropdownData?.corporations?.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Financial Year */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Financial Year | आर्थिक वर्ष *
              </label>
              <select
                name="kraYear"
                value={formData.kraYear}
                onChange={handleChange}
                required
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select Year</option>
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
                  Region | विभाग *
                </label>
                <select
                  name="region"
                  value={formData.region}
                  onChange={handleChange}
                  required
                  disabled={!formData.corporation}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select Region</option>
                  {filteredRegions.map((r) => (
                    <option key={r._id} value={r._id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Circle */}
            {needsRegionCircle && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Circle | वर्तुळ *
                </label>
                <select
                  name="circle"
                  value={formData.circle}
                  onChange={handleChange}
                  required
                  disabled={!formData.region}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select Circle</option>
                  {filteredCircles.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Achievement Date */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Achievement Date | तारीख *
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
                  KRA Monthly Submission | 7 KRA Entry
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-white">
                      <tr className="text-left text-slate-600">
                        <th className="px-4 py-2">KRA</th>
                        <th className="px-4 py-2">Name</th>
                        <th className="px-4 py-2 text-right">Annual Target</th>
                        <th className="px-4 py-2 text-right">Achievement</th>
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
                  Note: Unfilled KRAs will be stored as 0.
                </div>
              </div>
            </div>

            {/* Contact Number */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Contact Number | संपर्क क्रमांक *
              </label>
              <input
                type="tel"
                name="contactNumber"
                value={formData.contactNumber}
                onChange={handleChange}
                required
                pattern="[6-9]\d{9}"
                placeholder="10-digit mobile"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Remarks */}
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Remarks | टिप्पणी
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
              Cancel | रद्द करा
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition-all shadow-lg"
            >
              {saving
                ? "Saving..."
                : isEdit
                  ? "Update | अद्यतनित करा"
                  : "Create | तयार करा"}
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
