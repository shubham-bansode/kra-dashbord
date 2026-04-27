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
  7: "#be185d",
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
  const p = capPercentage(percent);
  if (p > 70) return "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200";
  if (p >= 40) return "bg-amber-100 text-amber-700 ring-1 ring-amber-200";
  return "bg-red-100 text-red-700 ring-1 ring-red-200";
};

const toSafeNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const capPercentage = (value) => {
  const n = toSafeNumber(value, 0);
  return n > 100 ? 100 : n;
};

const formatDisplayPercentage = (value, digits = 1) =>
  `${capPercentage(value).toFixed(digits)}%`;

const clampPercent = (value) => {
  return toSafeNumber(value, 0);
};

const getNiceStep = (rawStep) => {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 10;
  const exponent = Math.floor(Math.log10(rawStep));
  const fraction = rawStep / 10 ** exponent;

  let niceFraction;
  if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 5) niceFraction = 5;
  else niceFraction = 10;

  return niceFraction * 10 ** exponent;
};

const buildDynamicPercentageAxis = (
  values,
  { desiredTicks = 6, minMax = 10, cap = 100 } = {},
) => {
  const numericValues = Array.isArray(values)
    ? values.map((v) => toSafeNumber(v, 0))
    : [];
  const maxValue = Math.max(0, ...numericValues);
  const paddedMax = maxValue > 0 ? maxValue * 1.12 : minMax;
  const boundedMax = Math.min(cap, Math.max(minMax, paddedMax));
  const step = getNiceStep(boundedMax / Math.max(desiredTicks - 1, 1));
  const axisMax = Math.ceil(boundedMax / step) * step;

  const ticks = [];
  for (let tick = 0; tick <= axisMax + step / 2; tick += step) {
    ticks.push(Number(tick.toFixed(4)));
  }

  return { max: axisMax, ticks };
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
    return {
      ...d,
      totalAchievement: achievement,
      totalTarget: target,
      label: `${d?.monthName || "M"} ${d?.year || ""}`.trim(),
      achievementPct:
        target > 0 ? Math.round((achievement / target) * 100 * 100) / 100 : 0,
    };
  });

const fiscalMonthIndex = (month) => {
  const m = Number(month || 0);
  if (!Number.isFinite(m) || m < 1 || m > 12) return 99;
  return m >= 6 ? m - 6 : m + 6;
};

const sortTrendByFinancialOrder = (rows = []) =>
  [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const aMonth = Number(a?.month || 0);
    const bMonth = Number(b?.month || 0);
    const aYear = Number(a?.year || 0);
    const bYear = Number(b?.year || 0);

    const aFiscalStart = aMonth >= 6 ? aYear : aYear - 1;
    const bFiscalStart = bMonth >= 6 ? bYear : bYear - 1;

    if (aFiscalStart !== bFiscalStart) return aFiscalStart - bFiscalStart;
    return fiscalMonthIndex(aMonth) - fiscalMonthIndex(bMonth);
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

const COMPARATIVE_LEVELS = [
  { value: "all", mr: "सर्व", en: "All" },
  { value: "corporation", mr: "महामंडळ", en: "Corporation" },
  { value: "region", mr: "विभाग", en: "Region" },
  { value: "circle", mr: "मंडळ", en: "Circle" },
  { value: "division", mr: "उपविभाग", en: "Division" },
];

const COMPARATIVE_MONTHS = [
  { value: "1", mr: "जानेवारी", en: "January" },
  { value: "2", mr: "फेब्रुवारी", en: "February" },
  { value: "3", mr: "मार्च", en: "March" },
  { value: "4", mr: "एप्रिल", en: "April" },
  { value: "5", mr: "मे", en: "May" },
  { value: "6", mr: "जून", en: "June" },
  { value: "7", mr: "जुलै", en: "July" },
  { value: "8", mr: "ऑगस्ट", en: "August" },
  { value: "9", mr: "सप्टेंबर", en: "September" },
  { value: "10", mr: "ऑक्टोबर", en: "October" },
  { value: "11", mr: "नोव्हेंबर", en: "November" },
  { value: "12", mr: "डिसेंबर", en: "December" },
];

const COMPARATIVE_QUARTERS = [
  { value: "1", mr: "Q1 (जून-ऑगस्ट)", en: "Q1 (Jun-Aug)" },
  { value: "2", mr: "Q2 (सप्टेंबर-नोव्हेंबर)", en: "Q2 (Sep-Nov)" },
  { value: "3", mr: "Q3 (डिसेंबर-फेब्रुवारी)", en: "Q3 (Dec-Feb)" },
  { value: "4", mr: "Q4 (मार्च-मे)", en: "Q4 (Mar-May)" },
];

const COMPARATIVE_PERFORMER_OPTIONS = [
  { value: "all", en: "All" },
  { value: "top-5", en: "Top 5" },
  { value: "top-10", en: "Top 10" },
  { value: "bottom-5", en: "Bottom 5" },
  { value: "bottom-10", en: "Bottom 10" },
];

function getFinancialYear(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  if (month >= 6) {
    return `${year}-${String(year + 1).slice(-2)}`;
  } else {
    return `${year - 1}-${String(year).slice(-2)}`;
  }
}

const getFinancialYearStart = (fyLabel) => {
  const match = String(fyLabel || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const startYear = Number(match[1]);
  return Number.isFinite(startYear) ? startYear : null;
};

const buildFinancialYearOptions = (existing = [], currentFy) => {
  const all = new Set(Array.isArray(existing) ? existing : []);
  all.add(currentFy);

  const currentStart = getFinancialYearStart(currentFy);
  if (Number.isFinite(currentStart)) {
    for (let y = currentStart - 3; y <= currentStart + 2; y += 1) {
      all.add(`${y}-${String(y + 1).slice(-2)}`);
    }
  }

  return [...all]
    .filter((label) => /^\d{4}-\d{2}$/.test(String(label)))
    .sort(
      (a, b) =>
        (getFinancialYearStart(b) || 0) - (getFinancialYearStart(a) || 0),
    );
};

const formatComparativeValue = (value, metric) => {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  if (metric === "completionPercentage" || metric === "efficiencyScore") {
    return formatDisplayPercentage(n, 1);
  }
  if (metric === "totalEntries") return n.toLocaleString("en-IN");
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
};

const truncateAxisLabel = (label, maxLen = 24) => {
  const text = String(label || "").trim();
  if (!text) return "-";
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
};

const toDivisionBarShortLabel = (label) => {
  const raw = String(label || "").trim();
  if (!raw) return "-";

  const afterComma = raw.includes(",")
    ? raw
        .split(",")
        .slice(1)
        .join(",")
        .trim()
    : raw;

  const [leftPart, rightPart] = afterComma.split(/\s-\s/, 2);
  const divisionPart = String(leftPart || "").trim();
  const placePart = String(rightPart || "")
    .replace(/\(.*?\)/g, "")
    .trim();

  const acronym = divisionPart
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const first = Array.from(word)[0];
      return first ? first.toUpperCase() : "";
    })
    .join("");

  if (!acronym) return raw;
  return placePart ? `${acronym} ${placePart}` : acronym;
};

const toDevanagariDigits = (value) =>
  String(value || "").replace(/\d/g, (digit) => "०१२३४५६७८९"[Number(digit)]);

const withCurrentKraYearLabel = (label, fyLabel, language) => {
  const text = String(label || "");
  const fy = String(fyLabel || "").trim();
  if (!text || !/^\d{4}-\d{2}$/.test(fy)) return text;

  const yearToken = language === "mr" ? toDevanagariDigits(fy) : fy;

  return text
    .replace(/[0-9]{4}-[0-9]{2}/g, fy)
    .replace(/[०-९]{4}-[०-९]{2}/g, toDevanagariDigits(fy))
    .replace(/सन\s*[0-9]{4}-[0-9]{2}/g, `सन ${toDevanagariDigits(fy)}`)
    .replace(/सन\s*[०-९]{4}-[०-९]{2}/g, `सन ${toDevanagariDigits(fy)}`)
    .replace(/FY\s*[0-9]{4}-[0-9]{2}/gi, `FY ${fy}`)
    .replace(
      /फायनान्शियल\s*इयर\s*[०-९0-9]{4}-[०-९0-9]{2}/gi,
      `फायनान्शियल इयर ${toDevanagariDigits(fy)}`,
    )
    .replace(/\((?:सन\s*)?[०-९0-9]{4}-[०-९0-9]{2}\)/g, `(${yearToken})`);
};

const createNonOverlappingPieLabel = ({ minGap = 14 } = {}) => {
  const usedLeftY = [];
  const usedRightY = [];
  const placements = new Map();

  const getPlacement = (props) => {
    const index = Number(props?.index);
    if (placements.has(index)) return placements.get(index);

    const value = capPercentage(
      Number(
        props?.displaySlicePercentage ??
          props?.slicePercentage ??
          Number(props?.percent || 0) * 100,
      ),
    );
    const cx = Number(props?.cx);
    const cy = Number(props?.cy);
    const outerRadius = Number(props?.outerRadius || 90);
    const midAngle = Number(props?.midAngle || 0);

    if (
      !Number.isFinite(value) ||
      !Number.isFinite(cx) ||
      !Number.isFinite(cy)
    ) {
      return null;
    }

    if (value <= 0) {
      return null;
    }

    const rad = (-midAngle * Math.PI) / 180;
    const rightSide = Math.cos(rad) >= 0;
    const rawY = cy + Math.sin(rad) * (outerRadius + 24);
    const labelX = cx + (rightSide ? outerRadius + 42 : -(outerRadius + 42));
    const topClamp = Math.max(12, cy - 125);
    const bottomClamp = cy + 125;

    const used = rightSide ? usedRightY : usedLeftY;
    let adjustedY = rawY;
    for (const prevY of used.sort((a, b) => a - b)) {
      if (Math.abs(adjustedY - prevY) < minGap) {
        adjustedY = prevY + minGap;
      }
    }
    adjustedY = Math.max(topClamp, Math.min(bottomClamp, adjustedY));
    used.push(adjustedY);

    const kraName = toCleanLabel(props?.payload?.displayKraName, "");
    const namePart = kraName ? truncateAxisLabel(kraName, 16) : "KRA";
    const textValue = `${value.toFixed(2)}%`;
    const labelText = `${namePart} ${textValue}`;

    const placement = {
      value,
      labelText,
      cx,
      cy,
      rightSide,
      textX: labelX,
      textY: adjustedY,
      anchorX: cx + Math.cos(rad) * (outerRadius + 8),
      anchorY: cy + Math.sin(rad) * (outerRadius + 8),
      bendX: cx + (rightSide ? outerRadius + 24 : -(outerRadius + 24)),
    };

    placements.set(index, placement);
    return placement;
  };

  return {
    label: (props) => {
      const placement = getPlacement(props);
      if (!placement) return null;

      return (
        <text
          x={placement.textX}
          y={placement.textY}
          fill="#0f172a"
          fontSize={11}
          fontWeight={700}
          textAnchor={placement.rightSide ? "start" : "end"}
          dominantBaseline="central"
        >
          {placement.labelText}
        </text>
      );
    },
    labelLine: (props) => {
      const placement = getPlacement(props);
      if (!placement) return null;

      const endX = placement.textX + (placement.rightSide ? -5 : 5);
      return (
        <path
          d={`M ${placement.anchorX} ${placement.anchorY} L ${placement.bendX} ${placement.textY} L ${endX} ${placement.textY}`}
          fill="none"
          stroke="#94a3b8"
          strokeWidth={1}
        />
      );
    },
  };
};

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
  const currentFinancialYear = getFinancialYear(new Date());
  const [activeDashboardTab, setActiveDashboardTab] = useState("overview");
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
    kraYear: currentFinancialYear,
    period: "", // month number string: "1" to "12"
    kra: "",
  });

  const [comparativeFilters, setComparativeFilters] = useState({
    level: "all",
    metric: "completionPercentage",
    year: currentFinancialYear,
    month: "",
    quarter: "",
    sortOrder: "top",
    topN: "5",
  });

  const [comparativeData, setComparativeData] = useState({
    level: "all",
    metric: "completionPercentage",
    timeRange: "year",
    sortOrder: "top",
    period: null,
    topN: 5,
    page: 1,
    perPage: 5,
    totalCount: 0,
    topPerformers: [],
    leaderboard: [],
    risingPerformer: null,
    needsAttention: null,
  });
  const [isComparativeLoading, setIsComparativeLoading] = useState(false);

  const comparativeNonZeroCount = (comparativeData?.topPerformers || []).filter(
    (row) => Number(row?.metricValue || 0) > 0,
  ).length;

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

  const parsePeriod = (periodKey, kraYear) => {
    if (!periodKey) return { month: undefined, year: undefined };

    // Backward compatibility for any existing "YYYY-MM" filter values.
    if (String(periodKey).includes("-")) {
      const [y, m] = String(periodKey).split("-");
      const year = parseInt(y, 10);
      const month = parseInt(m, 10);
      return {
        year: Number.isFinite(year) ? year : undefined,
        month: Number.isFinite(month) ? month : undefined,
      };
    }

    const month = parseInt(String(periodKey), 10);
    if (!Number.isFinite(month)) return { month: undefined, year: undefined };

    const fyStart = getFyStartYear(kraYear);
    if (!Number.isFinite(fyStart)) return { month, year: undefined };

    // Financial year runs Jun-May.
    const year = month >= 6 ? fyStart : fyStart + 1;
    return { month, year };
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

      const { month, year } = parsePeriod(filters.period, filters.kraYear);
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

      // Pie section should respect selected hierarchy filters as well.
      const corpPieParams = {};
      if (filters.corporation) corpPieParams.corporation = filters.corporation;
      if (filters.region) corpPieParams.region = filters.region;
      if (filters.circle) corpPieParams.circle = filters.circle;
      if (filters.division) corpPieParams.division = filters.division;
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

      // Monthly trend with month-wise achievement percentage.
      const trendRows = normalizeTrendRows(trendRaw);
      setMonthlyTrend(trendRows);

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
      kraYear: currentFinancialYear,
      period: "",
      kra: "",
    });
  };

  useEffect(() => {
    if (!comparativeFilters.year) return;
    setFilters((prev) => {
      if (prev.kraYear === comparativeFilters.year) return prev;
      return {
        ...prev,
        kraYear: comparativeFilters.year,
        period: "",
      };
    });
  }, [comparativeFilters.year]);

  const fetchComparativeData = async () => {
    setIsComparativeLoading(true);
    try {
      const filterParams = {};
      const selectedFinancialYear =
        comparativeFilters.year || getFinancialYear(new Date());
      const selectedFinancialYearStart =
        getFinancialYearStart(selectedFinancialYear) ||
        getFinancialYearStart(getFinancialYear(new Date()));

      filterParams.kraYear = selectedFinancialYear;

      filterParams.level = comparativeFilters.level;
      filterParams.metric = "completionPercentage";
      filterParams.sortOrder = comparativeFilters.sortOrder;
      filterParams.topN = comparativeFilters.topN;

      const hasMonth = Boolean(comparativeFilters.month);
      const hasQuarter = Boolean(comparativeFilters.quarter);

      if (hasMonth) {
        filterParams.timeRange = "month";
        filterParams.month = comparativeFilters.month;
        filterParams.year =
          Number(comparativeFilters.month) >= 6
            ? selectedFinancialYearStart
            : selectedFinancialYearStart + 1;
      } else if (hasQuarter) {
        filterParams.timeRange = "quarter";
        filterParams.quarter = comparativeFilters.quarter;
        filterParams.year = selectedFinancialYearStart;
      } else {
        filterParams.timeRange = "year";
      }

      const res = await dashboardApi.getComparativeAnalysis(filterParams);
      setComparativeData(
        res?.data?.data || {
          level: comparativeFilters.level,
          metric: "completionPercentage",
          timeRange: filterParams.timeRange,
          sortOrder: comparativeFilters.sortOrder,
          period: null,
          topN: Number(comparativeFilters.topN || 5),
          page: 1,
          perPage: Number(comparativeFilters.topN || 5),
          totalCount: 0,
          topPerformers: [],
          leaderboard: [],
          risingPerformer: null,
          needsAttention: null,
        },
      );
    } catch (error) {
      console.error("Error fetching comparative analysis:", error);
      setComparativeData((prev) => ({
        ...prev,
        topPerformers: [],
        leaderboard: [],
        risingPerformer: null,
        needsAttention: null,
      }));
    } finally {
      setIsComparativeLoading(false);
    }
  };

  useEffect(() => {
    if (activeDashboardTab !== "comparative") return;
    fetchComparativeData();
  }, [activeDashboardTab, comparativeFilters]);

  if (isLoading && !summary) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50/30 to-violet-50/20">
        <LoadingSpinner />
      </div>
    );
  }

  const displayTopBars = topBars.map((item) => ({
    ...item,
    achievementPercentage: capPercentage(item?.achievementPercentage),
  }));
  const topPerformerAxis = buildDynamicPercentageAxis(
    displayTopBars.map((x) => x.achievementPercentage),
  );
  const currentComparativeFinancialYear = getFinancialYear(new Date());
  const comparativeYearOptions = buildFinancialYearOptions(
    kraYears,
    currentComparativeFinancialYear,
  );
  const displayBottomBars = bottomBars.map((item) => ({
    ...item,
    achievementPercentage: capPercentage(item?.achievementPercentage),
  }));
  const isDivisionGroupedBar = getGroupByForSelection() === "division";
  const formatBarChartEntityName = (name) =>
    isDivisionGroupedBar ? toDivisionBarShortLabel(name) : name;
  const bottomPerformerAxis = buildDynamicPercentageAxis(
    displayBottomBars.map((x) => x.achievementPercentage),
  );
  const displayMonthlyTrend = monthlyTrend.map((item) => ({
    ...item,
    achievementPct: capPercentage(item?.achievementPct),
  }));
  const orderedMonthlyTrend = sortTrendByFinancialOrder(displayMonthlyTrend);
  const monthlyTrendAxis = buildDynamicPercentageAxis(
    orderedMonthlyTrend.map((x) => x.achievementPct),
  );
  const displayRankTable = rankTable.map((row) => ({
    ...row,
    previousMonthPercentage: capPercentage(row?.previousMonthPercentage),
    currentMonthPercentage: capPercentage(row?.currentMonthPercentage),
  }));
  const activeKraYearLabel = filters.kraYear || currentFinancialYear;
  const getDisplayKraLabel = (label) =>
    withCurrentKraYearLabel(
      localizeString(label || "-", language),
      activeKraYearLabel,
      language,
    );

  const displayWeightageDistribution = weightageDistribution.map((item) => ({
    ...item,
    displayWeight: capPercentage(item?.weight),
    displayKraName: getDisplayKraLabel(item?.kraName || "-"),
  }));
  const displayCorpKraPies = corpKraPies.map((corp) => ({
    ...corp,
    data: (corp?.data || []).map((slice) => ({
      ...slice,
      displaySlicePercentage: capPercentage(slice?.slicePercentage),
      displayAchievementPercentage: capPercentage(slice?.achievementPercentage),
      displayWeight: capPercentage(slice?.weight),
      displayKraName: getDisplayKraLabel(slice?.kraName || "-"),
    })),
  }));

  const pieScopeGroup = getGroupByForSelection();
  const pieScopeTitle =
    pieScopeGroup === "division"
      ? t("उपविभागनिहाय KRA कामगिरी", "Division-wise KRA Performance")
      : pieScopeGroup === "circle"
        ? t("मंडळनिहाय KRA कामगिरी", "Circle-wise KRA Performance")
        : pieScopeGroup === "region"
          ? t("विभागनिहाय KRA कामगिरी", "Region-wise KRA Performance")
          : t("महामंडळनिहाय KRA कामगिरी", "Corporation-wise KRA Performance");

  const pieScopeSubtitle =
    pieScopeGroup === "division"
      ? t(
          "निवडलेल्या मंडळातील उपविभागांसाठी KRA स्कोअर शेअर पाई चार्ट.",
          "Score share breakdown across divisions in selected circle.",
        )
      : pieScopeGroup === "circle"
        ? t(
            "निवडलेल्या विभागातील मंडळांसाठी KRA स्कोअर शेअर पाई चार्ट.",
            "Score share breakdown across circles in selected region.",
          )
        : pieScopeGroup === "region"
          ? t(
              "निवडलेल्या महामंडळातील विभागांसाठी KRA स्कोअर शेअर पाई चार्ट.",
              "Score share breakdown across regions in selected corporation.",
            )
          : t(
              "प्रत्येक महामंडळासाठी KRA स्कोअर शेअर पाई चार्ट.",
              "Score share breakdown per corporation.",
            );

  const isComparativePercentMetric =
    comparativeFilters.metric === "completionPercentage" ||
    comparativeFilters.metric === "efficiencyScore";
  const isComparativeDivisionLevel = comparativeFilters.level === "division";
  const formatComparativeBarEntityName = (name) => {
    if (isComparativeDivisionLevel) {
      return toDivisionBarShortLabel(name);
    }
    return truncateAxisLabel(name, 26);
  };
  const comparativeRows = (comparativeData?.topPerformers || []).map((row) => ({
    ...row,
    metricValue: isComparativePercentMetric
      ? capPercentage(row?.metricValue)
      : toSafeNumber(row?.metricValue),
  }));

  const comparativeChartHeight = Math.max(340, comparativeRows.length * 46);

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
                  "KRA Performance Performance & Analytics Overview",
                )}
              </p>
            </div>

            <div />
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2 font-semibold">
            <span className="inline-block h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
            {t("डेटा अद्ययावत होत आहे...", "Refreshing dashboard data...")}
          </div>
        )}

        <SectionCard>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveDashboardTab("overview")}
              className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                activeDashboardTab === "overview"
                  ? "bg-indigo-600 text-white shadow"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t("मुख्य डॅशबोर्ड", "Main Dashboard")}
            </button>
            <button
              type="button"
              onClick={() => setActiveDashboardTab("comparative")}
              className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                activeDashboardTab === "comparative"
                  ? "bg-indigo-600 text-white shadow"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t("तुलनात्मक विश्लेषण", "Comparative Analysis")}
            </button>
          </div>
        </SectionCard>

        {activeDashboardTab === "overview" && (
          <>
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
                    onChange={(e) =>
                      handleFilterChange("region", e.target.value)
                    }
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
                    onChange={(e) =>
                      handleFilterChange("circle", e.target.value)
                    }
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
                    onChange={(e) =>
                      handleFilterChange("division", e.target.value)
                    }
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
                    onChange={(e) =>
                      handleFilterChange("kraYear", e.target.value)
                    }
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
                    onChange={(e) =>
                      handleFilterChange("period", e.target.value)
                    }
                  >
                    <option value="">{t("सर्व", "All")}</option>
                    {COMPARATIVE_MONTHS.map((month) => (
                      <option key={month.value} value={month.value}>
                        {t(month.mr, month.en)}
                      </option>
                    ))}
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
          </>
        )}

        {activeDashboardTab === "overview" && (
          <>
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
                      {t("एकूण टॉप परफॉर्मर्स", "KRA Ranking Top Performer")}
                    </h3>
                    <p className="text-xs text-slate-400 font-medium">
                      {getEntityLabel()}{" "}
                      {t("नुसार साध्य %", "wise Achievement %")}
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
                      data={displayTopBars}
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
                            <stop
                              offset="100%"
                              stopColor={c}
                              stopOpacity={0.6}
                            />
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
                        tickFormatter={formatBarChartEntityName}
                        tick={{
                          fill: "#64748b",
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                        axisLine={{ stroke: "#000000", strokeWidth: 3 }}
                        tickLine={false}
                      />
                      <YAxis
                        domain={[0, topPerformerAxis.max]}
                        ticks={topPerformerAxis.ticks}
                        allowDecimals={false}
                        tick={{ fill: "#94a3b8", fontSize: 11 }}
                        axisLine={{ stroke: "#000000", strokeWidth: 3 }}
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
                        labelFormatter={formatBarChartEntityName}
                        formatter={(v) => [
                          formatDisplayPercentage(v, 2),
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
                          formatter={(value) =>
                            formatDisplayPercentage(value, 1)
                          }
                          style={{
                            fill: "#334155",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        />
                        {displayTopBars.map((_, i) => (
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
                  {t(
                    "बारवर क्लिक करा ड्रिल-डाउनसाठी",
                    "Click a bar to drill down",
                  )}
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
                      {t(
                        "एकूण बॉटम परफॉर्मर्स",
                        "KRA Ranking Bottom Performer",
                      )}
                    </h3>
                    <p className="text-xs text-slate-400 font-medium">
                      {getEntityLabel()}{" "}
                      {t("नुसार साध्य %", "wise Achievement %")}
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
                      data={displayBottomBars}
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
                            <stop
                              offset="100%"
                              stopColor={c}
                              stopOpacity={0.6}
                            />
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
                        tickFormatter={formatBarChartEntityName}
                        tick={{
                          fill: "#64748b",
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                        axisLine={{ stroke: "#000000", strokeWidth: 3 }}
                        tickLine={false}
                      />
                      <YAxis
                        domain={[0, bottomPerformerAxis.max]}
                        ticks={bottomPerformerAxis.ticks}
                        allowDecimals={false}
                        tick={{ fill: "#94a3b8", fontSize: 11 }}
                        axisLine={{ stroke: "#000000", strokeWidth: 3 }}
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
                        labelFormatter={formatBarChartEntityName}
                        formatter={(v) => [
                          formatDisplayPercentage(v, 2),
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
                          formatter={(value) =>
                            formatDisplayPercentage(value, 1)
                          }
                          style={{
                            fill: "#334155",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        />
                        {displayBottomBars.map((_, i) => (
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
                  {t(
                    "बारवर क्लिक करा ड्रिल-डाउनसाठी",
                    "Click a bar to drill down",
                  )}
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

            {/* ═══════ COMPARISON + KRA PROGRESS ═══════ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Leaderboard */}
              <SectionCard className="overflow-hidden">
                <div className="flex items-center gap-3 mb-5">
                  <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-500 text-white flex items-center justify-center text-lg shadow-md">
                    🏅
                  </span>
                  <div>
                    <h3 className="text-lg font-extrabold text-slate-800">
                      {t(
                        "चालू KRA व मागील KRA तुलना",
                        "Comparison of current KRA vs previous KRA",
                      )}
                    </h3>
                    <p className="text-xs text-slate-400 font-medium">
                      {t("महिनानिहाय तुलना", "Month-wise comparison")}
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
                          {t("मागील महिना %", "Previous Month %")}
                        </th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                          {t("चालू महिना %", "Current Month %")}
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
                      {displayRankTable.map((row, idx) => {
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
                                {formatDisplayPercentage(prev, 1)}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right">
                              <span
                                className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${getPercentBadgeClass(curr)}`}
                              >
                                {formatDisplayPercentage(curr, 1)}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right">
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-extrabold">
                                {row.rank}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-center">
                              {change === null || change === undefined ? (
                                <span className="text-slate-300 text-lg">
                                  —
                                </span>
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
                    const pct = capPercentage(kra.achievementPercentage);
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
                            {getDisplayKraLabel(
                              kra.kraName || `KRA ${kra.kraId}`,
                            )}
                          </span>
                          <span
                            className={`text-xs font-extrabold px-2 py-0.5 rounded-full ${bgColors[colorIdx]} ${textColors[colorIdx]}`}
                          >
                            {formatDisplayPercentage(
                              kra.achievementPercentage,
                              1,
                            )}
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
                  {kraWiseData.length > 0 &&
                    (() => {
                      const overallAverage =
                        kraWiseData.reduce(
                          (sum, kra) =>
                            sum + (Number(kra.achievementPercentage) || 0),
                          0,
                        ) / kraWiseData.length;
                      const overallPct = capPercentage(overallAverage);

                      return (
                        <div className="pt-3 mt-2 border-t border-slate-200">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm font-extrabold text-slate-800 truncate max-w-[65%]">
                              {t("एकूण साध्य", "Overall Achivments")}
                            </span>
                            <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-slate-200 text-slate-800">
                              {formatDisplayPercentage(overallAverage, 1)}
                            </span>
                          </div>
                          <div className="relative h-3.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="absolute inset-y-0 left-0 bg-gradient-to-r from-slate-700 to-slate-500 rounded-full transition-all duration-700 ease-out"
                              style={{ width: `${overallPct}%` }}
                            />
                          </div>
                          <div className="flex justify-between mt-1 text-[10px] text-slate-400 font-medium">
                            <span>{t("सरासरी %", "Average %")}</span>
                            <span>{t("सर्व KRA", "All KRAs")}</span>
                          </div>
                        </div>
                      );
                    })()}
                  {kraWiseData.length === 0 && (
                    <p className="text-center text-slate-400 text-sm py-8">
                      {t("डेटा उपलब्ध नाही", "No data available")}
                    </p>
                  )}
                </div>
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
                      "महिन्यानुसार साध्य टक्केवारीचा कल",
                      "Month-wise achievement percentage trend",
                    )}
                  </p>
                </div>
              </div>
              {isLoading ? (
                <ChartLoadingState />
              ) : monthlyTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart
                    data={orderedMonthlyTrend}
                    margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      type="category"
                      dataKey="label"
                      tick={{ fill: "#64748b", fontSize: 11, fontWeight: 600 }}
                      axisLine={{ stroke: "#000000", strokeWidth: 3 }}
                      tickLine={false}
                    />
                    <YAxis
                      type="number"
                      domain={[0, monthlyTrendAxis.max]}
                      ticks={monthlyTrendAxis.ticks}
                      allowDecimals={false}
                      tickFormatter={(v) => formatDisplayPercentage(v, 0)}
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                      axisLine={{ stroke: "#000000", strokeWidth: 3 }}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "12px",
                        border: "none",
                        boxShadow: "0 10px 25px -5px rgb(0 0 0 / 0.1)",
                        fontSize: 13,
                      }}
                      formatter={(v) => [
                        formatDisplayPercentage(v, 2),
                        t("साध्य टक्केवारी", "Achievement %"),
                      ]}
                    />
                    <Legend
                      iconType="circle"
                      wrapperStyle={{ fontSize: 12, fontWeight: 600 }}
                      formatter={() => t("साध्य टक्केवारी", "Achievement %")}
                    />
                    <Line
                      type="monotone"
                      dataKey="achievementPct"
                      name={t("साध्य टक्केवारी", "Achievement %")}
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

            {/* ═══════ WEIGHTAGE PIE ═══════ */}
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
                        data={displayWeightageDistribution}
                        dataKey="displayWeight"
                        nameKey="kraName"
                        cx="50%"
                        cy="50%"
                        startAngle={90}
                        endAngle={-270}
                        innerRadius={55}
                        outerRadius={112}
                        paddingAngle={3}
                        labelLine={false}
                        label={(d) =>
                          formatDisplayPercentage(d?.displayWeight, 0)
                        }
                        stroke="none"
                      >
                        {displayWeightageDistribution.map((_, index) => (
                          <Cell
                            key={`wc-${index}`}
                            fill={getKraColor(
                              displayWeightageDistribution[index],
                            )}
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
                          const name =
                            props?.payload?.displayKraName ||
                            getDisplayKraLabel(props?.payload?.kraName || "");
                          return [
                            formatDisplayPercentage(v, 2),
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
                      {displayWeightageDistribution.map((item, index) => (
                        <div
                          key={`weight-legend-${item?.kraId || index}`}
                          className="flex items-start gap-2 rounded-lg bg-white border border-slate-100 px-2.5 py-2"
                          title={item?.displayKraName || ""}
                        >
                          <span
                            className="mt-1 inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                            style={{
                              backgroundColor: getKraColor(item),
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-slate-700 leading-snug break-words">
                              {item?.displayKraName || "-"}
                            </p>
                            <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                              {formatDisplayPercentage(item?.displayWeight, 2)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </SectionCard>

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
                    {pieScopeTitle}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    {pieScopeSubtitle}
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
                  displayCorpKraPies.map((corp, corpIdx) => {
                    const slices = corp?.data || [];
                    const corpPieLabel = createNonOverlappingPieLabel({
                      minGap: 13,
                    });
                    const chartSlices = slices.map((slice) => {
                      const raw = Number(slice?.displaySlicePercentage || 0);
                      return {
                        ...slice,
                        chartSlicePercentage: raw > 0 ? raw : 0.08,
                      };
                    });
                    return (
                      <div
                        key={corp.corporationId || corpIdx}
                        className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/70 p-4 shadow-sm hover:shadow-md transition-all duration-300"
                      >
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <h4 className="text-sm md:text-base font-extrabold text-slate-700 truncate">
                            {corp.corporationName}
                          </h4>
                          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 bg-slate-200/70 px-2 py-1 rounded-full">
                            {t("वेटेड योगदान", "Weighted Contribution")}
                          </span>
                        </div>

                        <div className="rounded-xl bg-white border border-slate-100 p-2">
                          <ResponsiveContainer width="100%" height={280}>
                            <PieChart
                              margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                            >
                              <Pie
                                data={chartSlices}
                                dataKey="chartSlicePercentage"
                                nameKey="kraName"
                                cx="50%"
                                cy="50%"
                                startAngle={90}
                                endAngle={-270}
                                innerRadius={55}
                                outerRadius={108}
                                paddingAngle={3}
                                stroke="none"
                                label={corpPieLabel.label}
                                labelLine={corpPieLabel.labelLine}
                              >
                                {slices.map((slice, index) => (
                                  <Cell
                                    key={`cell-${corp.corporationId}-${index}`}
                                    fill={
                                      Number(
                                        slice?.displaySlicePercentage || 0,
                                      ) <= 0
                                        ? "#000000"
                                        : getKraColor(slice)
                                    }
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
                                  const contribution = capPercentage(
                                    p?.displaySlicePercentage,
                                  );
                                  return [
                                    formatDisplayPercentage(contribution, 2),
                                    t(
                                      "वेटेड योगदान टक्केवारी",
                                      "Weighted Contribution Percentage",
                                    ),
                                  ];
                                }}
                                labelFormatter={(label) =>
                                  getDisplayKraLabel(label)
                                }
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 mt-1">
                          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                            {t("KRA तपशील", "KRA Details")}
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {slices.map((slice, index) => (
                              <div
                                key={`corp-kra-detail-${corp.corporationId || corpIdx}-${slice?.kraId || index}`}
                                className="flex items-start gap-2 rounded-lg bg-white border border-slate-100 px-2.5 py-2"
                                title={slice?.displayKraName || ""}
                              >
                                <span
                                  className="mt-1 inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                                  style={{
                                    backgroundColor:
                                      Number(
                                        slice?.displaySlicePercentage || 0,
                                      ) <= 0
                                        ? "#000000"
                                        : getKraColor(slice),
                                  }}
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-semibold text-slate-700 leading-snug break-words">
                                    {slice?.displayKraName || "-"}
                                  </p>
                                  <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                                    {t(
                                      "वेटेड योगदान टक्केवारी",
                                      "Weighted Contribution Percentage",
                                    )}
                                    :{" "}
                                    {formatDisplayPercentage(
                                      slice?.displaySlicePercentage,
                                      2,
                                    )}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                {!isLoading && corpKraPies.length === 0 && (
                  <div className="col-span-full text-center py-12 text-slate-400 text-sm">
                    {t("डेटा उपलब्ध नाही", "No pie-chart data available")}
                  </div>
                )}
              </div>
            </SectionCard>
          </>
        )}

        {activeDashboardTab === "comparative" && (
          <>
            <SectionCard>
              <div className="flex items-center gap-3 mb-5">
                <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center text-lg shadow-md">
                  🧭
                </span>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-800">
                    {t("तुलनात्मक फिल्टर", "Comparative Filters")}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    {t(
                      "स्तर व आर्थिक वर्ष निवडा",
                      "Select level and financial year",
                    )}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    {t("तुलना स्तर", "Comparison Level")}
                  </label>
                  <select
                    value={comparativeFilters.level}
                    onChange={(e) =>
                      setComparativeFilters((prev) => ({
                        ...prev,
                        level: e.target.value,
                      }))
                    }
                    className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition"
                  >
                    {COMPARATIVE_LEVELS.map((level) => (
                      <option key={level.value} value={level.value}>
                        {t(level.mr, level.en)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    {t("वर्ष", "Year")}
                  </label>
                  <select
                    value={comparativeFilters.year}
                    onChange={(e) =>
                      setComparativeFilters((prev) => ({
                        ...prev,
                        year: e.target.value,
                      }))
                    }
                    className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition"
                  >
                    {comparativeYearOptions.map((fy) => (
                      <option key={fy} value={fy}>
                        {fy}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    {t("KRA परफॉर्मर्स", "KRA Performers")}
                  </label>
                  <select
                    value={
                      comparativeFilters.topN === "all"
                        ? "all"
                        : `${comparativeFilters.sortOrder}-${comparativeFilters.topN}`
                    }
                    onChange={(e) =>
                      setComparativeFilters((prev) => {
                        if (e.target.value === "all") {
                          return {
                            ...prev,
                            sortOrder: "top",
                            topN: "all",
                          };
                        }

                        return {
                          ...prev,
                          sortOrder: e.target.value.startsWith("bottom")
                            ? "bottom"
                            : "top",
                          topN: e.target.value.endsWith("10") ? "10" : "5",
                        };
                      })
                    }
                    className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition"
                  >
                    {COMPARATIVE_PERFORMER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.en}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    {t("महिना", "Month")}
                  </label>
                  <select
                    value={comparativeFilters.month}
                    onChange={(e) =>
                      setComparativeFilters((prev) => ({
                        ...prev,
                        month: e.target.value,
                        quarter: e.target.value ? "" : prev.quarter,
                      }))
                    }
                    className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition"
                  >
                    <option value="">{t("सर्व", "All")}</option>
                    {COMPARATIVE_MONTHS.map((month) => (
                      <option key={month.value} value={month.value}>
                        {t(month.mr, month.en)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    {t("तिमाही", "Quarter")}
                  </label>
                  <select
                    value={comparativeFilters.quarter}
                    onChange={(e) =>
                      setComparativeFilters((prev) => ({
                        ...prev,
                        quarter: e.target.value,
                        month: e.target.value ? "" : prev.month,
                      }))
                    }
                    className="w-full text-sm px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition"
                  >
                    <option value="">{t("सर्व", "All")}</option>
                    {COMPARATIVE_QUARTERS.map((quarter) => (
                      <option key={quarter.value} value={quarter.value}>
                        {t(quarter.mr, quarter.en)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </SectionCard>

            <div className="grid grid-cols-1 gap-6">
              <SectionCard>
                <div className="flex items-center justify-between gap-3 mb-5">
                  <div>
                    <h3 className="text-lg font-extrabold text-slate-800">
                      {t("KRA परफॉर्मर तुलना", "KRA Performer Comparision")}
                    </h3>
                    <p className="text-xs text-slate-400 font-medium">
                      {t(
                        "निवडलेल्या पूर्णता टक्केवारीनुसार परफॉर्मर्स",
                        "Performers by selected completion percentage",
                      )}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
                    {comparativeData?.period?.currentLabel ||
                      t("चालू", "Current")}
                  </span>
                </div>

                {isComparativeLoading ? (
                  <ChartLoadingState />
                ) : (comparativeData?.topPerformers || []).length === 0 ? (
                  <ChartEmptyState
                    title={t(
                      "तुलनात्मक डेटा उपलब्ध नाही",
                      "No comparative data available",
                    )}
                  />
                ) : (
                  <div className="space-y-3">
                    {comparativeNonZeroCount <
                      (comparativeData?.topPerformers || []).length && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                        {t(
                          "निवडलेल्या कालावधीत काही महामंडळांची नोंद ० आहे. अधिक संपूर्ण तुलना पाहण्यासाठी Year निवडा.",
                          "Some entities are 0 in the selected window. Choose Year for a fuller comparison.",
                        )}
                      </div>
                    )}

                    <ResponsiveContainer
                      width="100%"
                      height={comparativeChartHeight}
                    >
                      <BarChart
                        data={comparativeRows}
                        layout="vertical"
                        margin={{ top: 16, right: 30, left: 8, bottom: 6 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          horizontal={false}
                          stroke="#e2e8f0"
                        />
                        <XAxis
                          type="number"
                          tick={{
                            fill: "#94a3b8",
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                          axisLine={{ stroke: "#000000", strokeWidth: 3 }}
                          tickLine={false}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={210}
                          tick={{
                            fill: "#64748b",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                          tickFormatter={formatComparativeBarEntityName}
                          axisLine={{ stroke: "#000000", strokeWidth: 3 }}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: "12px",
                            border: "none",
                            boxShadow: "0 8px 20px rgb(0 0 0 / 0.08)",
                            fontSize: 12,
                          }}
                          formatter={(v) => [
                            formatComparativeValue(
                              v,
                              comparativeFilters.metric,
                            ),
                            t("मेट्रिक मूल्य", "Metric Value"),
                          ]}
                          labelFormatter={formatComparativeBarEntityName}
                        />
                        <Bar dataKey="metricValue" radius={[0, 8, 8, 0]}>
                          <LabelList
                            dataKey="metricValue"
                            position="right"
                            formatter={(value) =>
                              formatComparativeValue(
                                value,
                                comparativeFilters.metric,
                              )
                            }
                            style={{
                              fill: "#334155",
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          />
                          {comparativeRows.map((row, idx) => {
                            const tone =
                              idx === 0
                                ? "#f59e0b"
                                : idx === 1
                                  ? "#94a3b8"
                                  : idx === 2
                                    ? "#d97706"
                                    : "#6366f1";
                            return (
                              <Cell key={row.entityId || idx} fill={tone} />
                            );
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </SectionCard>
            </div>

            <SectionCard className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 mb-5">
                <h3 className="text-lg font-extrabold text-slate-800">
                  {t("KRA परफॉर्मन्स तक्ता", "KRA Performace in table form")}
                </h3>
                <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
                  {t("एकूण", "Total")}:{" "}
                  {Number(comparativeData?.totalCount || 0).toLocaleString(
                    "en-IN",
                  )}
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gradient-to-r from-slate-50 to-slate-100">
                      <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        {t("रँक", "Rank")}
                      </th>
                      <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        {t("कार्यालयाचे नाव", "Name of Office")}
                      </th>
                      <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        {t("KRA साध्य", "KRA Achivement")}
                      </th>
                      <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        {t("प्रगती", "Progress")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(comparativeData?.leaderboard || []).map((row, idx) => {
                      const completion = capPercentage(
                        row?.completionPercentage,
                      );
                      return (
                        <tr
                          key={row.entityId || idx}
                          className={
                            idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                          }
                        >
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center justify-center min-w-8 h-8 rounded-full text-xs font-extrabold ${
                                row.rank === 1
                                  ? "bg-amber-100 text-amber-700"
                                  : row.rank === 2
                                    ? "bg-slate-200 text-slate-700"
                                    : row.rank === 3
                                      ? "bg-orange-100 text-orange-700"
                                      : "bg-indigo-100 text-indigo-700"
                              }`}
                            >
                              {row.rank === 1
                                ? "🥇"
                                : row.rank === 2
                                  ? "🥈"
                                  : row.rank === 3
                                    ? "🥉"
                                    : row.rank}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-slate-700">
                            {row.name}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-bold text-slate-800">
                            {formatComparativeValue(
                              row.metricValue,
                              comparativeFilters.metric,
                            )}
                          </td>
                          <td className="px-4 py-3 min-w-[220px]">
                            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  completion >= 70
                                    ? "bg-emerald-500"
                                    : completion >= 40
                                      ? "bg-amber-500"
                                      : "bg-rose-500"
                                }`}
                                style={{
                                  width: `${Math.min(completion, 100)}%`,
                                }}
                              />
                            </div>
                            <p className="mt-1 text-[11px] font-semibold text-slate-500">
                              {t("पूर्णता", "Completion")}:{" "}
                              {formatDisplayPercentage(completion, 1)}
                            </p>
                          </td>
                        </tr>
                      );
                    })}
                    {(comparativeData?.leaderboard || []).length === 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="text-center py-8 text-slate-400 text-sm"
                        >
                          {t(
                            "निवडलेल्या फिल्टरसाठी डेटा उपलब्ध नाही",
                            "No data available for selected filters",
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </>
        )}
      </div>
    </div>
  );
}
