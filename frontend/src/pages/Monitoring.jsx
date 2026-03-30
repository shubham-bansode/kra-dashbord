import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { corporationApi, dashboardApi, kraEntryApi } from "../services/api";
import { generateKraYears } from "../utils/helpers";
import * as XLSX from "xlsx";
import { useLanguage } from "../i18n/LanguageContext";
import { useAuth } from "../auth/AuthContext";

function decodeJwtPayload(token) {
  try {
    const payload = String(token || "").split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(normalized);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function normalizeIdentity(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();
}

function Card({ title, titleMr, children }) {
  const { t } = useLanguage();
  const displayTitle = titleMr ? t(titleMr, title) : title;

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
      <div className="px-6 py-4 bg-gradient-to-r from-slate-800 to-slate-700">
        <h2 className="text-lg font-bold text-white">{displayTitle}</h2>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function formatNumber(value) {
  const num = Number(value) || 0;
  return num.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function sumNumberField(kras, key) {
  if (!Array.isArray(kras)) return 0;
  return kras.reduce((sum, item) => sum + (Number(item?.[key]) || 0), 0);
}

function getSelectedKraIds(entry) {
  if (!entry) return [];

  if (Array.isArray(entry.selectedKraIds) && entry.selectedKraIds.length > 0) {
    return entry.selectedKraIds
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id))
      .sort((a, b) => a - b);
  }

  const fromKras = Array.isArray(entry.kras)
    ? entry.kras
        .filter(
          (k) =>
            (Number(k?.annualTarget) || 0) > 0 ||
            (Number(k?.kraAchievement) || 0) > 0,
        )
        .map((k) => Number(k?.kraId))
        .filter((id) => Number.isFinite(id))
    : [];

  return [...new Set(fromKras)].sort((a, b) => a - b);
}

// Marathi month names for export
const MONTH_NAMES_MARATHI = {
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

// KRA ID to name mapping (Marathi names as in original Excel)
const KRA_NAMES = {
  1: "प्रकल्पाचे लाभक्षेत्रात प्रत्यक्ष सिंचन करणे (लक्ष हेक्टर)",
  2: "सिंचन व बिगर सिंचन पाणीपट्टी वसुली करणे (रुपये लक्ष)",
  3: "सन {year} मध्ये पूर्ण करावयाचे प्रकल्प (संख्या)",
  4: "सिंचन निर्मिती (हेक्टर)",
  5: "पाणीसाठा निर्मिती (दलघमी)",
  6: "पाणी वापर संस्थांना लाभक्षेत्र हस्तांतरण करणे (हेक्टर)",
  7: "अवशिष्ट मधील प्रकल्प पूर्ण करणे (संख्या)",
};

// Default weights for KRAs
const KRA_WEIGHTS = {
  1: 15,
  2: 15,
  3: 20,
  4: 15,
  5: 20,
  6: 10,
  7: 5,
};

function getKraName(kraId, kraYear) {
  const name = KRA_NAMES[kraId] || `KRA ${kraId}`;
  if (kraId === 3 && kraYear) {
    // Replace {year} with the actual year in Marathi format
    const yearParts = kraYear.split("-");
    const marathiYear = `२०${yearParts[1] || "25"}-${String(Number(yearParts[1] || 25) + 1).slice(-2)}`;
    return name.replace("{year}", marathiYear);
  }
  return name.replace("{year}", "२०२५-२६");
}

function formatDateForExcel(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  // Format: DD/MM/YYYY
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

// KRA options for filter dropdown
const KRA_OPTIONS = [
  { id: 1, name: "KRA 1 - प्रत्यक्ष सिंचन" },
  { id: 2, name: "KRA 2 - पाणीपट्टी वसुली" },
  { id: 3, name: "KRA 3 - प्रकल्प पूर्ण" },
  { id: 4, name: "KRA 4 - सिंचन निर्मिती" },
  { id: 5, name: "KRA 5 - पाणीसाठा निर्मिती" },
  { id: 6, name: "KRA 6 - लाभक्षेत्र हस्तांतरण" },
  { id: 7, name: "KRA 7 - अवशिष्ट प्रकल्प" },
];

export default function Monitoring() {
  const { t } = useLanguage();
  const { user, token } = useAuth();
  const tokenPayload = useMemo(() => decodeJwtPayload(token), [token]);

  const effectiveRole = user?.role || tokenPayload?.role || "user";
  const effectiveMobile =
    user?.mobileNumber || tokenPayload?.mobileNumber || "";
  const effectiveFullName = user?.fullName || "";

  const isPrivilegedUser =
    effectiveRole === "admin" || effectiveRole === "superadmin";
  const [corporations, setCorporations] = useState([]);
  const [filters, setFilters] = useState({
    corporation: "",
    kraYear: "",
    kra: "",
  });
  const [activeSection, setActiveSection] = useState("summary");
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const [summary, setSummary] = useState(null);
  const [byCorporation, setByCorporation] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const [myEntries, setMyEntries] = useState([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState("");
  const [entriesLastRefresh, setEntriesLastRefresh] = useState(new Date());
  const [entrySearch, setEntrySearch] = useState("");
  const [entryPage, setEntryPage] = useState(1);

  const kraYears = useMemo(() => generateKraYears(), []);

  useEffect(() => {
    const loadCorporations = async () => {
      try {
        const res = await corporationApi.getAll();
        setCorporations(res.data?.data || []);
      } catch (e) {
        // keep non-blocking
      }
    };

    loadCorporations();
  }, []);

  useEffect(() => {
    fetchMonitoringData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.corporation, filters.kraYear, filters.kra]);

  useEffect(() => {
    setEntryPage(1);
  }, [entrySearch, filters.corporation, filters.kraYear, filters.kra]);

  useEffect(() => {
    if (activeSection !== "entries") return;
    fetchMyEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeSection,
    filters.corporation,
    filters.kraYear,
    filters.kra,
    effectiveRole,
    effectiveMobile,
    effectiveFullName,
  ]);

  useEffect(() => {
    if (activeSection !== "entries") return;

    const timer = setInterval(() => {
      fetchMyEntries({ silent: true });
    }, 10000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeSection,
    filters.corporation,
    filters.kraYear,
    filters.kra,
    effectiveRole,
    effectiveMobile,
    effectiveFullName,
  ]);

  const fetchMonitoringData = async () => {
    setLoading(true);
    setError("");

    try {
      const params = { periodMode: "all" };
      if (filters.corporation) params.corporation = filters.corporation;
      if (filters.kraYear) params.kraYear = filters.kraYear;
      if (filters.kra) params.kra = filters.kra;

      const [summaryRes, corpRes] = await Promise.all([
        dashboardApi.getSummary(params),
        dashboardApi.getByCorporation(params),
      ]);

      setSummary(summaryRes.data?.data || {});
      setByCorporation(corpRes.data?.data || []);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e?.response?.data?.message || "Failed to load report data");
    } finally {
      setLoading(false);
    }
  };

  const fetchMyEntries = async ({ silent = false } = {}) => {
    if (!silent) setEntriesLoading(true);
    setEntriesError("");

    try {
      const params = {};
      if (filters.corporation) params.corporation = filters.corporation;
      if (filters.kraYear) params.kraYear = filters.kraYear;
      if (filters.kra) params.kra = filters.kra;

      const res = await kraEntryApi.getAll(params);
      const allEntries = Array.isArray(res.data?.data) ? res.data.data : [];

      const fullName = normalizeIdentity(effectiveFullName);
      const mobile = normalizeIdentity(effectiveMobile);

      const mine = allEntries.filter((entry) => {
        const submittedBy = normalizeIdentity(entry?.submittedBy);
        const contactNumber = normalizeIdentity(entry?.contactNumber);

        if (!submittedBy && !contactNumber) return false;
        return (
          (fullName && submittedBy.includes(fullName)) ||
          (mobile && submittedBy.includes(mobile)) ||
          (mobile && contactNumber.includes(mobile))
        );
      });

      setMyEntries(isPrivilegedUser ? allEntries : mine);
      setEntriesLastRefresh(new Date());
    } catch (e) {
      setEntriesError(
        e?.response?.data?.message || "Failed to load your entries",
      );
    } finally {
      if (!silent) setEntriesLoading(false);
    }
  };

  // Export all KRA entries to Excel in the original format
  const exportToExcel = async () => {
    setExporting(true);
    setError("");

    try {
      // Fetch all entries with current filters
      const params = {};
      if (filters.corporation) params.corporation = filters.corporation;
      if (filters.kraYear) params.kraYear = filters.kraYear;
      if (filters.kra) params.kra = filters.kra;

      const res = await kraEntryApi.getAll(params);
      const entries = res.data?.data || [];

      if (entries.length === 0) {
        setError(
          t(
            "निवडलेल्या फिल्टरसाठी निर्यात करण्यासाठी डेटा नाही.",
            "No data to export for selected filters.",
          ),
        );
        setExporting(false);
        return;
      }

      // Flatten entries: each KRA in a monthly doc becomes one row
      const rows = [];

      for (const entry of entries) {
        const corpName = entry.corporation?.name || "";
        const regionName = entry.region?.name || "";
        const circleName = entry.circle?.name || "";
        const divisionName = entry.division?.name || "";
        const kraYear = entry.kraYear || "";
        const achievementDate = formatDateForExcel(entry.achievementDate);
        const achievementMonth = entry.achievementMonth || 1;
        const achievementYear = entry.achievementYear || 2025;
        const contactNumber = entry.contactNumber || "";
        const remarks = entry.remarks || "";

        const krasArray = Array.isArray(entry.kras) ? entry.kras : [];

        for (const kra of krasArray) {
          const kraId = kra.kraId || 1;
          const annualTarget = Number(kra.annualTarget) || 0;
          const kraAchievement = Number(kra.kraAchievement) || 0;

          // Skip all-zero KRAs
          if (annualTarget === 0 && kraAchievement === 0) continue;

          const kraName = kra.kraName || getKraName(kraId, kraYear);
          const weight = KRA_WEIGHTS[kraId] || 0;
          const monthName = `${MONTH_NAMES_MARATHI[achievementMonth]} ${achievementYear}`;

          rows.push({
            "महामंडळ (Corporation)": corpName,
            Region_1: regionName,
            Circle: circleName,
            Division: divisionName,
            "फलनिष्पत्तीची  क्षेत्रे KRA": kraName,
            "फलनिष्पत्तीची  क्षेत्रे (KRA) वर्ष": kraYear,
            "KRA वार्षिक उद्दिष्ट": annualTarget,
            "KRA साध्य": kraAchievement,
            Weightage: weight,
            "KRA महिना": monthName,
            "महिन्याचे साध्य KRA ( तारीख)": achievementDate,
            "Contact Number ( Assistant SE )": contactNumber,
            "शेरा / अडचणी": remarks,
          });
        }
      }

      if (rows.length === 0) {
        setError(
          t(
            "निर्यात करण्यासाठी KRA डेटा आढळला नाही.",
            "No KRA data found to export.",
          ),
        );
        setExporting(false);
        return;
      }

      // Create workbook
      const worksheet = XLSX.utils.json_to_sheet(rows);

      // Set column widths for readability
      worksheet["!cols"] = [
        { wch: 30 }, // Corporation
        { wch: 30 }, // Region
        { wch: 25 }, // Circle
        { wch: 65 }, // Division
        { wch: 55 }, // KRA Name
        { wch: 15 }, // KRA Year
        { wch: 18 }, // Annual Target
        { wch: 12 }, // Achievement
        { wch: 10 }, // Weightage
        { wch: 18 }, // Month
        { wch: 15 }, // Date
        { wch: 15 }, // Contact
        { wch: 30 }, // Remarks
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Form Responses 1");

      // Generate filename
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `KRA_Report_Sheet_${dateStr}.xlsx`;

      // Download
      XLSX.writeFile(workbook, filename);
    } catch (e) {
      setError(e?.response?.data?.message || "Failed to export data.");
    } finally {
      setExporting(false);
    }
  };

  const resetFilters = () =>
    setFilters({ corporation: "", kraYear: "", kra: "" });

  const filteredMyEntries = useMemo(() => {
    const query = entrySearch.trim().toLowerCase();
    if (!query) return myEntries;

    return myEntries.filter((entry) => {
      const selectedIds = getSelectedKraIds(entry).join(",");
      return [
        entry?.corporation?.name,
        entry?.corporation?.code,
        entry?.kraYear,
        entry?.remarks,
        entry?.contactNumber,
        entry?.submittedBy,
        selectedIds,
      ]
        .map((v) => String(v || "").toLowerCase())
        .some((v) => v.includes(query));
    });
  }, [myEntries, entrySearch]);

  const PAGE_SIZE = 20;
  const totalEntryPages = Math.max(
    1,
    Math.ceil(filteredMyEntries.length / PAGE_SIZE),
  );

  const paginatedMyEntries = useMemo(() => {
    const safePage = Math.min(Math.max(entryPage, 1), totalEntryPages);
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredMyEntries.slice(start, start + PAGE_SIZE);
  }, [filteredMyEntries, entryPage, totalEntryPages]);

  useEffect(() => {
    if (entryPage > totalEntryPages) {
      setEntryPage(totalEntryPages);
    }
  }, [entryPage, totalEntryPages]);

  return (
    <div className="min-h-[calc(100vh-80px)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
          <div className="px-6 py-5 bg-gradient-to-r from-blue-700 to-indigo-700">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-extrabold text-white">
                  {t("अहवाल", "Report")}
                </h1>
                <p className="text-sm text-white/80 mt-1">
                  {t(
                    "KRA अहवाल सारांश, फिल्टर आणि जलद कृती.",
                    "KRA report summary, filters, and quick actions.",
                  )}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Link
                  to="/dashboard"
                  className="px-4 py-2 bg-white text-blue-700 font-semibold rounded-xl hover:bg-blue-50 transition-colors"
                >
                  📊 {t("डॅशबोर्ड उघडा", "Open Dashboard")}
                </Link>
                <Link
                  to="/data-entry"
                  className="px-4 py-2 bg-white/10 text-white font-semibold rounded-xl border border-white/30 hover:bg-white/15 transition-colors"
                >
                  📝 {t("डेटा एंट्री", "Data Entry")}
                </Link>
              </div>
            </div>
          </div>

          <div className="px-6 py-5">
            <div className="mb-4 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                onClick={() => setActiveSection("summary")}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  activeSection === "summary"
                    ? "bg-white text-indigo-700 shadow"
                    : "text-slate-600 hover:text-slate-800"
                }`}
              >
                {t("📊 अहवाल सारांश", "📊 Report Summary")}
              </button>
              <button
                onClick={() => setActiveSection("entries")}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  activeSection === "entries"
                    ? "bg-white text-indigo-700 shadow"
                    : "text-slate-600 hover:text-slate-800"
                }`}
              >
                {t("📝 सर्व नोंदी", "📝 All Entries")}
              </button>
            </div>

            <div className="flex flex-col lg:flex-row lg:items-end gap-4">
              <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    {t("महामंडळ", "Corporation")}
                  </label>
                  <select
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                    value={filters.corporation}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, corporation: e.target.value }))
                    }
                  >
                    <option value="">
                      {t("सर्व महामंडळे", "All Corporations")}
                    </option>
                    {corporations.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    {t("KRA वर्ष", "KRA Year")}
                  </label>
                  <select
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                    value={filters.kraYear}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, kraYear: e.target.value }))
                    }
                  >
                    <option value="">{t("सर्व वर्षे", "All Years")}</option>
                    {kraYears.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    {t("KRA", "KRA")}
                  </label>
                  <select
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                    value={filters.kra}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, kra: e.target.value }))
                    }
                  >
                    <option value="">{t("सर्व KRA", "All KRAs")}</option>
                    {KRA_OPTIONS.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={fetchMonitoringData}
                  className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg"
                >
                  🔄 {t("रिफ्रेश", "Refresh")}
                </button>
                <button
                  onClick={resetFilters}
                  className="px-4 py-2.5 border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  {t("क्लिअर", "Clear")}
                </button>
              </div>
            </div>

            <div className="mt-3 text-xs text-slate-500">
              Last updated: {lastRefresh.toLocaleTimeString("en-IN")} (manual)
            </div>

            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
                ❌ {error}
              </div>
            )}
          </div>
        </div>

        {activeSection === "summary" && (
          <>
            {/* Corporation-wise report */}
            <Card title="Corporation Report" titleMr="महामंडळ-वार अहवाल">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="text-sm text-slate-600">
                  {t(
                    "महामंडळानुसार नोंदी आणि कामगिरीचा जलद आढावा.",
                    "Quick view of entries and performance by corporation.",
                  )}
                </div>
                <button
                  onClick={exportToExcel}
                  disabled={exporting || loading}
                  className="px-4 py-2 bg-green-700 text-white rounded-xl hover:bg-green-800 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {exporting ? (
                    <>
                      <svg
                        className="animate-spin h-4 w-4"
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
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      {t("निर्यात करत आहे...", "Exporting...")}
                    </>
                  ) : (
                    <>📥 {t("एक्सेल निर्यात (XLSX)", "Export Excel (XLSX)")}</>
                  )}
                </button>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        {t("महामंडळ", "Corporation")}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        {t("नोंदी", "Entries")}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        {t("लक्ष्य", "Target")}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        {t("साध्य", "Achievement")}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        %
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td className="px-4 py-5 text-slate-500" colSpan={5}>
                          {t("लोड होत आहे...", "Loading...")}
                        </td>
                      </tr>
                    ) : byCorporation.length === 0 ? (
                      <tr>
                        <td className="px-4 py-5 text-slate-500" colSpan={5}>
                          {t(
                            "निवडलेल्या फिल्टरसाठी डेटा नाही.",
                            "No data for selected filters.",
                          )}
                        </td>
                      </tr>
                    ) : (
                      byCorporation.map((c) => {
                        const target = Number(c.totalTarget) || 0;
                        const achievement = Number(c.totalAchievement) || 0;
                        const pct =
                          target > 0 ? (achievement / target) * 100 : 0;

                        const pill =
                          pct >= 80
                            ? "bg-green-100 text-green-800"
                            : pct >= 50
                              ? "bg-amber-100 text-amber-800"
                              : "bg-red-100 text-red-800";

                        return (
                          <tr
                            key={c.corporationId || c._id}
                            className="hover:bg-slate-50"
                          >
                            <td className="px-4 py-3 font-semibold text-slate-800">
                              {c.corporationCode || c._id || "N/A"}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-700">
                              {(Number(c.count) || 0).toLocaleString("en-IN")}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-700">
                              {formatNumber(target)}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-700">
                              {formatNumber(achievement)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span
                                className={`px-2.5 py-1 rounded-full text-xs font-bold ${pill}`}
                              >
                                {pct.toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Report checklist */}
            <Card title="Report Checklist" titleMr="अहवाल चेकलिस्ट">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <h3 className="font-bold text-slate-800">Data Quality</h3>
                  <ul className="mt-2 text-sm text-slate-600 space-y-1">
                    <li>
                      • Ensure correct Corporation → Region → Circle selection.
                    </li>
                    <li>
                      • Select correct achievement date inside financial year.
                    </li>
                    <li>• Fill only the KRAs you want (others stay 0).</li>
                  </ul>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <h3 className="font-bold text-slate-800">Quick Actions</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link
                      to="/dashboard"
                      className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-semibold"
                    >
                      View Charts
                    </Link>
                    <Link
                      to="/data-entry"
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold"
                    >
                      Add Monthly Entry
                    </Link>
                    <Link
                      to="/admin"
                      className="px-3 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 text-sm font-semibold"
                    >
                      Admin Panel
                    </Link>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    Note: Admin Panel access depends on your role.
                  </p>
                </div>
              </div>
            </Card>
          </>
        )}

        {activeSection === "entries" && (
          <Card title="All Entries" titleMr="सर्व नोंदी">
            <div className="space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-600">
                    {isPrivilegedUser
                      ? t(
                          "सर्व नोंदींचे रिअल-टाइम दृश्य (ऑटो रिफ्रेश: 10 सेकंद)",
                          "Real-time view of all entries (auto-refresh: 10s)",
                        )
                      : t(
                          "तुमच्या नोंदींचे रिअल-टाइम दृश्य (ऑटो रिफ्रेश: 10 सेकंद)",
                          "Real-time view of your entries (auto-refresh: 10s)",
                        )}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {t("शेवटचे अपडेट:", "Last updated:")}{" "}
                    {entriesLastRefresh.toLocaleTimeString("en-IN")}
                  </p>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={entrySearch}
                    onChange={(e) => setEntrySearch(e.target.value)}
                    placeholder={t(
                      "शोधा (KRA, टिप्पणी, संपर्क)",
                      "Search (KRA, remarks, contact)",
                    )}
                    className="px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    onClick={() => fetchMyEntries()}
                    className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all"
                  >
                    🔄 {t("रिफ्रेश", "Refresh")}
                  </button>
                </div>
              </div>

              {entriesError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
                  ❌ {entriesError}
                </div>
              )}

              <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
                {entriesLoading ? (
                  <div className="p-6 text-slate-600">
                    {t("नोंदी लोड होत आहेत...", "Loading entries...")}
                  </div>
                ) : filteredMyEntries.length === 0 ? (
                  <div className="p-10 text-center">
                    <div className="text-5xl mb-3">📭</div>
                    <p className="text-slate-700 font-semibold">
                      {t("नोंदी आढळल्या नाहीत", "No entries found")}
                    </p>
                    <p className="text-slate-500 text-sm mt-1">
                      {t(
                        "फिल्टर/शोध बदलून पुन्हा प्रयत्न करा.",
                        "Try changing filters/search and refresh.",
                      )}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gradient-to-r from-slate-800 to-slate-700">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">
                              {t("महामंडळ", "Corporation")}
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">
                              {t("KRA", "KRA")}
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">
                              {t("वर्ष", "Year")}
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-white uppercase tracking-wider">
                              {t("लक्ष्य", "Target")}
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold text-white uppercase tracking-wider">
                              {t("साध्य", "Achievement")}
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">
                              {t("महिना/वर्ष", "Month/Year")}
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider">
                              {t("सबमिट केले", "Submitted By")}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {paginatedMyEntries.map((entry, idx) => {
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
                                className={`hover:bg-slate-50 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}`}
                              >
                                <td className="px-4 py-3">
                                  <span className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold">
                                    {entry?.corporation?.code ||
                                      entry?.corporationName ||
                                      "N/A"}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="max-w-[240px]">
                                    <p className="text-sm font-medium text-slate-700 truncate">
                                      {selectedIds.length > 0
                                        ? `KRAs: ${selectedIds.join(", ")}`
                                        : "KRAs: -"}
                                    </p>
                                    <p className="text-xs text-slate-400 truncate">
                                      {selectedIds.length > 0
                                        ? `${selectedIds.length} selected`
                                        : t("KRA मूल्य नाही", "No KRA values")}
                                    </p>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-slate-700">
                                  {entry.kraYear}
                                </td>
                                <td className="px-4 py-3 text-right font-medium text-slate-700">
                                  {totalTarget.toLocaleString("en-IN")}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded-lg font-bold">
                                    {totalAchievement.toLocaleString("en-IN")}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-slate-600">
                                  {MONTH_NAMES_MARATHI[
                                    entry?.achievementMonth
                                  ] || entry?.achievementMonth}{" "}
                                  {entry?.achievementYear}
                                </td>
                                <td className="px-4 py-3 text-slate-600">
                                  <p className="text-sm">
                                    {entry.submittedBy || "-"}
                                  </p>
                                  <p className="text-xs text-slate-400">
                                    {entry?.createdAt
                                      ? new Date(
                                          entry.createdAt,
                                        ).toLocaleDateString("en-IN")
                                      : "-"}
                                  </p>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                      <p className="text-sm text-slate-600">
                        {t("दाखवत आहे", "Showing")}{" "}
                        <strong>{paginatedMyEntries.length}</strong>{" "}
                        {t("पैकी", "of")}{" "}
                        <strong>{filteredMyEntries.length}</strong>{" "}
                        {t("नोंदी", "entries")}
                      </p>

                      <div className="flex gap-2">
                        <button
                          disabled={entryPage === 1}
                          onClick={() =>
                            setEntryPage((p) => Math.max(1, p - 1))
                          }
                          className="px-3 py-1.5 border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          ← {t("मागे", "Prev")}
                        </button>
                        <span className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold">
                          {entryPage} / {totalEntryPages}
                        </span>
                        <button
                          disabled={entryPage === totalEntryPages}
                          onClick={() =>
                            setEntryPage((p) =>
                              Math.min(totalEntryPages, p + 1),
                            )
                          }
                          className="px-3 py-1.5 border border-slate-300 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {t("पुढे", "Next")} →
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
