import { useEffect, useMemo, useState } from "react";
import {
  circleApi,
  corporationApi,
  divisionApi,
  kraApi,
  kraEntryApi,
  regionApi,
} from "../services/api";
import { generateKraYears } from "../utils/helpers";
import { useLanguage } from "../i18n/LanguageContext";
import { useAuth } from "../auth/AuthContext";
import { localizeName } from "../utils/localize";

const DEFAULT_KRA_OPTIONS = [
  { id: 1, name: "KRA 1 - प्रत्यक्ष सिंचन" },
  { id: 2, name: "KRA 2 - पाणीपट्टी वसुली" },
  { id: 3, name: "KRA 3 - प्रकल्प पूर्ण" },
  { id: 4, name: "KRA 4 - सिंचन निर्मिती" },
  { id: 5, name: "KRA 5 - पाणीसाठा निर्मिती" },
  { id: 6, name: "KRA 6 - लाभक्षेत्र हस्तांतरण" },
  { id: 7, name: "KRA 7 - अवशिष्ट प्रकल्प" },
];

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

const sumNumberField = (kras, key) => {
  if (!Array.isArray(kras)) return 0;
  return kras.reduce((sum, item) => sum + (Number(item?.[key]) || 0), 0);
};

const getSelectedKraIds = (entry) => {
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

const mapKraDocToOption = (kraDoc) => {
  const number =
    Number(kraDoc?.kraNumber) || Number(kraDoc?.sortOrder) || undefined;
  const id = Number.isFinite(number) ? number : undefined;

  const mrName = String(kraDoc?.name || "").trim();
  const enName = String(kraDoc?.nameEnglish || "").trim();
  const displayName = mrName || enName || "KRA";

  return {
    id,
    name: id ? `KRA ${id} - ${displayName}` : displayName,
  };
};

function InfoItem({ label, value }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="text-sm font-semibold text-slate-800 mt-1 break-words">
        {value || "-"}
      </p>
    </div>
  );
}

export default function Monitoring() {
  const { t, language } = useLanguage();
  const { user, token } = useAuth();

  const tokenPayload = useMemo(() => decodeJwtPayload(token), [token]);
  const effectiveMobile =
    user?.mobileNumber || tokenPayload?.mobileNumber || "";
  const effectiveFullName = user?.fullName || "";

  const [corporations, setCorporations] = useState([]);
  const [regions, setRegions] = useState([]);
  const [circles, setCircles] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [kraOptions, setKraOptions] = useState(DEFAULT_KRA_OPTIONS);

  const [filters, setFilters] = useState({
    corporation: "",
    region: "",
    circle: "",
    division: "",
    kraYear: "",
    kra: "",
    search: "",
  });

  const [scopeMode, setScopeMode] = useState("my-desk");
  const [entries, setEntries] = useState([]);
  const [viewingEntry, setViewingEntry] = useState(null);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState("");
  const [entriesLastRefresh, setEntriesLastRefresh] = useState(new Date());
  const [entryPage, setEntryPage] = useState(1);

  const kraYears = useMemo(() => generateKraYears(), []);

  useEffect(() => {
    const loadMasters = async () => {
      try {
        const [corpRes, kraRes] = await Promise.all([
          corporationApi.getAll(),
          kraApi.getAll(),
        ]);

        setCorporations(
          Array.isArray(corpRes?.data?.data) ? corpRes.data.data : [],
        );

        const data = Array.isArray(kraRes?.data?.data) ? kraRes.data.data : [];
        const options = data
          .map(mapKraDocToOption)
          .filter((o) => Number.isFinite(Number(o.id)))
          .sort((a, b) => Number(a.id) - Number(b.id));

        setKraOptions(options.length > 0 ? options : DEFAULT_KRA_OPTIONS);
      } catch {
        setKraOptions(DEFAULT_KRA_OPTIONS);
      }
    };

    loadMasters();
  }, []);

  useEffect(() => {
    const loadRegions = async () => {
      if (!filters.corporation) {
        setRegions([]);
        setCircles([]);
        setDivisions([]);
        return;
      }
      try {
        const res = await regionApi.getByCorporation(filters.corporation);
        setRegions(Array.isArray(res?.data?.data) ? res.data.data : []);
      } catch {
        setRegions([]);
      }
    };

    loadRegions();
  }, [filters.corporation]);

  useEffect(() => {
    const loadCircles = async () => {
      if (!filters.region) {
        setCircles([]);
        setDivisions([]);
        return;
      }
      try {
        const res = await circleApi.getByRegion(filters.region);
        setCircles(Array.isArray(res?.data?.data) ? res.data.data : []);
      } catch {
        setCircles([]);
      }
    };

    loadCircles();
  }, [filters.region]);

  useEffect(() => {
    const loadDivisions = async () => {
      if (!filters.circle) {
        setDivisions([]);
        return;
      }
      try {
        const res = await divisionApi.getByCircle(filters.circle);
        setDivisions(Array.isArray(res?.data?.data) ? res.data.data : []);
      } catch {
        setDivisions([]);
      }
    };

    loadDivisions();
  }, [filters.circle]);

  useEffect(() => {
    fetchEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.corporation,
    filters.region,
    filters.circle,
    filters.division,
    filters.kraYear,
    filters.kra,
  ]);

  const fetchEntries = async ({ silent = false } = {}) => {
    if (!silent) setEntriesLoading(true);
    setEntriesError("");

    try {
      const params = {};
      if (filters.corporation) params.corporation = filters.corporation;
      if (filters.region) params.region = filters.region;
      if (filters.circle) params.circle = filters.circle;
      if (filters.division) params.division = filters.division;
      if (filters.kraYear) params.kraYear = filters.kraYear;
      if (filters.kra) params.kra = filters.kra;

      const res = await kraEntryApi.getAll(params);
      const allEntries = Array.isArray(res?.data?.data) ? res.data.data : [];

      setEntries(allEntries);
      setEntriesLastRefresh(new Date());
    } catch (e) {
      setEntriesError(e?.response?.data?.message || "Failed to load entries");
    } finally {
      if (!silent) setEntriesLoading(false);
    }
  };

  const myEntries = useMemo(() => {
    const fullName = normalizeIdentity(effectiveFullName);
    const mobile = normalizeIdentity(effectiveMobile);

    return entries.filter((entry) => {
      const submittedBy = normalizeIdentity(entry?.submittedBy);
      const contactNumber = normalizeIdentity(entry?.contactNumber);

      if (!submittedBy && !contactNumber) return false;
      return (
        (fullName && submittedBy.includes(fullName)) ||
        (mobile && submittedBy.includes(mobile)) ||
        (mobile && contactNumber.includes(mobile))
      );
    });
  }, [entries, effectiveFullName, effectiveMobile]);

  const scopedEntries = useMemo(
    () => (scopeMode === "team-stream" ? entries : myEntries),
    [scopeMode, entries, myEntries],
  );

  const searchFilteredEntries = useMemo(() => {
    const query = String(filters.search || "")
      .trim()
      .toLowerCase();
    if (!query) return scopedEntries;

    return scopedEntries.filter((entry) => {
      const selectedIds = getSelectedKraIds(entry).join(",");
      return [
        entry?.corporation?.name,
        entry?.corporation?.code,
        entry?.region?.name,
        entry?.circle?.name,
        entry?.division?.name,
        entry?.kraYear,
        entry?.remarks,
        entry?.contactNumber,
        entry?.submittedBy,
        selectedIds,
      ]
        .map((v) => String(v || "").toLowerCase())
        .some((v) => v.includes(query));
    });
  }, [scopedEntries, filters.search]);

  const PAGE_SIZE = 20;
  const totalEntryPages = Math.max(
    1,
    Math.ceil(searchFilteredEntries.length / PAGE_SIZE),
  );

  const paginatedEntries = useMemo(() => {
    const safePage = Math.min(Math.max(entryPage, 1), totalEntryPages);
    const start = (safePage - 1) * PAGE_SIZE;
    return searchFilteredEntries.slice(start, start + PAGE_SIZE);
  }, [searchFilteredEntries, entryPage, totalEntryPages]);

  useEffect(() => {
    setEntryPage(1);
  }, [filters.search, scopeMode]);

  useEffect(() => {
    if (entryPage > totalEntryPages) {
      setEntryPage(totalEntryPages);
    }
  }, [entryPage, totalEntryPages]);

  const clearFilters = () => {
    setFilters({
      corporation: "",
      region: "",
      circle: "",
      division: "",
      kraYear: "",
      kra: "",
      search: "",
    });
    setEntryPage(1);
  };

  return (
    <div className="min-h-[calc(100vh-80px)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
          <div className="px-6 py-5 bg-gradient-to-r from-blue-700 to-indigo-700">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-extrabold text-white">
                  {t("अहवाल", "Report")}
                </h1>
                <p className="text-sm text-white/80 mt-1">
                  {t(
                    "प्रकल्प अहवालासाठी नोंदींचे एकत्रित दृश्य.",
                    "Unified entries view for the project report section.",
                  )}
                </p>
              </div>
              <button
                onClick={() => fetchEntries()}
                className="px-4 py-2 bg-white text-indigo-800 font-semibold rounded-xl hover:bg-indigo-50 transition-colors"
              >
                🔄 {t("आत्ता रिफ्रेश करा", "Refresh Now")}
              </button>
            </div>
          </div>

          <div className="px-6 py-5">
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={() => setScopeMode("my-desk")}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                  scopeMode === "my-desk"
                    ? "bg-indigo-600 text-white shadow"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {t("🧾 माझे डेस्क", "🧾 My Desk")}
              </button>
              <button
                onClick={() => setScopeMode("team-stream")}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                  scopeMode === "team-stream"
                    ? "bg-indigo-600 text-white shadow"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {t("🌐 टीम स्ट्रीम", "🌐 Team Stream")}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  {t("शोधा", "Search")}
                </label>
                <input
                  type="text"
                  placeholder={t(
                    "KRA, टिप्पणी, संपर्क...",
                    "KRA, remarks, contact...",
                  )}
                  value={filters.search}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, search: e.target.value }))
                  }
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  {t("महामंडळ", "Corporation")}
                </label>
                <select
                  value={filters.corporation}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      corporation: e.target.value,
                      region: "",
                      circle: "",
                      division: "",
                    }))
                  }
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">
                    {t("सर्व महामंडळे", "All Corporations")}
                  </option>
                  {corporations.map((c) => (
                    <option key={c._id} value={c._id}>
                      {localizeName(c, language)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  {t("प्रदेश", "Region")}
                </label>
                <select
                  value={filters.region}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      region: e.target.value,
                      circle: "",
                      division: "",
                    }))
                  }
                  disabled={!filters.corporation}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100"
                >
                  <option value="">{t("सर्व प्रदेश", "All Regions")}</option>
                  {regions.map((r) => (
                    <option key={r._id} value={r._id}>
                      {localizeName(r, language)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  {t("मंडळ", "Circle")}
                </label>
                <select
                  value={filters.circle}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      circle: e.target.value,
                      division: "",
                    }))
                  }
                  disabled={!filters.region}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100"
                >
                  <option value="">{t("सर्व मंडळे", "All Circles")}</option>
                  {circles.map((c) => (
                    <option key={c._id} value={c._id}>
                      {localizeName(c, language)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  {t("विभाग", "Division")}
                </label>
                <select
                  value={filters.division}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      division: e.target.value,
                    }))
                  }
                  disabled={!filters.circle}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100"
                >
                  <option value="">{t("सर्व विभाग", "All Divisions")}</option>
                  {divisions.map((d) => (
                    <option key={d._id} value={d._id}>
                      {localizeName(d, language)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  {t("KRA वर्ष", "KRA Year")}
                </label>
                <select
                  value={filters.kraYear}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, kraYear: e.target.value }))
                  }
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">{t("सर्व वर्षे", "All Years")}</option>
                  {kraYears.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  {t("KRA", "KRA")}
                </label>
                <select
                  value={filters.kra}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, kra: e.target.value }))
                  }
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">{t("सर्व KRA", "All KRAs")}</option>
                  {kraOptions.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <button
                  onClick={clearFilters}
                  className="w-full px-4 py-2.5 border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  {t("फिल्टर साफ करा", "Clear Filters")}
                </button>
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              {t("शेवटचे अपडेट:", "Last updated:")}{" "}
              {entriesLastRefresh.toLocaleTimeString("en-IN")}
            </p>

            {entriesError && (
              <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
                ❌ {entriesError}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
          {entriesLoading ? (
            <div className="p-8 text-slate-600">
              {t("नोंदी लोड होत आहेत...", "Loading entries...")}
            </div>
          ) : searchFilteredEntries.length === 0 ? (
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
                      <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase tracking-wider">
                        {t("क्रिया", "Actions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedEntries.map((entry, idx) => {
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
                            {entry.kraYear || "-"}
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
                            {MONTH_NAMES_MARATHI[entry?.achievementMonth] ||
                              entry?.achievementMonth}{" "}
                            {entry?.achievementYear}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <p className="text-sm">
                              {entry.submittedBy || "-"}
                            </p>
                            <p className="text-xs text-slate-400">
                              {entry?.createdAt
                                ? new Date(entry.createdAt).toLocaleDateString(
                                    "en-IN",
                                  )
                                : "-"}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => setViewingEntry(entry)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
                              title={t("तपशील पहा", "View Details")}
                            >
                              👁️ {t("पहा", "View")}
                            </button>
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
                  <strong>{paginatedEntries.length}</strong> {t("पैकी", "of")}{" "}
                  <strong>{searchFilteredEntries.length}</strong>{" "}
                  {t("नोंदी", "entries")}
                </p>

                <div className="flex gap-2">
                  <button
                    disabled={entryPage === 1}
                    onClick={() => setEntryPage((p) => Math.max(1, p - 1))}
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
                      setEntryPage((p) => Math.min(totalEntryPages, p + 1))
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

        {viewingEntry && (
          <ViewEntryModal
            entry={viewingEntry}
            kraOptions={kraOptions}
            onClose={() => setViewingEntry(null)}
          />
        )}
      </div>
    </div>
  );
}

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
        className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InfoItem
              label={t("महामंडळ", "Corporation")}
              value={localizeName(entry.corporation, language)}
            />
            <InfoItem label={t("वर्ष", "Year")} value={entry.kraYear} />
            <InfoItem
              label={t("प्रदेश", "Region")}
              value={
                localizeName(entry.region, language) || t("लागू नाही", "N/A")
              }
            />
            <InfoItem
              label={t("मंडळ", "Circle")}
              value={
                localizeName(entry.circle, language) || t("लागू नाही", "N/A")
              }
            />
            <InfoItem
              label={t("विभाग", "Division")}
              value={
                localizeName(entry.division, language) || t("लागू नाही", "N/A")
              }
            />
            <InfoItem
              label={t("संपर्क", "Contact")}
              value={entry.contactNumber}
            />
          </div>

          <div className="bg-indigo-50 rounded-xl p-4">
            <h4 className="font-semibold text-indigo-800 mb-2">
              {t("KRA तपशील", "KRA Details")}
            </h4>
            <p className="text-indigo-700 text-sm">
              {t("निवडलेले KRA:", "Selected KRAs:")}{" "}
              {selectedIds.length > 0 ? selectedIds.join(", ") : "-"}
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
                        (o) => Number(o.id) === Number(k.kraId),
                      );
                      const kraRemark =
                        kraRemarkMap.get(Number(k.kraId)) || "-";
                      return (
                        <tr key={`${entry._id}-${k.kraId}`}>
                          <td className="px-3 py-2 text-slate-700">
                            {idx + 1}
                          </td>
                          <td className="px-3 py-2 font-semibold text-indigo-800">
                            KRA {k.kraId}
                          </td>
                          <td className="px-3 py-2 text-indigo-700">
                            {kraOption?.name || k.kraName || "-"}
                          </td>
                          <td className="px-3 py-2 text-right text-indigo-700">
                            {(Number(k.annualTarget) || 0).toLocaleString(
                              "en-IN",
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-indigo-700">
                            {(Number(k.kraAchievement) || 0).toLocaleString(
                              "en-IN",
                            )}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-blue-50 rounded-xl p-4 text-center">
              <p className="text-sm text-blue-600 mb-1">
                {t("वार्षिक लक्ष्य", "Annual Target")}
              </p>
              <p className="text-2xl font-bold text-blue-700">
                {totalTarget.toLocaleString("en-IN")}
              </p>
            </div>
            <div className="bg-green-50 rounded-xl p-4 text-center">
              <p className="text-sm text-green-600 mb-1">
                {t("साध्य", "Achievement")}
              </p>
              <p className="text-2xl font-bold text-green-700">
                {totalAchievement.toLocaleString("en-IN")}
              </p>
            </div>
          </div>

          <InfoItem
            label={t("टिप्पणी", "Remarks")}
            value={entry.remarks || t("टिप्पणी उपलब्ध नाही", "No remarks")}
          />
        </div>
      </div>
    </div>
  );
}
