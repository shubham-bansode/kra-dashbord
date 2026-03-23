import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";

const GlobalHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { token, user, logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowProfileDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleNavClick = (path) => {
    setMobileMenuOpen(false);
    if (!token && (path === "/data-entry" || path === "/dashboard")) {
      navigate("/auth");
    } else {
      navigate(path);
    }
  };

  const handleLogout = () => {
    logout();
    setShowProfileDropdown(false);
    navigate("/");
  };

  const isActive = (path) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const navItems = [
    { path: "/", label: { en: "Home", mr: "मुख्यपृष्ठ" } },
    { path: "/data-entry", label: { en: "Data Entry", mr: "डेटा एंट्री" } },
    { path: "/dashboard", label: { en: "Dashboard", mr: "डॅशबोर्ड" } },
    { path: "/monitoring", label: { en: "Monitoring", mr: "निरीक्षण" } },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white shadow-md">
      {/* Main Navbar - Single Compact Row */}
      <nav className="bg-gradient-to-r from-blue-700 via-blue-800 to-blue-900">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            {/* Left: Logo & Brand */}
            <div
              className="flex items-center gap-3 cursor-pointer"
              onClick={() => navigate("/")}
            >
              <img
                src="/images/महाराष्ट्र शासन.png"
                alt="महाराष्ट्र शासन"
                className="w-9 h-9 object-contain bg-white rounded-full p-0.5"
              />
              <div className="hidden sm:block">
                <h1 className="text-white font-bold text-sm leading-tight">
                  जलसंपदा विभाग
                </h1>
                <p className="text-blue-200 text-[10px] leading-tight">
                  KRA Monitoring System
                </p>
              </div>
            </div>

            {/* Center: Navigation Links (Desktop) */}
            <div className="hidden lg:flex items-center gap-1">
              {navItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => handleNavClick(item.path)}
                  className={`px-3 py-1.5 text-sm font-medium rounded transition-all ${
                    isActive(item.path)
                      ? "bg-white/20 text-white"
                      : "text-blue-100 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {t(item.label.mr, item.label.en)}
                </button>
              ))}

              {/* Language Toggle */}
              <button
                type="button"
                onClick={() => setLanguage(language === "en" ? "mr" : "en")}
                className="ml-2 px-3 py-1.5 text-sm font-medium rounded transition-all text-blue-100 hover:bg-white/10 hover:text-white w-20 text-center"
              >
                {language === "en" ? "EN" : "मराठी"}
              </button>
            </div>

            {/* Right: Auth Section */}
            <div className="flex items-center gap-3">
              {token && user ? (
                /* Profile Dropdown */
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                    className="flex items-center gap-2 pl-1 pr-3 py-1 bg-white/10 hover:bg-white/20 rounded-full transition-all"
                  >
                    <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-pink-500 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-inner">
                      {user.fullName?.charAt(0).toUpperCase() || "U"}
                    </div>
                    <span className="hidden md:block text-white text-sm font-medium max-w-[80px] truncate">
                      {user.fullName?.split(" ")[0]}
                    </span>
                    <svg
                      className={`w-4 h-4 text-white/80 transition-transform ${showProfileDropdown ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>

                  {showProfileDropdown && (
                    <div className="absolute right-0 mt-2 w-52 bg-white rounded-lg shadow-xl border border-gray-100 py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                      {/* User Info */}
                      <div className="px-4 py-3 border-b border-gray-100">
                        <p className="font-semibold text-gray-800 text-sm">
                          {user.fullName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {user.mobileNumber}
                        </p>
                        <span
                          className={`inline-block mt-1.5 px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                            user.role === "superadmin"
                              ? "bg-yellow-100 text-yellow-700"
                              : user.role === "admin"
                                ? "bg-purple-100 text-purple-700"
                                : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {user.role?.toUpperCase()}
                        </span>
                      </div>

                      {/* Admin Panel Link (Only for admins) */}
                      {(user.role === "admin" ||
                        user.role === "superadmin") && (
                        <button
                          onClick={() => {
                            setShowProfileDropdown(false);
                            navigate("/admin");
                          }}
                          className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        >
                          <span className="text-base">⚙️</span> Admin Panel
                        </button>
                      )}

                      {/* Logout */}
                      <div className="border-t border-gray-100">
                        <button
                          onClick={handleLogout}
                          className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                        >
                          <span className="text-base">🚪</span> Logout
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Single Login Button */
                <button
                  onClick={() => navigate("/auth")}
                  className="flex items-center gap-2 px-4 py-2 bg-white text-blue-700 text-sm font-semibold rounded-lg hover:bg-blue-50 transition-all shadow-sm"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
                    />
                  </svg>
                  {t("साइन इन", "Sign In")}
                </button>
              )}

              {/* Mobile Menu Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 text-white hover:bg-white/10 rounded-lg"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  {mobileMenuOpen ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  ) : (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-white/10 bg-blue-900/95 backdrop-blur">
            <div className="px-4 py-2 space-y-1">
              {/* Language Toggle */}
              <button
                type="button"
                onClick={() => setLanguage(language === "en" ? "mr" : "en")}
                className="w-20 text-center px-3 py-2.5 text-sm font-medium rounded transition-all text-blue-100 hover:bg-white/10 mx-auto"
              >
                {language === "en" ? "EN" : "मराठी"}
              </button>

              {navItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => handleNavClick(item.path)}
                  className={`w-full text-left px-3 py-2.5 text-sm font-medium rounded transition-all ${
                    isActive(item.path)
                      ? "bg-white/20 text-white"
                      : "text-blue-100 hover:bg-white/10"
                  }`}
                >
                  {t(item.label.mr, item.label.en)}
                </button>
              ))}
            </div>
          </div>
        )}
      </nav>
    </header>
  );
};

export default GlobalHeader;
