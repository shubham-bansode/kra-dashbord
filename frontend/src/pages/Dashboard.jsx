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
} from "recharts";
import {
  dashboardApi,
  kraEntryApi,
  corporationApi,
  kraApi,
} from "../services/api";
import { generateKraYears } from "../utils/helpers";

const COLORS = [
  "#003366",
  "#004d99",
  "#0066cc",
  "#3399ff",
  "#66b3ff",
  "#99ccff",
];

const LoadingSpinner = () => (
  <div className="flex items-center justify-center p-8">
    <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-gov-blue"></div>
  </div>
);

const StatCard = ({ title, value, subtitle, icon, color = "bg-gov-blue" }) => (
  <div
    className="bg-white rounded-lg shadow-lg p-6 border-l-4"
    style={{ borderColor: color === "bg-gov-blue" ? "#003366" : color }}
  >
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-600">{title}</p>
        <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {icon && (
        <div className={`${color} text-white p-3 rounded-lg`}>{icon}</div>
      )}
    </div>
  </div>
);

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [byCorporation, setByCorporation] = useState([]);
  const [byKra, setByKra] = useState([]);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [entries, setEntries] = useState([]);

  const [corporations, setCorporations] = useState([]);
  const [kras, setKras] = useState([]);
  const [kraYears] = useState(generateKraYears());

  const [filters, setFilters] = useState({
    corporation: "",
    kraYear: "",
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

  useEffect(() => {
    fetchDashboardData();
  }, [filters, kras]);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      const filterParams = {};
      if (filters.corporation) filterParams.corporation = filters.corporation;
      if (filters.kraYear) filterParams.kraYear = filters.kraYear;
      if (filters.kra) filterParams.kra = filters.kra;

      const [summaryRes, corpRes, kraRes, trendRes, entriesRes] =
        await Promise.all([
          dashboardApi.getSummary(filterParams),
          dashboardApi.getByCorporation(filterParams),
          dashboardApi.getByKra(filterParams),
          dashboardApi.getMonthlyTrend(filterParams),
          kraEntryApi.getAll(filterParams),
        ]);

      setSummary(summaryRes.data?.data || {});
      setByCorporation(corpRes.data?.data || []);
      setByKra(kraRes.data?.data || []);
      setMonthlyTrend(trendRes.data?.data || []);

      const rawEntries = entriesRes.data?.data || [];
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
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const resetFilters = () => {
    setFilters({ corporation: "", kraYear: "", kra: "" });
  };

  if (isLoading && !summary) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">KRA Dashboard</h1>
          <p className="text-gray-600 mt-2">
            केआरए डॅशबोर्ड - डेटा विश्लेषण आणि अहवाल
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            Filters | फिल्टर
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Corporation
              </label>
              <select
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gov-blue"
                value={filters.corporation}
                onChange={(e) =>
                  handleFilterChange("corporation", e.target.value)
                }
              >
                <option value="">All Corporations</option>
                {corporations.map((corp) => (
                  <option key={corp._id} value={corp._id}>
                    {corp.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                KRA Year
              </label>
              <select
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gov-blue"
                value={filters.kraYear}
                onChange={(e) => handleFilterChange("kraYear", e.target.value)}
              >
                <option value="">All Years</option>
                {kraYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                KRA
              </label>
              <select
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gov-blue"
                value={filters.kra}
                onChange={(e) => handleFilterChange("kra", e.target.value)}
              >
                <option value="">All KRAs</option>
                {kras.map((kra) => (
                  <option key={kra._id} value={kra._id}>
                    {kra.nameEnglish || kra.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={resetFilters}
                className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium"
              >
                Reset Filters
              </button>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Total Entries"
            value={summary?.totalEntries || 0}
            subtitle="एकूण नोंदी"
            color="#003366"
            icon={
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            }
          />

          <StatCard
            title="Total Achievement"
            value={summary?.totalAchievement?.toFixed(2) || 0}
            subtitle="एकूण साध्य"
            color="#0066cc"
            icon={
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                />
              </svg>
            }
          />

          <StatCard
            title="Total Target"
            value={summary?.totalTarget?.toFixed(2) || 0}
            subtitle="एकूण लक्ष्य"
            color="#3399ff"
            icon={
              <svg
                className="w-6 h-6"
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
            }
          />

          <StatCard
            title="Achievement %"
            value={`${summary?.achievementPercentage?.toFixed(1) || 0}%`}
            subtitle="साध्य टक्केवारी"
            color="#ff6b35"
            icon={
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"
                />
              </svg>
            }
          />
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Achievements by Corporation */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              Achievements by Corporation
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={byCorporation}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="corporationCode" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="totalAchievement"
                  fill="#003366"
                  name="Achievement"
                />
                <Bar dataKey="totalTarget" fill="#66b3ff" name="Target" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Corporation Distribution */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              Corporation Distribution
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={byCorporation}
                  dataKey="count"
                  nameKey="corporationCode"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label
                >
                  {byCorporation.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 gap-6 mb-6">
          {/* Monthly Trend */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              Monthly Achievement Trend
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="monthName" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="totalAchievement"
                  stroke="#003366"
                  strokeWidth={2}
                  name="Achievement"
                />
                <Line
                  type="monotone"
                  dataKey="totalTarget"
                  stroke="#ff6b35"
                  strokeWidth={2}
                  name="Target"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Achievements by KRA */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              Achievements by KRA
            </h3>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={byKra} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="kraName" type="category" width={200} />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="totalAchievement"
                  fill="#003366"
                  name="Achievement"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">
            Recent Entries | अलीकडील नोंदी
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Corporation
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    KRA
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Target
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Achievement
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    %
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {entries.slice(0, 10).map((entry) => {
                  const target = Number(entry.annualTarget) || 0;
                  const achievement = Number(entry.kraAchievement) || 0;
                  const percent = target > 0 ? (achievement / target) * 100 : 0;
                  return (
                    <tr key={entry._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(entry.achievementDate).toLocaleDateString(
                          "en-IN",
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {entry.corporation?.code || "N/A"}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {entry.kraName || `KRA ${entry.kraId}`}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {target}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {achievement}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            percent >= 80
                              ? "bg-green-100 text-green-800"
                              : percent >= 50
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-red-100 text-red-800"
                          }`}
                        >
                          {percent.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
