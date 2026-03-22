import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { dashboardApi } from "../services/api";
import { useLanguage } from "../i18n/LanguageContext";

const COLORS = ["#0f766e", "#0ea5e9", "#f59e0b", "#ef4444", "#8b5cf6"];

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const asPct = (n) => `${toNum(n).toFixed(1)}%`;

const csvFromRows = (rows) => {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (val) => `"${String(val ?? "").replace(/"/g, '""')}"`;
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => esc(row[h])).join(",")),
  ].join("\n");
};

const downloadText = (text, filename, mime = "text/plain") => {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

function InsightCard({ title, value, note, tone = "slate" }) {
  const toneMap = {
    slate: "from-slate-100 to-slate-50 text-slate-800",
    teal: "from-teal-100 to-cyan-50 text-teal-900",
    amber: "from-amber-100 to-orange-50 text-amber-900",
    rose: "from-rose-100 to-pink-50 text-rose-900",
    indigo: "from-indigo-100 to-blue-50 text-indigo-900",
  };

  return (
    <div
      className={`rounded-2xl p-5 bg-gradient-to-br ${toneMap[tone] || toneMap.slate} border border-white/80 shadow-sm`}
    >
      <p className="text-xs uppercase tracking-wider font-bold opacity-70">
        {title}
      </p>
      <p className="text-3xl font-extrabold mt-2">{value}</p>
      {note ? (
        <p className="text-xs mt-2 opacity-80 font-semibold">{note}</p>
      ) : null}
    </div>
  );
}

export default function Reports() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [monthly, setMonthly] = useState([]);
  const [rankRows, setRankRows] = useState([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [summaryRes, trendRes, rankRes] = await Promise.allSettled([
          dashboardApi.getSummary({ periodMode: "all", groupBy: "circle" }),
          dashboardApi.getMonthlyTrend({ periodMode: "all" }),
          dashboardApi.getRankTable({ groupBy: "circle" }),
        ]);

        const summaryData =
          summaryRes.status === "fulfilled"
            ? summaryRes.value.data?.data || {}
            : {};
        const trendData =
          trendRes.status === "fulfilled"
            ? trendRes.value.data?.data || []
            : [];
        const rankData =
          rankRes.status === "fulfilled" ? rankRes.value.data?.data || [] : [];

        setSummary(summaryData);
        setMonthly(
          (Array.isArray(trendData) ? trendData : []).map((row) => {
            const ach = toNum(row.totalAchievement);
            const tgt = toNum(row.totalTarget);
            const achievementPct = tgt > 0 ? (ach / tgt) * 100 : 0;
            return {
              period: `${row.monthName || "M"} ${row.year || ""}`.trim(),
              achievement: ach,
              target: tgt,
              achievementPct: Math.round(achievementPct * 100) / 100,
            };
          }),
        );
        setRankRows(Array.isArray(rankData) ? rankData : []);
      } catch (error) {
        console.error("Reports load failed", error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const trendStats = useMemo(() => {
    if (!monthly.length) {
      return {
        latestPct: 0,
        avgPct: 0,
        momentum: 0,
        volatility: 0,
        strongestMonth: "-",
      };
    }

    const pcts = monthly.map((x) => toNum(x.achievementPct));
    const latestPct = pcts[pcts.length - 1] || 0;
    const avgPct = pcts.reduce((a, b) => a + b, 0) / pcts.length;
    const recent = pcts.slice(-3);
    const previous = pcts.slice(-6, -3);
    const momentum = recent.length
      ? recent.reduce((a, b) => a + b, 0) / recent.length -
        (previous.length
          ? previous.reduce((a, b) => a + b, 0) / previous.length
          : avgPct)
      : 0;

    const variance =
      pcts.reduce((acc, val) => acc + Math.pow(val - avgPct, 2), 0) /
      pcts.length;
    const volatility = Math.sqrt(variance);

    const strongest = [...monthly].sort(
      (a, b) => b.achievementPct - a.achievementPct,
    )[0];

    return {
      latestPct,
      avgPct,
      momentum,
      volatility,
      strongestMonth: strongest?.period || "-",
    };
  }, [monthly]);

  const bottomAttention = useMemo(
    () =>
      [...rankRows]
        .sort(
          (a, b) =>
            toNum(a.currentMonthPercentage) - toNum(b.currentMonthPercentage),
        )
        .slice(0, 5)
        .map((row) => ({
          name: row.name || "Unknown",
          current: Math.round(toNum(row.currentMonthPercentage) * 100) / 100,
          previous: Math.round(toNum(row.previousMonthPercentage) * 100) / 100,
          gap:
            Math.round((100 - toNum(row.currentMonthPercentage)) * 100) / 100,
        })),
    [rankRows],
  );

  const observations = useMemo(() => {
    const points = [];
    const delta = trendStats.momentum;

    if (delta <= -5) {
      points.push(
        t(
          `गेल्या ३ महिन्यांत साध्य दरात ${Math.abs(delta).toFixed(1)}% घट दिसत आहे.`,
          `Performance dropped by ${Math.abs(delta).toFixed(1)}% in the last 3 months.`,
        ),
      );
    } else if (delta >= 5) {
      points.push(
        t(
          `गेल्या ३ महिन्यांत साध्य दरात ${delta.toFixed(1)}% सुधारणा झाली आहे.`,
          `Performance improved by ${delta.toFixed(1)}% in the last 3 months.`,
        ),
      );
    } else {
      points.push(
        t(
          "गेल्या कालावधीत साध्य दर तुलनेने स्थिर आहे.",
          "Performance is relatively stable in recent periods.",
        ),
      );
    }

    if (trendStats.volatility > 15) {
      points.push(
        t(
          "कामगिरीतील चढउतार जास्त आहेत; लक्ष्य नियोजनाची पुनर्रचना आवश्यक.",
          "Performance volatility is high; review target planning and execution cadence.",
        ),
      );
    }

    if (bottomAttention.length) {
      const worst = bottomAttention[0];
      points.push(
        t(
          `${worst.name} मध्ये ${worst.gap.toFixed(1)}% कामगिरी अंतर आढळले.`,
          `${worst.name} has a ${worst.gap.toFixed(1)}% achievement gap requiring intervention.`,
        ),
      );
    }

    points.push(
      t(
        `सर्वोत्तम महिना: ${trendStats.strongestMonth}.`,
        `Best-performing month: ${trendStats.strongestMonth}.`,
      ),
    );

    return points;
  }, [bottomAttention, t, trendStats]);

  const recommendations = useMemo(() => {
    const tips = [
      t(
        "बॉटम परफॉर्मर्ससाठी ३०-दिवसांचे लक्ष केंद्रीत कोचिंग प्लॅन तयार करा.",
        "Run a focused 30-day coaching plan for bottom performers.",
      ),
      t(
        "उच्च-परफॉर्मिंग युनिट्सची पद्धत दस्तऐवजीकरण करून इतरांकडे रोलआउट करा.",
        "Document practices from top units and roll them out as playbooks.",
      ),
      t(
        "ज्या KRA मध्ये gap > 25% आहे त्यासाठी साप्ताहिक पुनरावलोकन ठेवा.",
        "Set weekly review checkpoints for KRAs with gap above 25%.",
      ),
    ];

    if (trendStats.momentum < 0) {
      tips.unshift(
        t(
          "अलीकडील घसरण थांबवण्यासाठी पुढील दोन आठवड्यांसाठी corrective sprint चालवा.",
          "Run a two-week corrective sprint to arrest the recent decline.",
        ),
      );
    }

    return tips;
  }, [t, trendStats.momentum]);

  const exportInsightsCsv = () => {
    const rows = [
      {
        metric: "Latest Achievement %",
        value: trendStats.latestPct.toFixed(2),
      },
      {
        metric: "Average Achievement %",
        value: trendStats.avgPct.toFixed(2),
      },
      {
        metric: "Momentum (Recent vs Previous)",
        value: trendStats.momentum.toFixed(2),
      },
      {
        metric: "Volatility",
        value: trendStats.volatility.toFixed(2),
      },
      ...bottomAttention.map((row) => ({
        metric: `Gap - ${row.name}`,
        value: row.gap.toFixed(2),
      })),
    ];

    const csv = csvFromRows(rows);
    if (csv) {
      downloadText(csv, "kra-insights-report.csv", "text/csv;charset=utf-8");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-cyan-50/40 to-teal-50/50 px-3 md:px-6 py-6">
      <div className="max-w-[1350px] mx-auto space-y-6">
        <div className="rounded-3xl bg-gradient-to-r from-teal-700 via-cyan-700 to-sky-700 text-white p-6 md:p-8 shadow-xl">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-black tracking-tight">
                {t("अंतर्दृष्टी अहवाल", "Insights Report")}
              </h1>
              <p className="text-sm mt-2 text-cyan-100 font-medium">
                {t(
                  "डॅशबोर्डपेक्षा वेगळा विश्लेषणात्मक अहवाल: ट्रेंड, धोके आणि कृती योजना.",
                  "A distinct analytical layer: trends, risk signals, and action plans.",
                )}
              </p>
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={exportInsightsCsv}
                className="px-4 py-2 rounded-xl bg-white/15 border border-white/20 backdrop-blur-sm text-sm font-bold hover:bg-white/25 transition"
              >
                {t("CSV निर्यात", "Export CSV")}
              </button>
              <Link
                to="/dashboard"
                className="px-4 py-2 rounded-xl bg-white text-cyan-800 text-sm font-bold hover:bg-cyan-50 transition"
              >
                {t("डॅशबोर्ड", "Open Dashboard")}
              </Link>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <InsightCard
            title={t("सध्याचे साध्य", "Current Achievement")}
            value={asPct(
              trendStats.latestPct || summary?.achievementPercentage,
            )}
            note={t("नवीनतम उपलब्ध कालावधी", "From latest available period")}
            tone="teal"
          />
          <InsightCard
            title={t("सरासरी साध्य", "Average Achievement")}
            value={asPct(trendStats.avgPct)}
            note={t("सर्व कालावधींवर आधारित", "Across all available periods")}
            tone="indigo"
          />
          <InsightCard
            title={t("मोमेंटम", "Momentum")}
            value={`${trendStats.momentum >= 0 ? "+" : ""}${trendStats.momentum.toFixed(1)}%`}
            note={t(
              "अलीकडील विरुद्ध मागील ३ महिने",
              "Recent 3 vs previous 3 months",
            )}
            tone={trendStats.momentum < 0 ? "rose" : "amber"}
          />
          <InsightCard
            title={t("अस्थिरता", "Volatility")}
            value={trendStats.volatility.toFixed(1)}
            note={t(
              "जास्त असल्यास variance जास्त",
              "Higher means less predictable delivery",
            )}
            tone="slate"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <h3 className="text-lg font-extrabold text-slate-800 mb-1">
              {t("साध्य ट्रेंड इंटेलिजन्स", "Achievement Trend Intelligence")}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              {t(
                "ही दृश्ये ट्रेंड, घसरण/वाढ आणि स्थैर्य मोजतात.",
                "This view emphasizes direction, change velocity, and stability.",
              )}
            </p>

            {loading ? (
              <div className="h-[320px] rounded-xl bg-slate-100 animate-pulse" />
            ) : monthly.length ? (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart
                  data={monthly}
                  margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#e2e8f0"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="period"
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(v, n) => [
                      n === "achievementPct"
                        ? `${toNum(v).toFixed(2)}%`
                        : toNum(v).toFixed(2),
                      n === "achievementPct" ? "Achievement %" : n,
                    ]}
                    contentStyle={{
                      border: "none",
                      borderRadius: 10,
                      boxShadow: "0 10px 24px rgb(0 0 0 / 0.12)",
                    }}
                  />
                  <Legend iconType="circle" />
                  <Line
                    type="monotone"
                    dataKey="achievementPct"
                    name="Achievement %"
                    stroke="#0f766e"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="achievement"
                    name="Achievement"
                    stroke="#0284c7"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="target"
                    name="Target"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[320px] rounded-xl border border-dashed border-slate-200 flex items-center justify-center text-sm text-slate-500 font-semibold">
                {t("ट्रेंड डेटा उपलब्ध नाही", "Trend data is unavailable")}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <h3 className="text-lg font-extrabold text-slate-800 mb-3">
              {t("मुख्य निरीक्षणे", "Key Observations")}
            </h3>
            <ul className="space-y-2">
              {observations.map((item, idx) => (
                <li
                  key={idx}
                  className="text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded-xl p-3"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <h3 className="text-lg font-extrabold text-slate-800 mb-4">
              {t("उच्च प्राधान्य हस्तक्षेप", "High-Priority Interventions")}
            </h3>

            {loading ? (
              <div className="h-[280px] rounded-xl bg-slate-100 animate-pulse" />
            ) : bottomAttention.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={bottomAttention}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#e2e8f0"
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip formatter={(v) => `${toNum(v).toFixed(2)}%`} />
                  <Bar dataKey="gap" name="Gap %" radius={[8, 8, 0, 0]}>
                    {bottomAttention.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] rounded-xl border border-dashed border-slate-200 flex items-center justify-center text-sm text-slate-500 font-semibold">
                {t(
                  "हस्तक्षेपासाठी डेटा नाही",
                  "No intervention data available",
                )}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <h3 className="text-lg font-extrabold text-slate-800 mb-3">
              {t("शिफारसी", "Recommendations")}
            </h3>
            <div className="space-y-2">
              {recommendations.map((tip, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-cyan-100 bg-cyan-50/60 p-3 text-sm text-cyan-900 font-medium"
                >
                  {tip}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
