import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";

const HomePage = () => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [hoveredCard, setHoveredCard] = useState(null);
  const { language, t } = useLanguage();

  const handleCardClick = (path) => {
    if (!token && (path === "/data-entry" || path === "/dashboard")) {
      navigate("/auth");
    } else {
      navigate(path);
    }
  };

  const features = [
    {
      id: 1,
      title: "KRA डेटा एंट्री",
      titleEn: "KRA Data Entry",
      description: "मासिक KRA डेटा टेबल फॉर्म मध्ये प्रविष्ट करा",
      descriptionEn: "Enter Monthly KRA Data in Table Format",
      icon: "📝",
      path: "/data-entry",
      color: "from-blue-500 to-blue-700",
    },
    {
      id: 2,
      title: "प्रकल्प अहवाल",
      titleEn: "Project Report",
      description: "केआरए अहवाल डॅशबोर्ड",
      descriptionEn: "KRA Monitoring System",
      icon: "🌊",
      path: "/report",
      color: "from-cyan-500 to-cyan-700",
    },
    {
      id: 3,
      title: "डॅशबोर्ड",
      titleEn: "Dashboard",
      description: "डेटा विश्लेषण आणि अंतर्दृष्टी",
      descriptionEn: "Data Analysis & Insights",
      icon: "📈",
      path: "/dashboard",
      color: "from-purple-500 to-purple-700",
    },
  ];

  return (
    <div className="min-h-[calc(100vh-250px)]">
      <section className="relative overflow-hidden">
        <div className="relative max-w-7xl mx-auto px-4 py-12 md:py-20">
          <div className="flex flex-col md:flex-row items-center justify-center gap-6 mb-12">
            <img
              src="/images/महाराष्ट्र शासन.png"
              alt="Maharashtra Government"
              className="h-20 md:h-24 object-contain"
            />
            <div className="text-center md:text-left">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
                {t("जलसंपदा विभाग", "Water Resources Department")}
              </h2>
              <p className="text-lg text-gray-600 mt-1">
                {t("महाराष्ट्र शासन", "Government of Maharashtra")}
              </p>
            </div>
            <img
              src="/images/जलसंपदा विभाग.png"
              alt="Water Resources Department"
              className="h-20 md:h-24 object-contain"
            />
          </div>

          <div className="text-center max-w-4xl mx-auto mb-12">
            <h1 className="text-3xl md:text-5xl font-bold text-gray-900 mb-4 leading-tight">
              {t("केआरए अहवाल डॅशबोर्ड", "KRA Monitoring System")}
            </h1>
            <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto">
              {t(
                "Key Result Areas (KRA) कार्यप्रदर्शन अहवाल आणि डेटा व्यवस्थापन प्रणाली",
                "Key Result Areas (KRA) Monitoring  & Data Management System",
              )}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <button
              type="button"
              onClick={() => handleCardClick(token ? "/dashboard" : "/auth")}
              className="px-8 py-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-lg shadow-lg transition-all transform hover:scale-105"
            >
              {token
                ? t("डॅशबोर्ड उघडा →", "Open Dashboard →")
                : t("लॉगिन करा →", "Login →")}
            </button>
            <button
              type="button"
              onClick={() => handleCardClick("/report")}
              className="px-8 py-4 rounded-lg bg-white hover:bg-gray-50 text-blue-600 font-semibold text-lg border-2 border-blue-600 transition-all transform hover:scale-105"
            >
              {t("अहवाल पहा →", "View Report →")}
            </button>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">
            {t("सिस्टम वैशिष्ट्ये", "System Features")}
          </h2>
          <p className="text-gray-600">
            {t(
              "सर्व KRA संबंधित कार्ये एका ठिकाणी",
              "All KRA-related functions in one place",
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <div
              key={feature.id}
              onMouseEnter={() => setHoveredCard(feature.id)}
              onMouseLeave={() => setHoveredCard(null)}
              onClick={() => handleCardClick(feature.path)}
              className={`bg-white rounded-xl shadow-md overflow-hidden cursor-pointer transition-all duration-300 border-2 ${hoveredCard === feature.id ? "border-blue-500 shadow-xl transform scale-105" : "border-transparent hover:border-blue-200"}`}
            >
              <div className={`h-2 bg-gradient-to-r ${feature.color}`} />
              <div className="p-6">
                <div className="text-5xl mb-4 text-center transform transition-transform duration-300 hover:scale-110">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2 text-center">
                  {t(feature.title, feature.titleEn)}
                </h3>
                <p className="text-sm text-gray-600 text-center mb-4">
                  {t(feature.description, feature.descriptionEn)}
                </p>
                <div className="text-center pt-3 border-t border-gray-100">
                  <span
                    className={`inline-flex items-center text-sm font-semibold bg-gradient-to-r ${feature.color} text-transparent bg-clip-text`}
                  >
                    {t("उघडा", "Open")}
                    <svg
                      className="w-4 h-4 ml-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-cyan-600 p-6 text-white">
            <h2 className="text-2xl font-bold mb-2">
              {t("महत्वाच्या सूचना", "Important Instructions")}
            </h2>
            <p className="text-blue-100">
              {t(
                "डेटा एंट्री आणि पडताळणीसाठी कृपया खालील मुद्दे लक्षात घ्या",
                "Please note the following points for data entry and validation",
              )}
            </p>
          </div>
          <div className="p-6 md:p-8">
            <div className="grid md:grid-cols-3 gap-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">📅</span>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-2">
                    {t("वेळेवर सबमिट करा", "Submit on Time")}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {t(
                      "मासिक डेटा एंट्री प्रत्येक महिन्याच्या 5 तारखेपूर्वी पूर्ण करा",
                      "Complete monthly data entry before 5th of every month",
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">✓</span>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-2">
                    {t("अचूक डेटा", "Accurate Data")}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {t(
                      "सर्व आवश्यक फील्ड योग्यरित्या भरा आणि पडताळा",
                      "Fill all mandatory fields correctly and validate",
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">💬</span>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-2">
                    {t("सहाय्य उपलब्ध", "Support Available")}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {t(
                      "समस्या असल्यास आपल्या प्रशासकाशी संपर्क करा",
                      "Contact your administrator if you face any issues",
                    )}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-8 pt-6 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-sm text-gray-600">
                {t(
                  "अधिक माहितीसाठी अहवाल विभाग पहा",
                  "View Report section for more information",
                )}
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => handleCardClick("/report")}
                  className="px-5 py-2.5 rounded-lg bg-white hover:bg-gray-50 text-blue-600 font-semibold text-sm border-2 border-blue-600 transition"
                >
                  {t("अहवाल →", "Report →")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-gray-900 text-white py-10">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center pb-6 border-b border-gray-700">
            <p className="text-lg font-bold mb-2">
              {t(
                "जलसंपदा विभाग, महाराष्ट्र शासन",
                "Water Resources Department, Government of Maharashtra",
              )}
            </p>
            <p className="text-sm text-gray-400">
              {t(
                "Key Result Areas (KRA) कार्यप्रदर्शन अहवाल प्रणाली",
                "Key Result Areas (KRA) Performance Report System",
              )}
            </p>
          </div>
          <div className="pt-6 text-center">
            <p className="text-sm text-gray-400">
              © {new Date().getFullYear()}{" "}
              {t(
                "जलसंपदा विभाग, महाराष्ट्र शासन. सर्व हक्क राखीव.",
                "Water Resources Department, Government of Maharashtra. All Rights Reserved.",
              )}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              {t(
                "जलसंपदा विभागासाठी डिझाइन आणि विकसित",
                "Designed & Developed for Water Resources Department",
              )}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
