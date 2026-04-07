import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  LabelList,
} from "recharts";
import {
  dashboardApi,
  kraEntryApi,
  corporationApi,
  regionApi,
  circleApi,
  divisionApi,
  kraApi,
} from "../services/api";
import { generateKraYears } from "../utils/helpers";
import { useLanguage } from "../i18n/LanguageContext";
import { localizeName, localizeString } from "../utils/localize";

/* ── Vibrant multi-colour palette ── */
const COLORS = [
  "#6366f1", // indigo
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#14b8a6", // teal
];

const BAR_TOP_COLORS = ["#6366f1", "#818cf8", "#a5b4fc", "#c7d2fe", "#e0e7ff"];
const BAR_BTM_COLORS = ["#ef4444", "#f87171", "#fca5a5", "#fecaca", "#fee2e2"];
const KRA_FIXED_ORDER = [1, 2, 3, 4, 5, 6, 7];
const KRA_COLOR_BY_ID = {
  1: "#6366f1",
  2: "#f59e0b",
  3: "#10b981",
  4: "#ef4444",
  5: "#8b5cf6",
  6: "#06b6d4",
  7: "#7c3aed",
};

/* ── Loading spinner ── */
const LoadingSpinner = () => (
  <div className="flex flex-col items-center justify-center gap-4 p-12">
    <div className="relative">
      <div className="animate-spin rounded-full h-16 w-16 border-4 border-indigo-200"></div>
      <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-indigo-600 absolute inset-0"></div>
    </div>
    <p className="text-sm font-semibold text-slate-500 animate-pulse">
      Loading dashboard…
    </p>
  </div>
);

/* ── Section wrapper ── */
const SectionCard = ({ children, className = "" }) => (
  <div
    className={`bg-white rounded-2xl shadow-md border border-slate-100 p-6 hover:shadow-xl transition-shadow duration-300 ${className}`}
  >
    {children}
  </div>
);

const getPercentBadgeClass = (percent) => {
  const p = Number(percent) || 0;
  if (p > 70) return "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200";
  if (p >= 40) return "bg-amber-100 text-amber-700 ring-1 ring-amber-200";
  return "bg-red-100 text-red-700 ring-1 ring-red-200";
};

const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};

const toSafeNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const clampPercent = (value) => {
  const n = toSafeNumber(value, 0);
  if (n < 0) return 0;
  if (n > 200) return 200;
  return n;
};

const toCleanLabel = (value, fallback = "") => {
  const label = String(value || "").trim();
  return label || fallback;
};

const getKraIdFromItem = (item) => {
  const direct = Number(item?.kraId);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const byName = String(item?.kraName || "").match(/\bKRA\s*(\d+)\b/i);
  if (byName?.[1]) {
    const parsed = Number(byName[1]);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  return null;
};

const hashString = (text) =>
  String(text || "")
    .split("")
    .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 0);

const getKraColor = (item) => {
  const kraId = getKraIdFromItem(item);
  if (kraId && KRA_COLOR_BY_ID[kraId]) return KRA_COLOR_BY_ID[kraId];

  const basis = String(item?.kraName || item?.name || "KRA");
  return COLORS[hashString(basis) % COLORS.length];
};

const sortByFixedKraOrder = (rows = []) => {
  const order = new Map(KRA_FIXED_ORDER.map((id, idx) => [id, idx]));
  return [...rows].sort((a, b) => {
    const aId = getKraIdFromItem(a);
    const bId = getKraIdFromItem(b);
    const aRank = aId && order.has(aId) ? order.get(aId) : 999;
    const bRank = bId && order.has(bId) ? order.get(bId) : 999;
    if (aRank !== bRank) return aRank - bRank;
    return String(a?.kraName || "").localeCompare(String(b?.kraName || ""));
  });
};

const normalizeBarRows = (rows = []) =>
  (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      ...row,
      name: toCleanLabel(row?.name),
      achievementPercentage: clampPercent(row?.achievementPercentage),
      totalAchievement: toSafeNumber(row?.totalAchievement),
      totalTarget: toSafeNumber(row?.totalTarget),
    }))
    .filter((row) => row.name && Number.isFinite(row.achievementPercentage));

const normalizeTrendRows = (rows = []) =>
  (Array.isArray(rows) ? rows : []).map((d) => {
    const achievement = toSafeNumber(d?.totalAchievement);
    const target = toSafeNumber(d?.totalTarget);
    const entriesCount = toSafeNumber(d?.count);
    return {
      ...d,
      totalAchievement: achievement,
      totalTarget: target,
      entriesCount,
      label: `${d?.monthName || "M"} ${d?.year || ""}`.trim(),
      achievementPct:
        target > 0 ? Math.round((achievement / target) * 100 * 100) / 100 : 0,
    };
  });

const normalizeKraRows = (rows = []) =>
  (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    kraId: row?.kraId,
    kraName: row?.kraName || `KRA ${row?.kraId || "-"}`,
    achievementPercentage: clampPercent(row?.achievementPercentage),
    totalAchievement: toSafeNumber(row?.totalAchievement),
    totalTarget: toSafeNumber(row?.totalTarget),
  }));

const ChartEmptyState = ({ title }) => (
  <div className="h-[300px] rounded-xl border border-dashed border-slate-200 bg-slate-50/80 flex items-center justify-center">
    <div className="text-center px-6">
      <p className="text-sm font-semibold text-slate-500">{title}</p>
      <p className="text-xs text-slate-400 mt-1">
        No chart data for current filters
      </p>
    </div>
  </div>
);

const ChartLoadingState = () => (
  <div className="h-[300px] rounded-xl border border-slate-200 bg-slate-50/80 p-4">
    <div className="animate-pulse h-full grid grid-cols-8 gap-2 items-end">
      {Array.from({ length: 8 }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-t-md bg-slate-200"
          style={{ height: `${35 + ((idx * 9) % 55)}%` }}
        />
      ))}
    </div>
  </div>
);

export default function Dashboard() {
  const { t, language } = useLanguage();
  const [summary, setSummary] = useState(null);
  const [entries, setEntries] = useState([]);

  const [regions, setRegions] = useState([]);
  const [circles, setCircles] = useState([]);
  const [divisions, setDivisions] = useState([]);

  const [periods, setPeriods] = useState([]);
  const [topBars, setTopBars] = useState([]);
  const [bottomBars, setBottomBars] = useState([]);
  const [weightageDistribution, setWeightageDistribution] = useState([]);
  const [rankTable, setRankTable] = useState([]);

  const [corpKraPies, setCorpKraPies] = useState([]);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [kraWiseData, setKraWiseData] = useState([]);

  const [corporations, setCorporations] = useState([]);
  const [kras, setKras] = useState([]);
  const [kraYears] = useState(generateKraYears());

  const [filters, setFilters] = useState({
    corporation: "",
    region: "",
    circle: "",
    division: "",
    kraYear: "",
    period: "", // "YYYY-MM"
    kra: "",
  });

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadMasterData = async () => {
      try {
        const [corpRes, kraRes] = await Promise.all([
          corporationApi.getAll(),
          kraApi.getAll(),
        ]);
        setCorporations(corpRes.data?.data || []);
        setKras(kraRes.data?.data || []);
      } catch (error) {
        console.error("Error loading master data:", error);
      }
    };
    loadMasterData();
  }, []);

  // Cascade: Corporation -> Regions
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
        setRegions(res.data?.data || []);
      } catch (error) {
        console.error("Error loading regions:", error);
        setRegions([]);
      }
    };
    loadRegions();
  }, [filters.corporation]);

  // Cascade: Region -> Circles
  useEffect(() => {
    const loadCircles = async () => {
      if (!filters.region) {
        setCircles([]);
        setDivisions([]);
        return;
      }
      try {
        const res = await circleApi.getByRegion(filters.region);
        setCircles(res.data?.data || []);
      } catch (error) {
        console.error("Error loading circles:", error);
        setCircles([]);
      }
    };
    loadCircles();
  }, [filters.region]);

  // Cascade: Circle -> Divisions
  useEffect(() => {
    const loadDivisions = async () => {
      if (!filters.circle) {
        setDivisions([]);
        return;
      }
      try {
        const res = await divisionApi.getByCircle(filters.circle);
        setDivisions(res.data?.data || []);
      } catch (error) {
        console.error("Error loading divisions:", error);
        setDivisions([]);
      }
    };
    loadDivisions();
  }, [filters.circle]);

  useEffect(() => {
    fetchDashboardData();
  }, [filters, kras]);

  const parsePeriod = (periodKey) => {
    if (!periodKey) return { month: undefined, year: undefined };
    const [y, m] = String(periodKey).split("-");
    const year = parseInt(y, 10);
    const month = parseInt(m, 10);
    return {
      year: Number.isFinite(year) ? year : undefined,
      month: Number.isFinite(month) ? month : undefined,
    };
  };

  const getGroupByForSelection = () => {
    if (!filters.corporation) return "corporation";
    if (!filters.region) return "region";
    if (!filters.circle) return "circle";
    return "division";
  };

  const getEntityLabel = () => {
    const groupBy = getGroupByForSelection();
    if (groupBy === "corporation") return t("महामंडळ", "Corporation");
    if (groupBy === "region") return t("विभाग", "Region");
    if (groupBy === "circle") return t("मंडळ", "Circle");
    return t("उपविभाग", "Division");
  };

  const getFyStartYear = (fy) => {
    const match = String(fy || "").match(/^(\d{4})/);
    if (!match) return null;
    const start = Number(match[1]);
    return Number.isFinite(start) ? start : null;
  };

  const formatFyLabel = (startYear) =>
    `${startYear}-${String(startYear + 1).slice(-2)}`;

  const getCurrentFyStartYear = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    // App uses Jun-May financial year.
    return month >= 6 ? year : year - 1;
  };

  const selectedFyStart = getFyStartYear(filters.kraYear);
  const effectiveFyStart = selectedFyStart || getCurrentFyStartYear();
  const currentFyLabel = formatFyLabel(effectiveFyStart);
  const previousFyLabel = formatFyLabel(effectiveFyStart - 1);

  const handleEntityDrillDown = async (row) => {
    const groupBy = getGroupByForSelection();
    if (!row) return;
    const entityId = row._id || row.entityId;
    if (!entityId) return;

    if (groupBy === "corporation") {
      setFilters((prev) => ({
        ...prev,
        corporation: String(entityId),
        region: "",
        circle: "",
        division: "",
      }));
      return;
    }

    if (groupBy === "region") {
      setFilters((prev) => ({
        ...prev,
        region: String(entityId),
        circle: "",
        division: "",
      }));
      return;
    }

    if (groupBy === "circle") {
      setFilters((prev) => ({
        ...prev,
        circle: String(entityId),
        division: "",
      }));
      return;
    }

    setFilters((prev) => ({
      ...prev,
      division: String(entityId),
    }));
  };

  const exportExcel = async () => {
    try {
      const filterParams = {};
      if (filters.corporation) filterParams.corporation = filters.corporation;
      if (filters.region) filterParams.region = filters.region;
      if (filters.circle) filterParams.circle = filters.circle;
      if (filters.division) filterParams.division = filters.division;
      if (filters.kraYear) filterParams.kraYear = filters.kraYear;
      if (filters.kra) filterParams.kra = filters.kra;

      if (!filters.period) filterParams.periodMode = "all";
      const { month, year } = parsePeriod(filters.period);
      if (month) filterParams.month = String(month);
      if (year) filterParams.year = String(year);

      const groupBy = getGroupByForSelection();
      const res = await dashboardApi.exportExcel({ ...filterParams, groupBy });
      const filename = `kra-dashboard-${filters.period || "latest"}.xlsx`;
      downloadBlob(res.data, filename);
    } catch (error) {
      console.error("Export Excel failed:", error);
    }
  };

  const exportPdf = async () => {
    try {
      const filterParams = {};
      if (filters.corporation) filterParams.corporation = filters.corporation;
      if (filters.region) filterParams.region = filters.region;
      if (filters.circle) filterParams.circle = filters.circle;
      if (filters.division) filterParams.division = filters.division;
      if (filters.kraYear) filterParams.kraYear = filters.kraYear;
      if (filters.kra) filterParams.kra = filters.kra;

      if (!filters.period) filterParams.periodMode = "all";
      const { month, year } = parsePeriod(filters.period);
      if (month) filterParams.month = String(month);
      if (year) filterParams.year = String(year);

      const groupBy = getGroupByForSelection();
      const res = await dashboardApi.exportPdf({ ...filterParams, groupBy });
      const filename = `kra-dashboard-${filters.period || "latest"}.pdf`;
      downloadBlob(res.data, filename);
    } catch (error) {
      console.error("Export PDF failed:", error);
    }
  };

  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      const filterParams = {};
      if (filters.corporation) filterParams.corporation = filters.corporation;
      if (filters.region) filterParams.region = filters.region;
      if (filters.circle) filterParams.circle = filters.circle;
      if (filters.division) filterParams.division = filters.division;
      if (filters.kraYear) filterParams.kraYear = filters.kraYear;
      if (filters.kra) filterParams.kra = filters.kra;

      // If Month is not selected, show ALL existing entries/aggregates.
      if (!filters.period) filterParams.periodMode = "all";

      const { month, year } = parsePeriod(filters.period);
      if (month) filterParams.month = String(month);
      if (year) filterParams.year = String(year);

      // Load available periods for current hierarchy scope (non-blocking)
      const periodsPromise = dashboardApi.getPeriods({
        corporation: filters.corporation || "",
        region: filters.region || "",
        circle: filters.circle || "",
        division: filters.division || "",
        kraYear: filters.kraYear || "",
      });

      const groupBy = getGroupByForSelection();

      // For IDC-wise pies, we intentionally ignore region/circle/division.
      const corpPieParams = {};
      if (filters.corporation) corpPieParams.corporation = filters.corporation;
      if (filters.kraYear) corpPieParams.kraYear = filters.kraYear;
      if (!filters.period) corpPieParams.periodMode = "all";
      if (month) corpPieParams.month = String(month);
      if (year) corpPieParams.year = String(year);

      // Always show monthly trend across periods (not a single selected month point).
      const trendParams = { ...filterParams, periodMode: "all" };
      delete trendParams.month;
      delete trendParams.year;

      const [
        summaryRes,
        entriesRes,
        topBarsRes,
        bottomBarsRes,
        weightRes,
        rankRes,
        corpPieRes,
        trendRes,
        kraWiseRes,
        periodsRes,
      ] = await Promise.allSettled([
        dashboardApi.getSummary({ ...filterParams, groupBy }),
        kraEntryApi.getAll(filterParams),
        dashboardApi.getAchievementBar({
          ...filterParams,
          groupBy,
          mode: "top",
          limit: "5",
        }),
        dashboardApi.getAchievementBar({
          ...filterParams,
          groupBy,
          mode: "bottom",
          limit: "5",
        }),
        dashboardApi.getWeightageDistribution(filterParams),
        dashboardApi.getRankTable({ ...filterParams, groupBy }),
        dashboardApi.getCorpKraPerformance(corpPieParams),
        dashboardApi.getMonthlyTrend(trendParams),
        dashboardApi.getByKra(filterParams),
        periodsPromise,
      ]);

      const summaryData =
        summaryRes.status === "fulfilled"
          ? summaryRes.value.data?.data || {}
          : {};
      const rawEntries =
        entriesRes.status === "fulfilled"
          ? entriesRes.value.data?.data || []
          : [];
      const topBarsData =
        topBarsRes.status === "fulfilled"
          ? topBarsRes.value.data?.data || []
          : [];
      const bottomBarsData =
        bottomBarsRes.status === "fulfilled"
          ? bottomBarsRes.value.data?.data || []
          : [];
      const weightData =
        weightRes.status === "fulfilled"
          ? weightRes.value.data?.data || []
          : [];
      const rankData =
        rankRes.status === "fulfilled" ? rankRes.value.data?.data || [] : [];
      const corpPieData =
        corpPieRes.status === "fulfilled"
          ? corpPieRes.value.data?.data || []
          : [];
      const trendRaw =
        trendRes.status === "fulfilled" ? trendRes.value.data?.data || [] : [];
      const kraWiseRaw =
        kraWiseRes.status === "fulfilled"
          ? kraWiseRes.value.data?.data || []
          : [];
      const periodList =
        periodsRes.status === "fulfilled"
          ? periodsRes.value.data?.data || []
          : [];
      setPeriods(periodList);

      const safeTopBars = normalizeBarRows(topBarsData);
      const safeBottomBars = normalizeBarRows(bottomBarsData);
      const safeRankRows = (Array.isArray(rankData) ? rankData : []).map(
        (r) => ({
          ...r,
          name: toCleanLabel(r?.name),
          currentMonthPercentage: clampPercent(r?.currentMonthPercentage),
        }),
      );

      const fallbackTopFromRanks = [...safeRankRows]
        .filter((r) => r.name)
        .sort((a, b) => b.currentMonthPercentage - a.currentMonthPercentage)
        .slice(0, 5)
        .map((r) => ({
          _id: r.entityId,
          name: r.name,
          achievementPercentage: r.currentMonthPercentage,
        }));

      const fallbackBottomFromRanks = [...safeRankRows]
        .filter((r) => r.name)
        .sort((a, b) => a.currentMonthPercentage - b.currentMonthPercentage)
        .slice(0, 5)
        .map((r) => ({
          _id: r.entityId,
          name: r.name,
          achievementPercentage: r.currentMonthPercentage,
        }));

      const hasValidSummary =
        Number.isFinite(Number(summaryData?.achievementPercentage)) &&
        Number.isFinite(Number(summaryData?.totalTarget));

      if (hasValidSummary) {
        setSummary(summaryData);
      } else {
        const fallbackTotals = rawEntries.reduce(
          (acc, doc) => {
            const items = Array.isArray(doc.kras) ? doc.kras : [];
            items.forEach((item) => {
              acc.totalAchievement += Number(item.kraAchievement) || 0;
              acc.totalTarget += Number(item.annualTarget) || 0;
            });
            return acc;
          },
          { totalAchievement: 0, totalTarget: 0 },
        );

        const fallbackAchPct =
          fallbackTotals.totalTarget > 0
            ? Math.round(
                (fallbackTotals.totalAchievement / fallbackTotals.totalTarget) *
                  100 *
                  100,
              ) / 100
            : 0;

        setSummary({
          ...summaryData,
          totalEntries: rawEntries.length,
          totalAchievement:
            Math.round(fallbackTotals.totalAchievement * 100) / 100,
          totalTarget: Math.round(fallbackTotals.totalTarget * 100) / 100,
          achievementPercentage: fallbackAchPct,
        });
      }

      setTopBars(safeTopBars.length ? safeTopBars : fallbackTopFromRanks);
      setBottomBars(
        safeBottomBars.length ? safeBottomBars : fallbackBottomFromRanks,
      );
      setWeightageDistribution(
        sortByFixedKraOrder(Array.isArray(weightData) ? weightData : []),
      );
      setRankTable(safeRankRows);

      const masterKraNameById = new Map(
        (Array.isArray(kras) ? kras : []).map((k) => [
          Number(k?.kraNumber),
          k?.name || `KRA ${k?.kraNumber}`,
        ]),
      );

      setCorpKraPies(
        (Array.isArray(corpPieData) ? corpPieData : []).map((corp) => ({
          ...corp,
          corporationName: toCleanLabel(corp?.corporationName),
          data: sortByFixedKraOrder(
            KRA_FIXED_ORDER.map((kraId) => {
              const rawItems = Array.isArray(corp?.data) ? corp.data : [];
              const existing = rawItems.find(
                (x) => Number(x?.kraId) === Number(kraId),
              );
              return {
                ...(existing || {}),
                kraId,
                kraName: toCleanLabel(
                  existing?.kraName,
                  masterKraNameById.get(kraId) || `KRA ${kraId}`,
                ),
                slicePercentage: clampPercent(existing?.slicePercentage),
                achievementPercentage: clampPercent(
                  existing?.achievementPercentage,
                ),
                weight: toSafeNumber(existing?.weight),
              };
            }),
          ),
        })),
      );

      // Monthly trend with month-wise percentage share of entries.
      const trendRows = normalizeTrendRows(trendRaw);
      const totalEntriesAcrossMonths = trendRows.reduce(
        (sum, row) => sum + toSafeNumber(row?.entriesCount),
        0,
      );
      const trendWithPercentage = trendRows.map((row) => ({
        ...row,
        entriesPercentage:
          totalEntriesAcrossMonths > 0
            ? Math.round(
                (toSafeNumber(row?.entriesCount) / totalEntriesAcrossMonths) *
                  100 *
                  100,
              ) / 100
            : 0,
      }));
      setMonthlyTrend(trendWithPercentage);

      // KRA-wise achievement
      setKraWiseData(normalizeKraRows(kraWiseRaw));

      const selectedKraNumber = filters.kra
        ? kras.find((k) => String(k._id) === String(filters.kra))?.kraNumber
        : null;

      let flattened = rawEntries.flatMap((doc) => {
        const items = Array.isArray(doc.kras) ? doc.kras : [];
        return items.map((k) => ({
          _id: `${doc._id}-${k.kraId}`,
          achievementDate: doc.achievementDate,
          corporation: doc.corporation,
          region: doc.region,
          circle: doc.circle,
          kraYear: doc.kraYear,
          submittedBy: doc.submittedBy,
          kraId: k.kraId,
          kraName: k.kraName,
          annualTarget: k.annualTarget,
          kraAchievement: k.kraAchievement,
        }));
      });

      if (selectedKraNumber) {
        flattened = flattened.filter((r) => r.kraId === selectedKraNumber);
      } else {
        // Default: hide all-zero KRAs for readability
        flattened = flattened.filter(
          (r) => (r.annualTarget || 0) > 0 || (r.kraAchievement || 0) > 0,
        );
      }

      flattened.sort(
        (a, b) => new Date(b.achievementDate) - new Date(a.achievementDate),
      );
      setEntries(flattened);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters((prev) => {
      // Reset dependent filters
      if (field === "corporation") {
        return {
          ...prev,
          corporation: value,
          region: "",
          circle: "",
          division: "",
          period: "",
        };
      }
      if (field === "region") {
        return { ...prev, region: value, circle: "", division: "", period: "" };
      }
      if (field === "circle") {
        return { ...prev, circle: value, division: "", period: "" };
      }
      if (field === "division") {
        return { ...prev, division: value, period: "" };
      }
      if (field === "kraYear") {
        return { ...prev, kraYear: value, period: "" };
      }
      return { ...prev, [field]: value };
    });
  };

  const resetFilters = () => {
    setFilters({
      corporation: "",
      region: "",
      circle: "",
      division: "",
      kraYear: "",
      period: "",
      kra: "",
    });
  };

  if (isLoading && !summary) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50/30 to-violet-50/20">
        <LoadingSpinner />
      </div>
    );
  }

  const topBottomMax = Math.max(
    100,
    ...topBars.map((x) => toSafeNumber(x.achievementPercentage, 0)),
    ...bottomBars.map((x) => toSafeNumber(x.achievementPercentage, 0)),
  );
  const yDomainMax = Math.ceil(topBottomMax / 10) * 10;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-violet-50/20 py-6 px-3 md:px-6">
      <div className="max-w-[1400px] mx-auto space-y-8">
        {/* ═══════ HEADER ═══════ */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 p-6 md:p-8 shadow-xl">
          {/* decorative shapes */}
          <div className="absolute -right-10 -top-10 w-44 h-44 rounded-full bg-white/10 blur-2xl"></div>
          <div className="absolute -left-8 -bottom-8 w-36 h-36 rounded-full bg-white/5 blur-xl"></div>

          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="text-white">
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight flex items-center gap-3">
                <span className="bg-white/20 backdrop-blur-sm rounded-xl p-2 text-2xl">
                  📊
                </span>
                {t("KRA डॅशबोर्ड", "KRA Dashboard")}
              </h1>
              <p className="mt-2 text-indigo-100 font-medium text-sm md:text-base">
                {t(
                  "केआरए डॅशबोर्ड - डेटा विश्लेषण आणि अहवाल",
                  "Executive Performance & Analytics Overview",
                )}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={exportExcel}
                disabled={isLoading}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold bg-white/15 backdrop-blur-sm text-white border border-white/20 hover:bg-white/25 transition-all text-sm"
              >
                <span>📥</span> {t("एक्सेल", "Excel")}
              </button>
              <button
                type="button"
                onClick={exportPdf}
                disabled={isLoading}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold bg-white/15 backdrop-blur-sm text-white border border-white/20 hover:bg-white/25 transition-all text-sm"
              >
                <span>📄</span> {t("पीडीएफ", "PDF")}
              </button>
            </div>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2 font-semibold">
            <span className="inline-block h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
            {t("डेटा अद्ययावत होत आहे...", "Refreshing dashboard data...")}
          </div>
        )}

        {/* ═══════ FILTERS ═══════ */}
        <SectionCard className="sticky top-20 z-30">
          <div className="flex items-center gap-3 mb-5">
            <span className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center text-base shadow">
              🔍
            </span>
            <h2 className="text-lg font-bold text-slate-800">
              {t("फिल्टर", "Filters")}
            </h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            {/* Corporation */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                {t("महामंडळ", "Corporation")}
              </label>
              <select
                className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition"
                value={filters.corporation}
                onChange={(e) =>
                  handleFilterChange("corporation", e.target.value)
                }
              >
                <option value="">{t("सर्व", "All")}</option>
                {corporations.map((corp) => (
                  <option key={corp._id} value={corp._id}>
                    {localizeName(corp, language)}
                  </option>
                ))}
              </select>
            </div>

            {/* Region */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                {t("विभाग", "Region")}
              </label>
              <select
                className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition disabled:opacity-50"
                value={filters.region}
                onChange={(e) => handleFilterChange("region", e.target.value)}
                disabled={!filters.corporation}
              >
                <option value="">{t("सर्व", "All")}</option>
                {regions.map((r) => (
                  <option key={r._id} value={r._id}>
                    {localizeName(r, language)}
                  </option>
                ))}
              </select>
            </div>

            {/* Circle */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                {t("मंडळ", "Circle")}
              </label>
              <select
                className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition disabled:opacity-50"
                value={filters.circle}
                onChange={(e) => handleFilterChange("circle", e.target.value)}
                disabled={!filters.region}
              >
                <option value="">{t("सर्व", "All")}</option>
                {circles.map((c) => (
                  <option key={c._id} value={c._id}>
                    {localizeName(c, language)}
                  </option>
                ))}
              </select>
            </div>

            {/* Division */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                {t("उपविभाग", "Division")}
              </label>
              <select
                className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition disabled:opacity-50"
                value={filters.division}
                onChange={(e) => handleFilterChange("division", e.target.value)}
                disabled={!filters.circle}
              >
                <option value="">{t("सर्व", "All")}</option>
                {divisions.map((d) => (
                  <option key={d._id} value={d._id}>
                    {localizeName(d, language)}
                  </option>
                ))}
              </select>
            </div>

            {/* KRA Year */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                {t("KRA वर्ष", "Year")}
              </label>
              <select
                className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition"
                value={filters.kraYear}
                onChange={(e) => handleFilterChange("kraYear", e.target.value)}
              >
                <option value="">{t("सर्व", "All")}</option>
                {kraYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            {/* Month */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                {t("महिना", "Month")}
              </label>
              <select
                className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition disabled:opacity-50"
                value={filters.period}
                onChange={(e) => handleFilterChange("period", e.target.value)}
                disabled={periods.length === 0}
              >
                <option value="">{t("सर्व", "All")}</option>
                {periods.map((p) => {
                  const key = `${p.year}-${String(p.month).padStart(2, "0")}`;
                  return (
                    <option
                      key={key}
                      value={key}
                    >{`${String(p.month).padStart(2, "0")}/${p.year}`}</option>
                  );
                })}
              </select>
            </div>

            {/* KRA */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                {t("फलनिष्पत्ती", "KRA")}
              </label>
              <select
                className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition"
                value={filters.kra}
                onChange={(e) => handleFilterChange("kra", e.target.value)}
              >
                <option value="">{t("सर्व", "All")}</option>
                {kras.map((kra) => (
                  <option key={kra._id} value={kra._id}>
                    {localizeName(kra, language)}
                  </option>
                ))}
              </select>
            </div>

            {/* Reset */}
            <div className="flex items-end">
              <button
                onClick={resetFilters}
                className="w-full text-sm px-3 py-2 rounded-lg font-bold bg-gradient-to-r from-slate-100 to-slate-200 text-slate-600 hover:from-slate-200 hover:to-slate-300 border border-slate-200 transition-all"
              >
                {t("रीसेट", "Reset")}
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-400 mt-3 italic">
            {t(
              "टीप: मंडळ निवडल्यास विभागनिहाय विश्लेषण दिसेल.",
              "Tip: Selecting a Circle switches to Division-wise analysis.",
            )}
          </p>
        </SectionCard>

        {/* ═══════ TOP / BOTTOM BAR CHARTS ═══════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top 5 */}
          <SectionCard>
            <div className="flex items-center gap-3 mb-4">
              <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-500 text-white flex items-center justify-center text-lg shadow-md">
                ▲
              </span>
              <div>
                <h3 className="text-lg font-extrabold text-slate-800">
                  {t("एकूण टॉप परफॉर्मर्स", "Over All Top Performers")}
                </h3>
                <p className="text-xs text-slate-400 font-medium">
                  {getEntityLabel()} {t("नुसार साध्य %", "wise Achievement %")}
                </p>
              </div>
            </div>
            {isLoading ? (
              <ChartLoadingState />
            ) : topBars.length === 0 ? (
              <ChartEmptyState
                title={t("डेटा उपलब्ध नाही", "No top performers found")}
              />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={topBars}
                  margin={{ top: 24, right: 20, left: -20, bottom: 0 }}
                >
                  <defs>
                    {BAR_TOP_COLORS.map((c, i) => (
                      <linearGradient
                        key={`gt-${i}`}
                        id={`gradTop${i}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="0%" stopColor={c} stopOpacity={1} />
                        <stop offset="100%" stopColor={c} stopOpacity={0.6} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#e2e8f0"
                  />
                  <XAxis
                    dataKey="name"
                    interval={0}
                    tick={{ fill: "#64748b", fontSize: 11, fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, yDomainMax]}
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "#eef2ff" }}
                    contentStyle={{
                      borderRadius: "12px",
                      border: "none",
                      boxShadow: "0 10px 25px -5px rgb(0 0 0 / 0.1)",
                      fontSize: 13,
                    }}
                    formatter={(v) => [
                      `${Number(v || 0).toFixed(2)}%`,
                      t("साध्य %", "Achievement %"),
                    ]}
                  />
                  <Bar
                    dataKey="achievementPercentage"
                    radius={[8, 8, 0, 0]}
                    cursor="pointer"
                    name={t("साध्य %", "Achievement %")}
                    onClick={(e) => handleEntityDrillDown(e?.payload)}
                  >
                    <LabelList
                      dataKey="achievementPercentage"
                      position="top"
                      formatter={(value) => `${Number(value || 0).toFixed(1)}%`}
                      style={{ fill: "#334155", fontSize: 11, fontWeight: 700 }}
                    />
                    {topBars.map((_, i) => (
                      <Cell
                        key={`top-${i}`}
                        fill={`url(#gradTop${i % BAR_TOP_COLORS.length})`}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            <p className="mt-3 text-[11px] font-semibold text-indigo-500 text-center bg-indigo-50 py-1.5 rounded-lg cursor-pointer hover:bg-indigo-100 transition">
              {t("बारवर क्लिक करा ड्रिल-डाउनसाठी", "Click a bar to drill down")}
            </p>
            {topBars.length > 0 && topBars.length < 5 && (
              <p className="mt-2 text-center text-[11px] text-slate-400">
                {t(
                  "उपलब्ध नोंदी ५ पेक्षा कमी आहेत",
                  "Fewer than 5 entities available",
                )}
              </p>
            )}
          </SectionCard>

          {/* Bottom 5 */}
          <SectionCard>
            <div className="flex items-center gap-3 mb-4">
              <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-red-500 text-white flex items-center justify-center text-lg shadow-md">
                ▼
              </span>
              <div>
                <h3 className="text-lg font-extrabold text-slate-800">
                  {t("एकूण बॉटम परफॉर्मर्स", "Over All Bottom Performers")}
                </h3>
                <p className="text-xs text-slate-400 font-medium">
                  {getEntityLabel()} {t("नुसार साध्य %", "wise Achievement %")}
                </p>
              </div>
            </div>
            {isLoading ? (
              <ChartLoadingState />
            ) : bottomBars.length === 0 ? (
              <ChartEmptyState
                title={t("डेटा उपलब्ध नाही", "No low performers found")}
              />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={bottomBars}
                  margin={{ top: 24, right: 20, left: -20, bottom: 0 }}
                >
                  <defs>
                    {BAR_BTM_COLORS.map((c, i) => (
                      <linearGradient
                        key={`gb-${i}`}
                        id={`gradBtm${i}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="0%" stopColor={c} stopOpacity={1} />
                        <stop offset="100%" stopColor={c} stopOpacity={0.6} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#e2e8f0"
                  />
                  <XAxis
                    dataKey="name"
                    interval={0}
                    tick={{ fill: "#64748b", fontSize: 11, fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, yDomainMax]}
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "#fff1f2" }}
                    contentStyle={{
                      borderRadius: "12px",
                      border: "none",
                      boxShadow: "0 10px 25px -5px rgb(0 0 0 / 0.1)",
                      fontSize: 13,
                    }}
                    formatter={(v) => [
                      `${Number(v || 0).toFixed(2)}%`,
                      t("साध्य %", "Achievement %"),
                    ]}
                  />
                  <Bar
                    dataKey="achievementPercentage"
                    radius={[8, 8, 0, 0]}
                    cursor="pointer"
                    name={t("साध्य %", "Achievement %")}
                    onClick={(e) => handleEntityDrillDown(e?.payload)}
                  >
                    <LabelList
                      dataKey="achievementPercentage"
                      position="top"
                      formatter={(value) => `${Number(value || 0).toFixed(1)}%`}
                      style={{ fill: "#334155", fontSize: 11, fontWeight: 700 }}
                    />
                    {bottomBars.map((_, i) => (
                      <Cell
                        key={`btm-${i}`}
                        fill={`url(#gradBtm${i % BAR_BTM_COLORS.length})`}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            <p className="mt-3 text-[11px] font-semibold text-rose-500 text-center bg-rose-50 py-1.5 rounded-lg cursor-pointer hover:bg-rose-100 transition">
              {t("बारवर क्लिक करा ड्रिल-डाउनसाठी", "Click a bar to drill down")}
            </p>
            {bottomBars.length > 0 && bottomBars.length < 5 && (
              <p className="mt-2 text-center text-[11px] text-slate-400">
                {t(
                  "उपलब्ध नोंदी ५ पेक्षा कमी आहेत",
                  "Fewer than 5 entities available",
                )}
              </p>
            )}
          </SectionCard>
        </div>

        {/* ═══════ MONTHLY TREND LINE CHART ═══════ */}
        <SectionCard>
          <div className="flex items-center gap-3 mb-5">
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-lg shadow-md">
              📈
            </span>
            <div>
              <h3 className="text-lg font-extrabold text-slate-800">
                {t("महिनानिहाय KRA कल", "Month Wise KRA Trends")}
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                {t(
                  "महिन्यानुसार नोंदी टक्केवारीचा कल",
                  "Month-wise entries percentage trend",
                )}
              </p>
            </div>
          </div>
          {isLoading ? (
            <ChartLoadingState />
          ) : monthlyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={350}>
              <LineChart
                data={monthlyTrend}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="category"
                  dataKey="label"
                  tick={{ fill: "#64748b", fontSize: 11, fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="number"
                  domain={[0, 100]}
                  tickFormatter={(v) => `${Number(v || 0).toFixed(0)}%`}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "12px",
                    border: "none",
                    boxShadow: "0 10px 25px -5px rgb(0 0 0 / 0.1)",
                    fontSize: 13,
                  }}
                  formatter={(v, _name, props) => {
                    const count = Number(props?.payload?.entriesCount || 0);
                    return [
                      `${Number(v || 0).toFixed(2)}% (${count.toLocaleString("en-IN")} ${t("नोंदी", "entries")})`,
                      t("नोंदी टक्केवारी", "Entries %"),
                    ];
                  }}
                />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ fontSize: 12, fontWeight: 600 }}
                  formatter={() => t("नोंदी टक्केवारी", "Entries %")}
                />
                <Line
                  type="monotone"
                  dataKey="entriesPercentage"
                  name={t("नोंदी टक्केवारी", "Entries %")}
                  stroke="#6366f1"
                  strokeWidth={3}
                  dot={{
                    r: 5,
                    fill: "#6366f1",
                    stroke: "#fff",
                    strokeWidth: 2,
                  }}
                  activeDot={{
                    r: 7,
                    fill: "#fff",
                    stroke: "#6366f1",
                    strokeWidth: 2,
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmptyState
              title={t("डेटा उपलब्ध नाही", "No trend data available")}
            />
          )}
        </SectionCard>

        {/* ═══════ KRA ACHIEVEMENT RADAR + PROGRESS BARS ═══════ */}
        {kraWiseData.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Radar Chart */}
            <SectionCard>
              <div className="flex items-center gap-3 mb-5">
                <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center text-lg shadow-md">
                  🕸️
                </span>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-800">
                    {t("KRA कामगिरी रडार", "KRA Performance Radar")}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    {t(
                      "सर्व KRA चा तुलनात्मक दृश्य",
                      "Comparative view across all KRAs",
                    )}
                  </p>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={350}>
                <RadarChart
                  data={kraWiseData.map((k) => ({
                    ...k,
                    displayName: localizeString(
                      k.kraName || `KRA ${k.kraId}`,
                      language,
                    ),
                    achievementPct: Number(k.achievementPercentage) || 0,
                  }))}
                  cx="50%"
                  cy="50%"
                  outerRadius="75%"
                >
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis
                    dataKey="displayName"
                    tick={{ fill: "#64748b", fontSize: 10, fontWeight: 600 }}
                  />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 100]}
                    tick={{ fill: "#94a3b8", fontSize: 10 }}
                  />
                  <Radar
                    name={t("साध्य %", "Achievement %")}
                    dataKey="achievementPct"
                    stroke="#8b5cf6"
                    fill="#8b5cf6"
                    fillOpacity={0.25}
                    strokeWidth={2}
                    dot={{
                      r: 4,
                      fill: "#8b5cf6",
                      stroke: "#fff",
                      strokeWidth: 2,
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "12px",
                      border: "none",
                      boxShadow: "0 8px 20px rgb(0 0 0 / 0.08)",
                      fontSize: 12,
                    }}
                    formatter={(v) => [
                      `${Number(v || 0).toFixed(1)}%`,
                      t("साध्य %", "Achievement %"),
                    ]}
                  />
                  <Legend
                    iconType="circle"
                    wrapperStyle={{ fontSize: 12, fontWeight: 600 }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </SectionCard>

            {/* KRA Progress Bars */}
            <SectionCard>
              <div className="flex items-center gap-3 mb-5">
                <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center text-lg shadow-md">
                  📊
                </span>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-800">
                    {t("KRA निहाय प्रगती", "KRA-wise Progress")}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    {t(
                      "प्रत्येक KRA ची साध्य स्थिती",
                      "Achievement status of each KRA",
                    )}
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                {kraWiseData.map((kra, idx) => {
                  const pct = Math.min(
                    Number(kra.achievementPercentage) || 0,
                    100,
                  );
                  const progressColors = [
                    "from-indigo-500 to-blue-500",
                    "from-amber-500 to-orange-500",
                    "from-emerald-500 to-teal-500",
                    "from-rose-500 to-pink-500",
                    "from-violet-500 to-purple-500",
                    "from-cyan-500 to-sky-500",
                    "from-fuchsia-500 to-pink-500",
                  ];
                  const bgColors = [
                    "bg-indigo-100",
                    "bg-amber-100",
                    "bg-emerald-100",
                    "bg-rose-100",
                    "bg-violet-100",
                    "bg-cyan-100",
                    "bg-fuchsia-100",
                  ];
                  const textColors = [
                    "text-indigo-700",
                    "text-amber-700",
                    "text-emerald-700",
                    "text-rose-700",
                    "text-violet-700",
                    "text-cyan-700",
                    "text-fuchsia-700",
                  ];
                  const colorIdx = idx % progressColors.length;
                  return (
                    <div key={kra.kraId || idx}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-bold text-slate-700 truncate max-w-[65%]">
                          {localizeString(
                            kra.kraName || `KRA ${kra.kraId}`,
                            language,
                          )}
                        </span>
                        <span
                          className={`text-xs font-extrabold px-2 py-0.5 rounded-full ${bgColors[colorIdx]} ${textColors[colorIdx]}`}
                        >
                          {(Number(kra.achievementPercentage) || 0).toFixed(1)}%
                        </span>
                      </div>
                      <div className="relative h-3.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`absolute inset-y-0 left-0 bg-gradient-to-r ${progressColors[colorIdx]} rounded-full transition-all duration-700 ease-out`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-1 text-[10px] text-slate-400 font-medium">
                        <span>
                          {t("साध्य", "Ach")}:{" "}
                          {Number(kra.totalAchievement || 0).toFixed(1)}
                        </span>
                        <span>
                          {t("लक्ष्य", "Target")}:{" "}
                          {Number(kra.totalTarget || 0).toFixed(1)}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {kraWiseData.length === 0 && (
                  <p className="text-center text-slate-400 text-sm py-8">
                    {t("डेटा उपलब्ध नाही", "No data available")}
                  </p>
                )}
              </div>
            </SectionCard>
          </div>
        )}

        {/* ═══════ WEIGHTAGE PIE + LEADERBOARD ═══════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Weightage Pie */}
          <SectionCard>
            <div className="flex items-center gap-3 mb-5">
              <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 text-white flex items-center justify-center text-lg shadow-md">
                ⚖️
              </span>
              <h3 className="text-lg font-extrabold text-slate-800">
                {t("KRA भारांश", "KRA Weightage Distribution")}
              </h3>
            </div>
            {isLoading ? (
              <ChartLoadingState />
            ) : weightageDistribution.length === 0 ? (
              <ChartEmptyState
                title={t("डेटा उपलब्ध नाही", "No weightage data available")}
              />
            ) : (
              <div className="space-y-4">
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={weightageDistribution}
                      dataKey="weight"
                      nameKey="kraName"
                      cx="50%"
                      cy="50%"
                      startAngle={90}
                      endAngle={-270}
                      innerRadius={55}
                      outerRadius={112}
                      paddingAngle={3}
                      labelLine={false}
                      label={(d) => `${Number(d?.weight || 0).toFixed(0)}%`}
                      stroke="none"
                    >
                      {weightageDistribution.map((_, index) => (
                        <Cell
                          key={`wc-${index}`}
                          fill={getKraColor(weightageDistribution[index])}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: "12px",
                        border: "none",
                        boxShadow: "0 8px 20px rgb(0 0 0 / 0.08)",
                        fontSize: 12,
                      }}
                      formatter={(v, _n, props) => {
                        const name = localizeString(
                          props?.payload?.kraName || "",
                          language,
                        );
                        return [
                          `${Number(v || 0).toFixed(2)}%`,
                          name || t("KRA", "KRA"),
                        ];
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>

                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    {t("KRA तपशील", "KRA Details")}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                    {weightageDistribution.map((item, index) => (
                      <div
                        key={`weight-legend-${item?.kraId || index}`}
                        className="flex items-start gap-2 rounded-lg bg-white border border-slate-100 px-2.5 py-2"
                        title={localizeString(item?.kraName || "", language)}
                      >
                        <span
                          className="mt-1 inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: getKraColor(item),
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-700 leading-snug break-words">
                            {localizeString(item?.kraName || "-", language)}
                          </p>
                          <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                            {Number(item?.weight || 0).toFixed(2)}%
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </SectionCard>

          {/* Leaderboard */}
          <SectionCard className="overflow-hidden">
            <div className="flex items-center gap-3 mb-5">
              <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-500 text-white flex items-center justify-center text-lg shadow-md">
                🏅
              </span>
              <div>
                <h3 className="text-lg font-extrabold text-slate-800">
                  {t(
                    "चालू वर्ष KRA व मागील वर्ष KRA तुलना",
                    "Comparison of current year KRA vs previous year KRA",
                  )}
                </h3>
                <p className="text-xs text-slate-400 font-medium">
                  {t("वर्षनिहाय तुलना", "Year-wise comparison")}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gradient-to-r from-slate-50 to-slate-100">
                    <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      {getEntityLabel()}
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      {t(
                        "मागील वर्ष टक्केवारी",
                        previousFyLabel
                          ? `Previous Year Percentage (${previousFyLabel})`
                          : "Previous Year Percentage",
                      )}
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      {t(
                        "चालू वर्ष टक्केवारी",
                        currentFyLabel
                          ? `Current Year Percentage (${currentFyLabel})`
                          : "Current Year Percentage",
                      )}
                    </th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      {t("रँक", "Rank")}
                    </th>
                    <th className="px-4 py-3 text-center text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      {t("बदल", "Trend")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rankTable.map((row, idx) => {
                    const prev = Number(row.previousMonthPercentage) || 0;
                    const curr = Number(row.currentMonthPercentage) || 0;
                    const change = row.rankChange;
                    return (
                      <tr
                        key={row.entityId}
                        className={`hover:bg-indigo-50/40 transition-colors cursor-pointer ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}
                        onClick={() => handleEntityDrillDown(row)}
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-slate-700">
                          {row.name}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${getPercentBadgeClass(prev)}`}
                          >
                            {prev.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${getPercentBadgeClass(curr)}`}
                          >
                            {curr.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-extrabold">
                            {row.rank}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          {change === null || change === undefined ? (
                            <span className="text-slate-300 text-lg">—</span>
                          ) : change > 0 ? (
                            <span className="text-emerald-600 font-bold bg-emerald-50 px-2.5 py-1 rounded-full text-xs ring-1 ring-emerald-200">
                              ↑{change}
                            </span>
                          ) : change < 0 ? (
                            <span className="text-rose-600 font-bold bg-rose-50 px-2.5 py-1 rounded-full text-xs ring-1 ring-rose-200">
                              ↓{Math.abs(change)}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-bold text-xs">
                              —
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {rankTable.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="text-center py-8 text-slate-400 text-sm"
                      >
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-2xl">📊</span>
                          <span>
                            {t(
                              "निवडलेल्या कालावधीसाठी डेटा उपलब्ध नाही",
                              "No data available for the selected period",
                            )}
                          </span>
                          <span className="text-xs text-slate-300">
                            {t(
                              "कृपया फिल्टर बदलून पहा",
                              "Try changing filters or period",
                            )}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>

        {/* ═══════ CORPORATION-WISE PIE CHARTS ═══════ */}
        <SectionCard className="relative overflow-hidden">
          {/* decorative blobs */}
          <div className="absolute -right-16 -top-16 w-48 h-48 rounded-full bg-violet-100/50 blur-3xl pointer-events-none"></div>
          <div className="absolute -left-12 -bottom-12 w-40 h-40 rounded-full bg-indigo-100/50 blur-3xl pointer-events-none"></div>

          <div className="relative z-10 flex items-center gap-4 mb-6">
            <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 text-white flex items-center justify-center text-2xl shadow-lg">
              🏢
            </span>
            <div>
              <h3 className="text-xl font-extrabold text-slate-800">
                {t(
                  "महामंडळनिहाय KRA कामगिरी",
                  "Corporation-wise KRA Performance",
                )}
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                {t(
                  "प्रत्येक महामंडळासाठी KRA स्कोअर शेअर पाई चार्ट.",
                  "Score share breakdown per corporation.",
                )}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
            {isLoading ? (
              <div className="col-span-full grid grid-cols-1 md:grid-cols-2 gap-6">
                <ChartLoadingState />
                <ChartLoadingState />
              </div>
            ) : (
              corpKraPies.map((corp, corpIdx) => {
                const borderColors = [
                  "border-indigo-200",
                  "border-violet-200",
                  "border-cyan-200",
                  "border-amber-200",
                  "border-emerald-200",
                  "border-rose-200",
                ];
                const dotColors = [
                  "bg-indigo-500",
                  "bg-violet-500",
                  "bg-cyan-500",
                  "bg-amber-500",
                  "bg-emerald-500",
                  "bg-rose-500",
                ];
                return (
                  <div
                    key={corp.corporationId}
                    className={`border ${borderColors[corpIdx % borderColors.length]} rounded-2xl p-5 bg-white/80 backdrop-blur-sm hover:shadow-lg transition-all duration-300`}
                  >
                    <h4 className="text-base font-bold text-slate-700 mb-4 flex items-center gap-2">
                      <span
                        className={`w-3 h-3 rounded-full ${dotColors[corpIdx % dotColors.length]} inline-block`}
                      ></span>
                      {corp.corporationName}
                    </h4>
                    <ResponsiveContainer width="100%" height={320}>
                      <PieChart>
                        <Pie
                          data={corp.data || []}
                          dataKey="slicePercentage"
                          nameKey="kraName"
                          cx="50%"
                          cy="45%"
                          startAngle={90}
                          endAngle={-270}
                          innerRadius={40}
                          outerRadius={90}
                          paddingAngle={2}
                          stroke="none"
                          label={({ slicePercentage }) =>
                            `${Number(slicePercentage || 0).toFixed(1)}%`
                          }
                          labelLine={{ stroke: "#94a3b8", strokeWidth: 1 }}
                        >
                          {(corp.data || []).map((slice, index) => (
                            <Cell
                              key={`cell-${corp.corporationId}-${index}`}
                              fill={getKraColor(slice)}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            borderRadius: "12px",
                            border: "none",
                            boxShadow: "0 8px 20px rgb(0 0 0 / 0.08)",
                            fontSize: 12,
                          }}
                          formatter={(v, _n, props) => {
                            const p = props?.payload;
                            const ach = Number(p?.achievementPercentage || 0);
                            const w = Number(p?.weight || 0);
                            return [
                              `${Number(v || 0).toFixed(2)}% (Ach ${ach.toFixed(1)}%, W ${w})`,
                              t("स्कोअर शेअर", "Score share"),
                            ];
                          }}
                          labelFormatter={(label) =>
                            localizeString(label, language)
                          }
                        />
                        <Legend
                          iconType="circle"
                          wrapperStyle={{ fontSize: 11, fontWeight: 600 }}
                          formatter={(value) => localizeString(value, language)}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                );
              })
            )}
            {!isLoading && corpKraPies.length === 0 && (
              <div className="col-span-full text-center py-12 text-slate-400 text-sm">
                {t("डेटा उपलब्ध नाही", "No corporation data available")}
              </div>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
