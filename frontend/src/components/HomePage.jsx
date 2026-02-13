import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../auth/AuthContext";

const HomePage = () => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [hoveredCard, setHoveredCard] = useState(null);

  const handleCardClick = (path) => {
    // If not logged in and trying to access protected routes, redirect to login
    if (!token && (path === "/data-entry" || path === "/dashboard")) {
      navigate("/login");
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
      title: "रिपोर्ट पहा",
      titleEn: "View Reports",
      description: "KRA अहवाल आणि विश्लेषण",
      descriptionEn: "KRA Reports & Analytics",
      icon: "📊",
      path: "/reports",
      color: "from-green-500 to-green-700",
    },
    {
      id: 3,
      title: "प्रकल्प निरीक्षण",
      titleEn: "Project Monitoring",
      description: "सर्कल-वार केआरए निरीक्षण डॅशबोर्ड",
      descriptionEn: "Circle-wise KRA Monitoring Dashboard",
      icon: "🌊",
      path: "/monitoring",
      color: "from-cyan-500 to-cyan-700",
    },
    {
      id: 4,
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
    <div className="min-h-[calc(100vh-250px)] bg-gradient-to-br from-blue-50 via-white to-blue-50">
      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12 animate-fade-in">
          <h1 className="text-3xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-600 mb-3">
            Circle-wise KRA Monitoring Dashboard
          </h1>

          <p className="text-lg md:text-xl text-gray-700 font-semibold mb-2">
            सर्कल-वार केआरए निरीक्षण डॅशबोर्ड
          </p>

          <p className="text-base text-gray-600 max-w-3xl mx-auto">
            Key Result Areas (KRA) Performance Monitoring & Data Management
            System
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          {features.map((feature) => (
            <div
              key={feature.id}
              onMouseEnter={() => setHoveredCard(feature.id)}
              onMouseLeave={() => setHoveredCard(null)}
              onClick={() => handleCardClick(feature.path)}
              className={`
                relative bg-white rounded-2xl shadow-lg overflow-hidden cursor-pointer
                transform transition-all duration-300 hover:scale-105 hover:shadow-2xl
                ${hoveredCard === feature.id ? "ring-4 ring-blue-500 ring-opacity-50" : ""}
              `}
            >
              {/* Gradient Background */}
              <div
                className={`absolute inset-0 bg-gradient-to-br ${feature.color} opacity-0 transition-opacity duration-300 ${hoveredCard === feature.id ? "opacity-10" : ""}`}
              />

              {/* Content */}
              <div className="relative p-5 text-center">
                <div className="text-5xl mb-3 transform transition-transform duration-300 hover:scale-110">
                  {feature.icon}
                </div>

                <h3 className="text-lg font-bold text-gray-800 mb-1">
                  {feature.title}
                </h3>
                <p className="text-sm font-medium text-gray-600 mb-2">
                  {feature.titleEn}
                </p>

                <p className="text-sm text-gray-600 mb-1">
                  {feature.description}
                </p>
                <p className="text-xs text-gray-500">{feature.descriptionEn}</p>

                <div className="mt-3 pt-3 border-t border-gray-200">
                  <span
                    className={`inline-flex items-center text-sm font-semibold bg-gradient-to-r ${feature.color} text-transparent bg-clip-text`}
                  >
                    उघडा / Open
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

              {/* Hover Effect Border */}
              <div
                className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${feature.color} transform transition-transform duration-300 ${hoveredCard === feature.id ? "scale-x-100" : "scale-x-0"}`}
              />
            </div>
          ))}
        </div>

        {/* Quick Stats Section */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-8">
          <h2 className="text-xl font-bold text-center text-gray-800 mb-6">
            सिस्टम वैशिष्ट्ये | System Features
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl">
              <div className="text-3xl font-bold text-blue-600 mb-1">5</div>
              <p className="text-sm font-semibold text-gray-700">महामंडळे</p>
              <p className="text-xs text-gray-600">Corporations</p>
            </div>

            <div className="text-center p-3 bg-gradient-to-br from-green-50 to-green-100 rounded-xl">
              <div className="text-3xl font-bold text-green-600 mb-1">7</div>
              <p className="text-sm font-semibold text-gray-700">KRA प्रकार</p>
              <p className="text-xs text-gray-600">KRA Types</p>
            </div>

            <div className="text-center p-3 bg-gradient-to-br from-cyan-50 to-cyan-100 rounded-xl">
              <div className="text-3xl font-bold text-cyan-600 mb-1">24/7</div>
              <p className="text-sm font-semibold text-gray-700">उपलब्धता</p>
              <p className="text-xs text-gray-600">Availability</p>
            </div>

            <div className="text-center p-3 bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl">
              <div className="text-3xl font-bold text-orange-600 mb-1">✓</div>
              <p className="text-sm font-semibold text-gray-700">सुरक्षित</p>
              <p className="text-xs text-gray-600">Secure</p>
            </div>
          </div>
        </div>

        {/* Important Links */}
        <div className="bg-gradient-to-r from-blue-600 to-cyan-600 rounded-2xl shadow-xl p-6 text-white text-center">
          <h2 className="text-xl font-bold mb-3">
            महत्वाच्या सूचना | Important Instructions
          </h2>
          <div className="max-w-3xl mx-auto space-y-1 text-sm">
            <p>
              • मासिक डेटा एंट्री प्रत्येक महिन्याच्या 5 तारखेपूर्वी पूर्ण करा
            </p>
            <p>• Complete monthly data entry before 5th of every month</p>
            <p>
              • सर्व आवश्यक फील्ड योग्यरित्या भरा | Fill all mandatory fields
              correctly
            </p>
            <p>• समस्या असल्यास संपर्क करा: 1800-XXX-XXXX</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-6 mt-10">
        <div className="container mx-auto px-4 text-center">
          <div className="mb-3">
            <p className="text-base font-semibold mb-1">
              जलसंपदा विभाग, महाराष्ट्र शासन
            </p>
            <p className="text-sm">
              Water Resources Department, Government of Maharashtra
            </p>
          </div>

          <div className="border-t border-gray-700 pt-3">
            <p className="text-sm text-gray-400">
              © {new Date().getFullYear()} All Rights Reserved | सर्व हक्क राखीव
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Designed & Developed for Water Resources Department
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
