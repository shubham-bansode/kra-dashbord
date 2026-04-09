import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";
import { authApi } from "../services/api";

export default function Profile() {
  const { user, updateLocalUser } = useAuth();
  const { t } = useLanguage();

  const [formData, setFormData] = useState({
    fullName: "",
    username: "",
    mobileNumber: "",
  });
  const [errors, setErrors] = useState({});
  const [passwordErrors, setPasswordErrors] = useState({});
  const [status, setStatus] = useState({ type: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPasswordSubmitting, setIsPasswordSubmitting] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [successPopupMessage, setSuccessPopupMessage] = useState("");

  useEffect(() => {
    setFormData({
      fullName: "",
      username: user?.username || "",
      mobileNumber: user?.mobileNumber || "",
    });
  }, [user]);

  const hasChanges = useMemo(() => {
    return (
      (formData.fullName || "").trim() !== (user?.fullName || "").trim() ||
      (formData.username || "").trim().toLowerCase() !==
        (user?.username || "").trim().toLowerCase() ||
      (formData.mobileNumber || "").trim() !== (user?.mobileNumber || "").trim()
    );
  }, [formData, user]);

  const scopedHierarchyInfo = useMemo(() => {
    const level = String(user?.hierarchyLevel || "").toLowerCase();
    const divisionName = String(user?.division?.name || "").trim();
    const circleName = String(user?.circle?.name || "").trim();
    const regionName = String(user?.region?.name || "").trim();
    const corporationName = String(user?.corporation?.name || "").trim();

    if (level === "division" || divisionName) {
      return {
        labelMr: "विभागाचे नाव",
        labelEn: "Division Name",
        value: divisionName || "-",
      };
    }

    if (level === "circle" || circleName) {
      return {
        labelMr: "मंडळाचे नाव",
        labelEn: "Circle Name",
        value: circleName || "-",
      };
    }

    if (level === "region" || regionName) {
      return {
        labelMr: "प्रदेशाचे नाव",
        labelEn: "Region Name",
        value: regionName || "-",
      };
    }

    return {
      labelMr: "महामंडळाचे नाव",
      labelEn: "Corporation Name",
      value: corporationName || "-",
    };
  }, [user]);

  const validate = () => {
    const nextErrors = {};

    if (!String(formData.fullName || "").trim()) {
      nextErrors.fullName = t("पूर्ण नाव आवश्यक आहे", "Full name is required");
    } else if (String(formData.fullName || "").trim().length < 2) {
      nextErrors.fullName = t(
        "पूर्ण नाव किमान 2 अक्षरांचे असावे",
        "Full name must be at least 2 characters",
      );
    }

    const normalizedUsername = String(formData.username || "").trim();
    if (!normalizedUsername) {
      nextErrors.username = t("Username आवश्यक आहे", "Username is required");
    } else if (normalizedUsername.length < 3) {
      nextErrors.username = t(
        "Username किमान 3 अक्षरांचे असावे",
        "Username must be at least 3 characters",
      );
    } else if (!/^[a-zA-Z0-9._-]+$/.test(normalizedUsername)) {
      nextErrors.username = t(
        "Username मध्ये फक्त अक्षरे, अंक, dot, underscore, hyphen अनुमत आहेत",
        "Username may contain letters, numbers, dot, underscore and hyphen only",
      );
    }

    const normalizedMobile = String(formData.mobileNumber || "").trim();
    if (normalizedMobile && !/^[6-9]\d{9}$/.test(normalizedMobile)) {
      nextErrors.mobileNumber = t(
        "कृपया वैध 10 अंकी भारतीय मोबाईल क्रमांक प्रविष्ट करा",
        "Please enter a valid 10-digit Indian mobile number",
      );
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setStatus({ type: "", message: "" });

    if (!validate()) return;
    if (!hasChanges) {
      setStatus({
        type: "info",
        message: t("बदल आढळले नाहीत", "No changes detected"),
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await authApi.updateProfile({
        fullName: String(formData.fullName || "").trim(),
        username: String(formData.username || "").trim(),
        mobileNumber: String(formData.mobileNumber || "").trim(),
      });
      updateLocalUser(res?.data?.data || null);
      setStatus({ type: "", message: "" });
      setSuccessPopupMessage(
        t(
          "तुमची प्रोफाइल माहिती यशस्वीरित्या अपडेट झाली आहे.",
          "Your profile details have been updated successfully.",
        ),
      );
      setShowSuccessPopup(true);
    } catch (error) {
      const isRouteNotFound = error?.response?.status === 404;
      setStatus({
        type: "error",
        message: isRouteNotFound
          ? t(
              "Route not found. कृपया backend server restart करा.",
              "Route not found. Please restart backend server.",
            )
          : error?.response?.data?.message ||
            t("प्रोफाइल अपडेट करताना त्रुटी आली", "Error updating profile"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const validatePassword = () => {
    const nextErrors = {};
    if (!String(passwordData.currentPassword || "").trim()) {
      nextErrors.currentPassword = t(
        "सध्याचा पासवर्ड आवश्यक आहे",
        "Current password is required",
      );
    }
    if (!String(passwordData.newPassword || "").trim()) {
      nextErrors.newPassword = t(
        "नवीन पासवर्ड आवश्यक आहे",
        "New password is required",
      );
    } else if (String(passwordData.newPassword || "").length < 6) {
      nextErrors.newPassword = t(
        "नवीन पासवर्ड किमान 6 अक्षरांचा असावा",
        "New password must be at least 6 characters",
      );
    }

    if (!String(passwordData.confirmPassword || "").trim()) {
      nextErrors.confirmPassword = t(
        "कृपया पासवर्डची पुष्टी करा",
        "Please confirm password",
      );
    } else if (passwordData.newPassword !== passwordData.confirmPassword) {
      nextErrors.confirmPassword = t(
        "नवीन पासवर्ड आणि पुष्टी पासवर्ड जुळत नाहीत",
        "New password and confirm password do not match",
      );
    }

    if (passwordData.currentPassword === passwordData.newPassword) {
      nextErrors.newPassword = t(
        "नवीन पासवर्ड सध्याच्या पासवर्डपेक्षा वेगळा असावा",
        "New password must be different from current password",
      );
    }

    setPasswordErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const onPasswordSubmit = async (e) => {
    e.preventDefault();
    setStatus({ type: "", message: "" });

    if (!validatePassword()) return;

    try {
      setIsPasswordSubmitting(true);
      await authApi.changePassword({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setPasswordErrors({});
      setStatus({ type: "", message: "" });
      setSuccessPopupMessage(
        t(
          "तुमचा पासवर्ड यशस्वीरित्या अपडेट झाला आहे.",
          "Your password has been updated successfully.",
        ),
      );
      setShowSuccessPopup(true);
    } catch (error) {
      const isRouteNotFound = error?.response?.status === 404;
      setStatus({
        type: "error",
        message: isRouteNotFound
          ? t(
              "Route not found. कृपया backend server restart करा.",
              "Route not found. Please restart backend server.",
            )
          : error?.response?.data?.message ||
            t("पासवर्ड अपडेट करताना त्रुटी आली", "Error updating password"),
      });
    } finally {
      setIsPasswordSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-80px)] px-4 py-8">
      {showSuccessPopup && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setShowSuccessPopup(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-green-700">
              {t("अपडेट यशस्वी", "Update Successful")}
            </h2>
            <p className="mt-2 text-slate-700">{successPopupMessage}</p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowSuccessPopup(false)}
                className="px-5 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold"
              >
                {t("ठीक आहे", "OK")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
        <div className="px-6 py-5 bg-gradient-to-r from-blue-700 to-indigo-700 text-white">
          <h1 className="text-2xl font-bold">
            {t("प्रोफाइल अपडेट", "Profile Update")}
          </h1>
          <p className="text-sm text-white/80 mt-1">
            {t(
              "लॉगिननंतर वैयक्तिक माहिती संपादित करा",
              "Edit your personal details after login",
            )}
          </p>
        </div>

        <form className="p-6 space-y-5" onSubmit={onSubmit}>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              {t("व्यक्तीचे नाव", "Person Name")}
            </label>
            <input
              type="text"
              value={formData.fullName}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, fullName: e.target.value }))
              }
              className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 ${errors.fullName ? "border-red-400" : "border-slate-300"}`}
              placeholder={t("पूर्ण नाव प्रविष्ट करा", "Enter full name")}
            />
            {errors.fullName && (
              <p className="text-xs text-red-600 mt-1">{errors.fullName}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              {t(scopedHierarchyInfo.labelMr, scopedHierarchyInfo.labelEn)}
            </label>
            <input
              type="text"
              value={scopedHierarchyInfo.value}
              readOnly
              className="w-full px-4 py-2.5 border border-slate-300 rounded-xl bg-slate-100 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              {t("यूजरनेम", "Username")}
            </label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, username: e.target.value }))
              }
              className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 ${errors.username ? "border-red-400" : "border-slate-300"}`}
              placeholder={t("यूजरनेम प्रविष्ट करा", "Enter username")}
            />
            {errors.username && (
              <p className="text-xs text-red-600 mt-1">{errors.username}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              {t("मोबाईल क्रमांक", "Mobile Number")}
            </label>
            <input
              type="tel"
              maxLength={10}
              value={formData.mobileNumber}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  mobileNumber: e.target.value.replace(/\D/g, "").slice(0, 10),
                }))
              }
              className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 ${errors.mobileNumber ? "border-red-400" : "border-slate-300"}`}
              placeholder="9876543210"
            />
            {errors.mobileNumber && (
              <p className="text-xs text-red-600 mt-1">{errors.mobileNumber}</p>
            )}
          </div>

          {status.message && (
            <div
              className={`px-4 py-3 rounded-xl text-sm font-medium ${
                status.type === "error"
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : "bg-blue-50 text-blue-700 border border-blue-200"
              }`}
            >
              {status.message}
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors disabled:opacity-60"
            >
              {isSubmitting
                ? t("सेव्ह होत आहे...", "Saving...")
                : t("प्रोफाइल सेव्ह करा", "Save Profile")}
            </button>
          </div>
        </form>

        <div className="border-t border-slate-200" />

        <form className="p-6 space-y-5" onSubmit={onPasswordSubmit}>
          <h2 className="text-lg font-bold text-slate-800">
            {t("पासवर्ड अपडेट", "Update Password")}
          </h2>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              {t("सध्याचा पासवर्ड", "Current Password")}
            </label>
            <input
              type="password"
              value={passwordData.currentPassword}
              onChange={(e) =>
                setPasswordData((prev) => ({
                  ...prev,
                  currentPassword: e.target.value,
                }))
              }
              className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 ${passwordErrors.currentPassword ? "border-red-400" : "border-slate-300"}`}
              placeholder={t(
                "सध्याचा पासवर्ड प्रविष्ट करा",
                "Enter current password",
              )}
            />
            {passwordErrors.currentPassword && (
              <p className="text-xs text-red-600 mt-1">
                {passwordErrors.currentPassword}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              {t("नवीन पासवर्ड", "New Password")}
            </label>
            <input
              type="password"
              value={passwordData.newPassword}
              onChange={(e) =>
                setPasswordData((prev) => ({
                  ...prev,
                  newPassword: e.target.value,
                }))
              }
              className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 ${passwordErrors.newPassword ? "border-red-400" : "border-slate-300"}`}
              placeholder={t("नवीन पासवर्ड प्रविष्ट करा", "Enter new password")}
            />
            {passwordErrors.newPassword && (
              <p className="text-xs text-red-600 mt-1">
                {passwordErrors.newPassword}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              {t("पासवर्ड पुष्टी", "Confirm Password")}
            </label>
            <input
              type="password"
              value={passwordData.confirmPassword}
              onChange={(e) =>
                setPasswordData((prev) => ({
                  ...prev,
                  confirmPassword: e.target.value,
                }))
              }
              className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 ${passwordErrors.confirmPassword ? "border-red-400" : "border-slate-300"}`}
              placeholder={t(
                "पासवर्ड पुन्हा प्रविष्ट करा",
                "Re-enter new password",
              )}
            />
            {passwordErrors.confirmPassword && (
              <p className="text-xs text-red-600 mt-1">
                {passwordErrors.confirmPassword}
              </p>
            )}
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isPasswordSubmitting}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-colors disabled:opacity-60"
            >
              {isPasswordSubmitting
                ? t("अपडेट होत आहे...", "Updating...")
                : t("पासवर्ड अपडेट करा", "Update Password")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
