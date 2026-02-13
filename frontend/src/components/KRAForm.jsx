import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  corporationApi,
  regionApi,
  circleApi,
  kraEntryApi,
  financialYearApi,
} from "../services/api";
import {
  generateKraYears,
  getMarathiMonths,
  isDateInFinancialYear,
  isValidMobileNumber,
  parseFinancialYear,
} from "../utils/helpers";
import { useAuth } from "../auth/AuthContext";

// Import KRA configuration from centralized config file
import { getActiveKraConfig, getKrasForConfig } from "../config/kraConfig";

// ============================================================================
// ICONS
// ============================================================================
const ErrorIcon = () => (
  <svg
    className="w-4 h-4 flex-shrink-0"
    fill="currentColor"
    viewBox="0 0 20 20"
  >
    <path
      fillRule="evenodd"
      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
      clipRule="evenodd"
    />
  </svg>
);

const SuccessIcon = () => (
  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
    <path
      fillRule="evenodd"
      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
      clipRule="evenodd"
    />
  </svg>
);

const LoadingSpinner = ({ size = "h-5 w-5" }) => (
  <svg
    className={`animate-spin ${size} text-white`}
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
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

const InfoIcon = () => (
  <svg
    className="w-4 h-4 text-blue-500"
    fill="currentColor"
    viewBox="0 0 20 20"
  >
    <path
      fillRule="evenodd"
      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
      clipRule="evenodd"
    />
  </svg>
);

const TableIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
    />
  </svg>
);

const OrgIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
    />
  </svg>
);

const ContactIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
    />
  </svg>
);

const SectionIcon = ({ children }) => (
  <span className="bg-white/20 p-1.5 rounded-lg">{children}</span>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================
const KRAForm = () => {
  const { user } = useAuth();
  const userCorporationId = user?.corporation?._id || user?.corporation || "";
  const userMobileNumber = user?.mobileNumber || "";
  const userFullName = user?.fullName || "";
  const isCorporationLocked = Boolean(userCorporationId);

  // Master Data States
  const [corporations, setCorporations] = useState([]);
  const [regions, setRegions] = useState([]);
  const [circles, setCircles] = useState([]);
  const [kraYears] = useState(generateKraYears());
  const [months] = useState(getMarathiMonths());
  const [activeFinancialYear, setActiveFinancialYear] = useState(null);
  const [isYearLocked, setIsYearLocked] = useState(false);

  // Form Data State
  const [formData, setFormData] = useState({
    corporation: "",
    region: "",
    circle: "",
    kraYear: "",
    kraMonth: "",
    achievementDate: "",
    remarks: "",
    contactNumber: "",
  });

  // KRA Table Data - stores target and achievement for each KRA
  const [kraTableData, setKraTableData] = useState({});

  // UI States
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitInFlightRef = useRef(false);
  const [submitStatus, setSubmitStatus] = useState({ type: "", message: "" });
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successSummary, setSuccessSummary] = useState("");
  const [selectedCorporation, setSelectedCorporation] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState(null);

  // KRA selection flow - show all 7 KRAs at once
  const [selectedKraIds, setSelectedKraIds] = useState([]);

  // Get active KRA configuration based on selection
  const activeConfig = useMemo(() => {
    const corpName = selectedCorporation?.name;
    const regionName = selectedRegion?.name;
    return getActiveKraConfig(corpName, regionName);
  }, [selectedCorporation, selectedRegion]);

  // Get KRAs to display based on config and selected year
  const displayKras = useMemo(() => {
    return getKrasForConfig(activeConfig, formData.kraYear);
  }, [activeConfig, formData.kraYear]);

  // Only show selected KRAs for validation (no longer used for table display)
  const selectedDisplayKras = useMemo(() => {
    if (selectedKraIds.length === 0) return [];
    const selectedSet = new Set(selectedKraIds);
    return displayKras.filter((kra) => selectedSet.has(kra.id));
  }, [displayKras, selectedKraIds]);

  // Note: Weightage is intentionally not displayed on frontend UI.

  // Fetch initial data
  useEffect(() => {
    const fetchMasterData = async () => {
      setIsLoading(true);
      try {
        const [corpRes, fyRes] = await Promise.all([
          corporationApi.getAll(),
          financialYearApi.getActive().catch(() => null),
        ]);

        setCorporations(corpRes.data.data);

        // Set active financial year from admin settings
        if (fyRes?.data?.data) {
          const activeFY = fyRes.data.data;
          setActiveFinancialYear(activeFY);
          setIsYearLocked(activeFY.isLocked === true);
          // Auto-set the financial year
          setFormData((prev) => ({
            ...prev,
            kraYear: activeFY.year,
          }));
        } else {
          // No active financial year found
          setActiveFinancialYear(null);
          setIsYearLocked(true); // Lock if no active year
        }
      } catch (error) {
        console.error("Error fetching master data:", error);
        setSubmitStatus({
          type: "error",
          message:
            "मास्टर डेटा लोड करण्यात त्रुटी आली. कृपया पृष्ठ रीफ्रेश करा.",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchMasterData();
  }, []);

  // Keep KRA selection consistent when available KRAs change (corp/region/year config)
  useEffect(() => {
    setSelectedKraIds((prev) => {
      const available = new Set(displayKras.map((k) => k.id));
      const next = prev.filter((id) => available.has(id));
      return next;
    });
  }, [displayKras]);

  // Pre-fill locked user fields
  useEffect(() => {
    if (!userCorporationId && !userMobileNumber) return;

    setFormData((prev) => {
      const next = { ...prev };
      if (userCorporationId && prev.corporation !== userCorporationId) {
        next.corporation = userCorporationId;
        next.region = "";
        next.circle = "";
      }
      if (userMobileNumber && !prev.contactNumber) {
        next.contactNumber = userMobileNumber;
      }
      return next;
    });
  }, [userCorporationId, userMobileNumber]);

  // Fetch regions when corporation changes
  useEffect(() => {
    const fetchRegions = async () => {
      if (!formData.corporation) {
        setRegions([]);
        setCircles([]);
        setSelectedCorporation(null);
        return;
      }

      const corp = corporations.find((c) => c._id === formData.corporation);
      setSelectedCorporation(corp);

      if (corp?.hasRegions) {
        try {
          const res = await regionApi.getByCorporation(formData.corporation);
          setRegions(res.data.data);
        } catch (error) {
          console.error("Error fetching regions:", error);
        }
      } else {
        setRegions([]);
      }
      setCircles([]);
      setSelectedRegion(null);
    };

    fetchRegions();
  }, [formData.corporation, corporations]);

  // Fetch circles when region changes
  useEffect(() => {
    const fetchCircles = async () => {
      if (!formData.region) {
        setCircles([]);
        setSelectedRegion(null);
        return;
      }

      const region = regions.find((r) => r._id === formData.region);
      setSelectedRegion(region);

      try {
        const res = await circleApi.getByRegion(formData.region);
        setCircles(res.data.data);
      } catch (error) {
        console.error("Error fetching circles:", error);
      }
    };

    fetchCircles();
  }, [formData.region, regions]);

  // Reset KRA table data when config changes
  useEffect(() => {
    const newTableData = {};
    displayKras.forEach((kra) => {
      newTableData[kra.id] = kraTableData[kra.id] || {
        target: "",
        achievement: "",
      };
    });
    setKraTableData(newTableData);
  }, [displayKras]);

  // Handle KRA table data change
  const handleKraTableChange = (kraId, field, value) => {
    setKraTableData((prev) => ({
      ...prev,
      [kraId]: {
        ...prev[kraId],
        [field]: value,
      },
    }));
  };

  // Validation
  const validateField = useCallback(
    (name, value) => {
      let error = "";

      switch (name) {
        case "corporation":
          if (!value)
            error = "महामंडळ निवडणे आवश्यक आहे | Corporation is required";
          break;

        case "region":
          if (selectedCorporation?.hasRegions && !value) {
            error = "प्रादेशिक नाव निवडणे आवश्यक आहे | Region is required";
          }
          break;

        case "circle":
          if (selectedCorporation?.hasRegions && !value) {
            error = "वर्तुळ नाव निवडणे आवश्यक आहे | Circle is required";
          }
          break;

        case "kraYear":
          if (!value)
            error = "KRA वर्ष निवडणे आवश्यक आहे | KRA Year is required";
          break;

        case "kraMonth":
          if (!value) error = "महिना निवडणे आवश्यक आहे | Month is required";
          break;

        case "achievementDate":
          if (!value) {
            error = "उपलब्धी तारीख आवश्यक आहे | Achievement Date is required";
          } else if (
            formData.kraYear &&
            !isDateInFinancialYear(value, formData.kraYear)
          ) {
            const fyInfo = parseFinancialYear(formData.kraYear);
            error = `तारीख आर्थिक वर्ष ${formData.kraYear} मध्ये असणे आवश्यक आहे (एप्रिल ${fyInfo.startYear} ते मार्च ${fyInfo.endYear})`;
          }
          break;

        case "contactNumber":
          if (!value) {
            error = "संपर्क क्रमांक आवश्यक आहे | Contact Number is required";
          } else if (!isValidMobileNumber(value)) {
            error = "कृपया वैध 10 अंकी भारतीय मोबाईल क्रमांक प्रविष्ट करा";
          }
          break;

        default:
          break;
      }

      return error;
    },
    [selectedCorporation, formData.kraYear],
  );

  // Validate KRA table
  const validateKraTable = useCallback(() => {
    const errors = {};

    if (!formData.achievementDate) {
      errors.kraSelection =
        "कृपया प्रथम तारीख निवडा | Please select date first";
      return errors;
    }

    if (selectedKraIds.length === 0) {
      errors.selectedKras =
        "कृपया किमान एक KRA निवडा | Please select at least one KRA";
      return errors;
    }

    // Validate ONLY selected KRAs. Unselected KRAs will be submitted as 0.
    selectedDisplayKras.forEach((kra) => {
      const data = kraTableData[kra.id];
      if (!data?.target) {
        errors[`kra_${kra.id}_target`] = "वार्षिक उद्दिष्ट आवश्यक आहे";
      }
      if (!data?.achievement) {
        errors[`kra_${kra.id}_achievement`] = "साध्य आवश्यक आहे";
      }
      if (data?.target && parseFloat(data.target) < 0) {
        errors[`kra_${kra.id}_target`] = "मूल्य नकारात्मक असू शकत नाही";
      }
      if (data?.achievement && parseFloat(data.achievement) < 0) {
        errors[`kra_${kra.id}_achievement`] = "मूल्य नकारात्मक असू शकत नाही";
      }
    });

    return errors;
  }, [
    formData.achievementDate,
    selectedKraIds,
    selectedDisplayKras,
    kraTableData,
  ]);

  // Validate all fields
  const validateForm = useCallback(() => {
    const newErrors = {};

    Object.keys(formData).forEach((field) => {
      const error = validateField(field, formData[field]);
      if (error) newErrors[field] = error;
    });

    const kraErrors = validateKraTable();
    Object.assign(newErrors, kraErrors);

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, validateField, validateKraTable]);

  const toggleKraSelection = (kraId) => {
    setSelectedKraIds((prev) => {
      const exists = prev.includes(kraId);
      if (exists) return prev.filter((id) => id !== kraId);
      return [...prev, kraId];
    });
  };

  // Handle input change
  const handleChange = (e) => {
    const { name, value } = e.target;

    let updatedFormData = { ...formData, [name]: value };

    if (name === "corporation") {
      updatedFormData.region = "";
      updatedFormData.circle = "";
      setSelectedKraIds([]);
    } else if (name === "region") {
      updatedFormData.circle = "";
      setSelectedKraIds([]);
    } else if (name === "achievementDate" && value) {
      // Auto-fill month based on selected date
      const selectedDate = new Date(value);
      const month = selectedDate.getMonth() + 1; // getMonth() returns 0-11, so add 1
      updatedFormData.kraMonth = month.toString();

      // Reset selection when date changes
      setSelectedKraIds([]);
    } else if (name === "achievementDate" && !value) {
      // Reset selection when date cleared
      setSelectedKraIds([]);
    }

    setFormData(updatedFormData);

    if (touched[name]) {
      const error = validateField(name, value);
      setErrors((prev) => ({ ...prev, [name]: error }));
    }

    // Also validate and clear error for auto-filled month
    if (name === "achievementDate" && value && touched.kraMonth) {
      const selectedDate = new Date(value);
      const month = selectedDate.getMonth() + 1;
      const monthError = validateField("kraMonth", month.toString());
      setErrors((prev) => ({ ...prev, kraMonth: monthError }));
    }
  };

  // Handle blur
  const handleBlur = (e) => {
    const { name, value } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    const error = validateField(name, value);
    setErrors((prev) => ({ ...prev, [name]: error }));
  };

  // Check if form is valid
  const isFormValid = useCallback(() => {
    const requiredFields = [
      "corporation",
      "kraYear",
      "kraMonth",
      "achievementDate",
      "contactNumber",
    ];

    if (selectedCorporation?.hasRegions) {
      requiredFields.push("region", "circle");
    }

    for (const field of requiredFields) {
      if (!formData[field]) return false;
    }

    // Must select at least one KRA
    if (selectedKraIds.length === 0) return false;

    // All selected KRAs must have target + achievement
    const allSelectedHaveData = selectedDisplayKras.every((kra) => {
      const data = kraTableData[kra.id];
      return data?.target && data?.achievement;
    });
    if (!allSelectedHaveData) return false;

    return Object.values(errors).every((error) => !error);
  }, [
    formData,
    errors,
    selectedCorporation,
    selectedKraIds,
    selectedDisplayKras,
    kraTableData,
  ]);

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Prevent double-click / double-submit before React disables the button.
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    const releaseSubmitGuard = () => {
      submitInFlightRef.current = false;
    };

    // Check if year is locked
    if (isYearLocked) {
      releaseSubmitGuard();
      setSubmitStatus({
        type: "error",
        message:
          "हे आर्थिक वर्ष लॉक केले आहे. नवीन नोंदी स्वीकारल्या जात नाहीत. | This financial year is locked. No new entries allowed.",
      });
      return;
    }

    // Check if there's an active financial year
    if (!activeFinancialYear) {
      releaseSubmitGuard();
      setSubmitStatus({
        type: "error",
        message:
          "कोणतेही सक्रिय आर्थिक वर्ष नाही. कृपया प्रशासकाशी संपर्क साधा. | No active financial year. Please contact administrator.",
      });
      return;
    }

    const allTouched = {};
    Object.keys(formData).forEach((key) => {
      allTouched[key] = true;
    });
    setTouched(allTouched);

    if (!validateForm()) {
      releaseSubmitGuard();
      setSubmitStatus({
        type: "error",
        message: "कृपया सर्व आवश्यक फील्ड योग्यरित्या भरा",
      });
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus({ type: "", message: "" });

    try {
      // Prepare ALL KRA entries:
      // - Selected KRAs use user-entered values
      // - Unselected KRAs are submitted with 0/0
      const selectedSet = new Set(selectedKraIds);
      const kraEntries = displayKras.map((kra) => {
        const isSelected = selectedSet.has(kra.id);
        const data = kraTableData[kra.id];

        const annualTarget = isSelected ? parseFloat(data?.target) : 0;
        const kraAchievement = isSelected ? parseFloat(data?.achievement) : 0;

        return {
          corporation: userCorporationId || formData.corporation,
          region: selectedCorporation?.hasRegions ? formData.region : null,
          circle: selectedCorporation?.hasRegions ? formData.circle : null,
          kraYear: formData.kraYear,
          kraName: kra.displayName,
          kraId: kra.id,
          weight: kra.weight,
          annualTarget: Number.isFinite(annualTarget) ? annualTarget : 0,
          kraAchievement: Number.isFinite(kraAchievement) ? kraAchievement : 0,
          achievementDate: formData.achievementDate,
          remarks: formData.remarks || "",
          contactNumber: userMobileNumber || formData.contactNumber,
          submittedBy: userFullName || undefined,
        };
      });

      // Use bulk submission - INSERT ONLY
      // Users can only create new entries. Only admin can update existing entries.
      const response = await kraEntryApi.bulkCreate(kraEntries);
      const result = response.data;

      if (result.success) {
        const successMsg = `${result.summary.inserted} KRA entries यशस्वीरित्या सबमिट केल्या!`;
        setSuccessSummary(successMsg);
        setShowSuccessModal(true);
        setSubmitStatus({
          type: "success",
          message: `✅ ${successMsg}`,
        });

        // Reset KRA table on success
        const resetTableData = {};
        displayKras.forEach((kra) => {
          resetTableData[kra.id] = { target: "", achievement: "" };
        });
        setKraTableData(resetTableData);
        setSelectedKraIds([]);
      } else {
        // Handle failure
        setSubmitStatus({
          type: "error",
          message: result.message || "काही entries साठी त्रुटी आली",
        });
      }
    } catch (error) {
      const errorData = error.response?.data;
      const statusCode = error.response?.status;

      // Handle route not found (API base mismatch)
      if (statusCode === 404) {
        setSubmitStatus({
          type: "error",
          message:
            "Route not found. कृपया API URL सेटिंग तपासा किंवा प्रशासकाशी संपर्क साधा.",
        });
        return;
      }

      // Handle DUPLICATE ENTRIES (HTTP 409 Conflict)
      if (
        statusCode === 409 &&
        (errorData?.error === "DUPLICATE_ENTRIES" ||
          errorData?.error === "DUPLICATE_KEY")
      ) {
        setSubmitStatus({
          type: "error",
          message:
            "⚠️ या महिन्यासाठी KRA entry आधीच अस्तित्वात आहे. एकदा सबमिट केल्यानंतर फक्त Admin बदल करू शकतात. | A KRA entry already exists for the selected month. Once submitted, only admin can update entries.",
        });
        return;
      }

      // Handle other 409 conflicts
      if (statusCode === 409) {
        setSubmitStatus({
          type: "error",
          message:
            errorData?.message ||
            "या महिन्यासाठी KRA entry आधीच अस्तित्वात आहे. फक्त Admin अपडेट करू शकतात.",
        });
        return;
      }

      const errorMessage =
        errorData?.errors?.[0]?.message ||
        errorData?.message ||
        "सबमिट करताना त्रुटी आली";
      setSubmitStatus({
        type: "error",
        message: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
      submitInFlightRef.current = false;
    }
  };

  // Reset form
  const handleReset = () => {
    setFormData({
      corporation: userCorporationId || "",
      region: "",
      circle: "",
      kraYear: "",
      kraMonth: "",
      achievementDate: "",
      remarks: "",
      contactNumber: userMobileNumber || "",
    });
    setKraTableData({});
    setSelectedKraIds([]);
    setTouched({});
    setErrors({});
    setSubmitStatus({ type: "", message: "" });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center bg-white p-8 rounded-xl shadow-lg">
          <div className="flex justify-center mb-4">
            <LoadingSpinner size="h-12 w-12" />
          </div>
          <p className="text-lg text-gray-600 font-medium">
            डेटा लोड होत आहे...
          </p>
          <p className="text-sm text-gray-400 mt-1">Loading data...</p>
        </div>
      </div>
    );
  }

  // Success popup modal for clear confirmation
  const SuccessModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-3 text-green-600">
          <SuccessIcon />
          <h3 className="text-xl font-bold">Submission Successful</h3>
        </div>
        <p className="text-gray-700 mb-6">
          {successSummary || "Entries submitted successfully."}
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            onClick={() => setShowSuccessModal(false)}
          >
            ठीक आहे / Done
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      {showSuccessModal && <SuccessModal />}
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-gov-blue text-white text-center py-6 rounded-t-lg border-b-4 border-gov-orange">
          <div className="flex items-center justify-center gap-4 mb-3">
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Seal_of_Maharashtra.svg/150px-Seal_of_Maharashtra.svg.png"
              alt="Maharashtra Seal"
              className="w-16 h-16 md:w-20 md:h-20"
              onError={(e) => {
                e.target.style.display = "none";
              }}
            />
          </div>
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold mb-2">
            KRA Monitoring Data Entry Form
          </h1>
          <p className="text-lg md:text-xl opacity-90 font-semibold">
            केआरए निरीक्षण डेटा एंट्री फॉर्म (Table Mode)
          </p>
          <p className="text-sm md:text-base mt-2 opacity-80">
            जलसंपदा विभाग, महाराष्ट्र शासन
          </p>
        </div>

        {/* Locked Year Warning */}
        {isYearLocked && (
          <div className="mx-4 mt-4 p-4 rounded-lg bg-red-100 border-2 border-red-400 text-red-800 shadow-md">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🔒</span>
              <div>
                <h3 className="font-bold text-lg">
                  आर्थिक वर्ष लॉक केले आहे | Financial Year is Locked
                </h3>
                <p className="text-sm mt-1">
                  {activeFinancialYear
                    ? `${activeFinancialYear.year} या वर्षासाठी नवीन नोंदी स्वीकारल्या जात नाहीत.`
                    : "कोणतेही सक्रिय आर्थिक वर्ष नाही. कृपया प्रशासकाशी संपर्क साधा."}
                </p>
                <p className="text-xs mt-1 opacity-80">
                  {activeFinancialYear
                    ? `No new entries are being accepted for ${activeFinancialYear.year}.`
                    : "No active financial year. Please contact administrator."}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* No Active Year Warning */}
        {!activeFinancialYear && !isYearLocked && (
          <div className="mx-4 mt-4 p-4 rounded-lg bg-yellow-100 border-2 border-yellow-400 text-yellow-800 shadow-md">
            <div className="flex items-center gap-3">
              <span className="text-3xl">⚠️</span>
              <div>
                <h3 className="font-bold text-lg">
                  कोणतेही सक्रिय आर्थिक वर्ष नाही | No Active Financial Year
                </h3>
                <p className="text-sm mt-1">कृपया प्रशासकाशी संपर्क साधा.</p>
                <p className="text-xs mt-1 opacity-80">
                  Please contact the administrator to activate a financial year.
                </p>
              </div>
            </div>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="bg-white shadow-xl rounded-b-xl overflow-hidden"
        >
          {/* Organization Section */}
          <div className="border-b border-gray-200">
            <div className="section-header">
              <SectionIcon>
                <OrgIcon />
              </SectionIcon>
              संस्थात्मक पदानुक्रम | Organization Hierarchy
            </div>
            <div className="section-content">
              <div className="sticky top-0 z-30 -mx-6 md:-mx-8 px-6 md:px-8 py-5 bg-white/95 backdrop-blur border-b border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Corporation */}
                  <div>
                    <label htmlFor="corporation" className="form-label">
                      महामंडळाचे नाव | Corporation Name
                      <span className="required-star">*</span>
                    </label>
                    <select
                      id="corporation"
                      name="corporation"
                      value={formData.corporation}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      className={`form-select ${errors.corporation && touched.corporation ? "input-error" : ""}`}
                      disabled={isCorporationLocked}
                    >
                      <option value="">-- निवडा --</option>
                      {corporations.map((corp) => (
                        <option key={corp._id} value={corp._id}>
                          {corp.name}
                        </option>
                      ))}
                    </select>
                    {errors.corporation && touched.corporation && (
                      <p className="form-error">
                        <ErrorIcon /> {errors.corporation}
                      </p>
                    )}
                  </div>

                  {/* Region */}
                  {selectedCorporation?.hasRegions && (
                    <div>
                      <label htmlFor="region" className="form-label">
                        मंडळाचे नाव | Region Name
                        <span className="required-star">*</span>
                      </label>
                      <select
                        id="region"
                        name="region"
                        value={formData.region}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        className={`form-select ${errors.region && touched.region ? "input-error" : ""}`}
                        disabled={!formData.corporation}
                      >
                        <option value="">-- निवडा --</option>
                        {regions.map((region) => (
                          <option key={region._id} value={region._id}>
                            {region.name}
                          </option>
                        ))}
                      </select>
                      {errors.region && touched.region && (
                        <p className="form-error">
                          <ErrorIcon /> {errors.region}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Circle */}
                  {selectedCorporation?.hasRegions && (
                    <div>
                      <label htmlFor="circle" className="form-label">
                        वर्तुळ नाव | Circle Name
                        <span className="required-star">*</span>
                      </label>
                      <select
                        id="circle"
                        name="circle"
                        value={formData.circle}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        className={`form-select ${errors.circle && touched.circle ? "input-error" : ""}`}
                        disabled={!formData.region}
                      >
                        <option value="">-- निवडा --</option>
                        {circles.map((circle) => (
                          <option key={circle._id} value={circle._id}>
                            {circle.name}
                          </option>
                        ))}
                      </select>
                      {errors.circle && touched.circle && (
                        <p className="form-error">
                          <ErrorIcon /> {errors.circle}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Year, Month, Date */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                <div>
                  <label htmlFor="kraYear" className="form-label">
                    फलनिष्पत्तीची क्षेत्रे (KRA) वर्ष
                    <span className="required-star">*</span>
                    {activeFinancialYear && (
                      <span className="ml-2 text-xs font-normal text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                        🔒 System Controlled
                      </span>
                    )}
                  </label>
                  {activeFinancialYear ? (
                    <>
                      <input
                        type="text"
                        id="kraYear"
                        name="kraYear"
                        value={formData.kraYear}
                        readOnly
                        className="form-input bg-gray-100 cursor-not-allowed"
                      />
                      <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                        <InfoIcon />
                        आर्थिक वर्ष प्रशासकाद्वारे नियंत्रित | Year controlled
                        by admin
                      </p>
                    </>
                  ) : (
                    <select
                      id="kraYear"
                      name="kraYear"
                      value={formData.kraYear}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      className={`form-select ${errors.kraYear && touched.kraYear ? "input-error" : ""}`}
                    >
                      <option value="">-- निवडा --</option>
                      {kraYears.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  )}
                  {errors.kraYear && touched.kraYear && (
                    <p className="form-error">
                      <ErrorIcon /> {errors.kraYear}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="achievementDate" className="form-label">
                    उपलब्धी तारीख | Achievement Date
                    <span className="required-star">*</span>
                  </label>
                  <input
                    type="date"
                    id="achievementDate"
                    name="achievementDate"
                    value={formData.achievementDate}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={`form-input ${errors.achievementDate && touched.achievementDate ? "input-error" : ""}`}
                  />
                  {errors.achievementDate && touched.achievementDate && (
                    <p className="form-error">
                      <ErrorIcon /> {errors.achievementDate}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="kraMonth" className="form-label">
                    महिन्याचे साध्य KRA
                    <span className="required-star">*</span>
                    <span className="text-xs text-blue-600 ml-2 font-normal">
                      (तारीखेवरून स्वयंचलित)
                    </span>
                  </label>
                  <select
                    id="kraMonth"
                    name="kraMonth"
                    value={formData.kraMonth}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    disabled={true}
                    className={`form-select bg-gray-100 cursor-not-allowed ${errors.kraMonth && touched.kraMonth ? "input-error" : ""}`}
                    title="महिना तारीखेवरून स्वयंचलितपणे निवडला जातो"
                  >
                    <option value="">-- तारीख निवडा --</option>
                    {months.map((month) => (
                      <option key={month.value} value={month.value}>
                        {month.label} ({month.labelEn})
                      </option>
                    ))}
                  </select>
                  {!formData.achievementDate && (
                    <p className="text-xs text-blue-500 mt-1 flex items-center gap-1">
                      <InfoIcon /> तारीख निवडल्यानंतर महिना आपोआप निवडला जाईल
                    </p>
                  )}
                  {errors.kraMonth && touched.kraMonth && (
                    <p className="form-error">
                      <ErrorIcon /> {errors.kraMonth}
                    </p>
                  )}
                </div>
              </div>

              {/* Instructions for KRA Selection */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
                <p className="text-sm text-blue-800 font-medium mb-2">
                  📝 सूचना | Instruction:
                </p>
                <p className="text-sm text-blue-700">
                  खाली सर्व KRA दिसतील. ज्या KRA साठी डेटा भरायचा आहे त्या KRA
                  च्या चेकबॉक्सवर क्लिक करा आणि वार्षिक उद्दिष्ट व साध्य भरा.
                  <br />
                  <span className="text-xs mt-1 inline-block">
                    All KRAs are shown below. Click the checkbox for KRAs you
                    want to fill data for, then enter annual target and
                    achievement.
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* KRA Table Section */}
          <div className="border-b border-gray-200">
            <div className="section-header">
              <SectionIcon>
                <TableIcon />
              </SectionIcon>
              फलनिष्पत्तीची क्षेत्रे (KRA) Table
              {selectedCorporation && (
                <span className="ml-2 text-sm opacity-80">
                  ({activeConfig.displayName} - {selectedKraIds.length || 0}/
                  {displayKras.length} Selected)
                </span>
              )}
            </div>
            <div className="section-content">
              {!formData.corporation ? (
                <div className="text-center py-8 text-gray-500">
                  <InfoIcon />
                  <p className="mt-2">कृपया प्रथम महामंडळ निवडा</p>
                  <p className="text-sm">Please select a corporation first</p>
                </div>
              ) : !formData.kraYear ? (
                <div className="text-center py-8 text-gray-500">
                  <InfoIcon />
                  <p className="mt-2">कृपया KRA वर्ष निवडा</p>
                  <p className="text-sm">Please select KRA Year</p>
                </div>
              ) : !formData.achievementDate ? (
                <div className="text-center py-8 text-gray-500">
                  <InfoIcon />
                  <p className="mt-2">कृपया उपलब्धी तारीख निवडा</p>
                  <p className="text-sm">Please select Achievement Date</p>
                </div>
              ) : displayKras.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <InfoIcon />
                  <p className="mt-2">या कॉन्फिगरेशनसाठी KRA उपलब्ध नाहीत</p>
                  <p className="text-sm">
                    No KRAs available for this configuration
                  </p>
                </div>
              ) : (
                <>
                  {/* KRA Table - Show All with Checkboxes */}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-gov-blue text-white">
                          <th className="px-4 py-3 text-center font-semibold border-r border-blue-400 w-20">
                            निवडा
                          </th>
                          <th className="px-4 py-3 text-left font-semibold border-r border-blue-400 w-16">
                            अ.क्र.
                          </th>
                          <th className="px-4 py-3 text-left font-semibold border-r border-blue-400 min-w-[300px]">
                            KRA नाव
                          </th>
                          <th className="px-4 py-3 text-center font-semibold border-r border-blue-400 w-36">
                            KRA वार्षिक उद्दिष्ट
                          </th>
                          <th className="px-4 py-3 text-center font-semibold w-36">
                            KRA साध्य
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayKras.map((kra, index) => {
                          const isSelected = selectedKraIds.includes(kra.id);
                          const canSelect = Boolean(formData.achievementDate);
                          return (
                            <tr
                              key={kra.id}
                              className={`border-b ${
                                index % 2 === 0 ? "bg-white" : "bg-gray-50"
                              } ${
                                isSelected
                                  ? "hover:bg-blue-50"
                                  : "hover:bg-gray-100"
                              } transition-colors`}
                            >
                              <td className="px-4 py-3 border-r border-gray-200 text-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={!canSelect}
                                  onChange={() => {
                                    if (!canSelect) return;
                                    toggleKraSelection(kra.id);
                                  }}
                                  className="w-5 h-5 cursor-pointer accent-gov-blue disabled:cursor-not-allowed"
                                />
                              </td>
                              <td className="px-4 py-3 border-r border-gray-200 text-center font-medium text-gray-600">
                                {index + 1}
                              </td>
                              <td
                                className={`px-4 py-3 border-r border-gray-200 ${
                                  canSelect
                                    ? "cursor-pointer"
                                    : "cursor-not-allowed"
                                } select-none`}
                                title={
                                  canSelect
                                    ? "Click KRA name to select/deselect"
                                    : "Select Achievement Date first"
                                }
                                onClick={() => {
                                  if (!canSelect) return;
                                  toggleKraSelection(kra.id);
                                }}
                              >
                                <div className="font-bold text-gray-900">
                                  {kra.displayName}
                                </div>
                                <div className="text-xs font-semibold text-gray-700 mt-1">
                                  Unit: {kra.unit}
                                </div>
                              </td>
                              <td className="px-4 py-3 border-r border-gray-200">
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  placeholder={
                                    isSelected ? "Enter target" : "-"
                                  }
                                  value={kraTableData[kra.id]?.target || ""}
                                  onChange={(e) =>
                                    handleKraTableChange(
                                      kra.id,
                                      "target",
                                      e.target.value,
                                    )
                                  }
                                  disabled={!isSelected}
                                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                                    !isSelected
                                      ? "bg-gray-100 cursor-not-allowed opacity-50"
                                      : errors[`kra_${kra.id}_target`]
                                        ? "border-red-500"
                                        : "border-gray-300"
                                  }`}
                                />
                                {errors[`kra_${kra.id}_target`] &&
                                  isSelected && (
                                    <p className="text-xs text-red-500 mt-1">
                                      {errors[`kra_${kra.id}_target`]}
                                    </p>
                                  )}
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  placeholder={
                                    isSelected ? "Enter achievement" : "-"
                                  }
                                  value={
                                    kraTableData[kra.id]?.achievement || ""
                                  }
                                  onChange={(e) =>
                                    handleKraTableChange(
                                      kra.id,
                                      "achievement",
                                      e.target.value,
                                    )
                                  }
                                  disabled={!isSelected}
                                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                                    !isSelected
                                      ? "bg-gray-100 cursor-not-allowed opacity-50"
                                      : errors[`kra_${kra.id}_achievement`]
                                        ? "border-red-500"
                                        : "border-gray-300"
                                  }`}
                                />
                                {errors[`kra_${kra.id}_achievement`] &&
                                  isSelected && (
                                    <p className="text-xs text-red-500 mt-1">
                                      {errors[`kra_${kra.id}_achievement`]}
                                    </p>
                                  )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Selection Summary */}
                  <div className="mt-4 flex justify-between items-center bg-gray-50 p-3 rounded-lg">
                    <p className="text-sm text-gray-600">
                      निवडलेले KRA:{" "}
                      <strong className="text-gov-blue">
                        {selectedKraIds.length}
                      </strong>{" "}
                      / {displayKras.length}
                    </p>
                    {selectedKraIds.length === 0 && (
                      <p className="text-sm text-red-500">
                        ⚠️ कृपया किमान एक KRA निवडा
                      </p>
                    )}
                  </div>

                  {errors.selectedKras && (
                    <p className="form-error mt-4">
                      <ErrorIcon /> {errors.selectedKras}
                    </p>
                  )}
                </>
              )}

              {/* Remarks */}
              <div className="mt-6">
                <label htmlFor="remarks" className="form-label">
                  शेरा / अडचणी
                  <span className="text-gray-400 text-xs ml-2 font-normal">
                    (Optional)
                  </span>
                </label>
                <textarea
                  id="remarks"
                  name="remarks"
                  value={formData.remarks}
                  onChange={handleChange}
                  rows="3"
                  placeholder="Enter any issues or difficulties here..."
                  className="form-textarea"
                />
              </div>
            </div>
          </div>

          {/* Contact Section */}
          <div className="border-b border-gray-200">
            <div className="section-header">
              <SectionIcon>
                <ContactIcon />
              </SectionIcon>
              संपर्क माहिती | Contact Information
            </div>
            <div className="section-content">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {userFullName && (
                  <div>
                    <label className="form-label">Full Name</label>
                    <input
                      className="form-input bg-gray-50"
                      value={userFullName}
                      readOnly
                      disabled
                    />
                  </div>
                )}

                <div>
                  <label htmlFor="contactNumber" className="form-label">
                    मोबाईल क्रमांक | Mobile Number
                    <span className="required-star">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">
                      +91
                    </span>
                    <input
                      type="tel"
                      id="contactNumber"
                      name="contactNumber"
                      value={formData.contactNumber}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      placeholder="9876543210"
                      maxLength="10"
                      className={`form-input pl-14 ${errors.contactNumber && touched.contactNumber ? "input-error" : ""}`}
                      disabled={Boolean(userMobileNumber)}
                    />
                  </div>
                  {errors.contactNumber && touched.contactNumber && (
                    <p className="form-error">
                      <ErrorIcon /> {errors.contactNumber}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="px-6 py-8 bg-gradient-to-b from-gray-50 to-gray-100">
            {/* Status Message (near Submit button) */}
            {submitStatus.message && (
              <div
                className={`mb-5 p-4 rounded-lg flex items-start gap-3 shadow-md ${
                  submitStatus.type === "success"
                    ? "bg-green-50 text-green-800 border-l-4 border-green-500"
                    : "bg-red-50 text-red-800 border-l-4 border-red-500"
                }`}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {submitStatus.type === "success" ? (
                    <SuccessIcon />
                  ) : (
                    <ErrorIcon />
                  )}
                </div>
                <div>
                  <p className="font-semibold">{submitStatus.message}</p>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                type="submit"
                disabled={
                  !isFormValid() ||
                  isSubmitting ||
                  isYearLocked ||
                  !activeFinancialYear
                }
                className={`btn-primary flex items-center justify-center gap-2 min-w-[220px] ${isYearLocked || !activeFinancialYear ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {isSubmitting ? (
                  <>
                    <LoadingSpinner size="h-5 w-5" />
                    <span>सबमिट होत आहे...</span>
                  </>
                ) : (
                  <>
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span>सबमिट करा | Submit</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleReset}
                disabled={isSubmitting}
                className="btn-secondary flex items-center justify-center gap-2 min-w-[220px]"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                <span>रीसेट करा | Reset</span>
              </button>
            </div>

            <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
              <div className="flex items-start gap-2">
                <InfoIcon />
                <div className="text-sm text-blue-700">
                  <p className="font-medium">
                    महत्त्वाची सूचना | Important Note:
                  </p>
                  <ul className="mt-1 space-y-1 text-blue-600">
                    <li>
                      • <span className="text-red-500 font-bold">*</span>{" "}
                      चिन्हांकित फील्ड आवश्यक आहेत
                    </li>
                    <li>
                      • प्रत्येक महामंडळ/विभागासाठी वेगवेगळे KRA असू शकतात
                    </li>
                    <li>• निवडलेल्या KRA साठीच डेटा भरा</li>
                    <li>
                      • वर्षानुसार KRA नाव बदलते (उदा. "सन 2024-25 मध्ये...")
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="text-center mt-8 pb-8">
          <div className="inline-block bg-white px-8 py-4 rounded-lg shadow-md">
            <p className="text-sm text-gray-600 font-medium">
              © {new Date().getFullYear()} जलसंपदा विभाग, महाराष्ट्र शासन
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Water Resources Department, Government of Maharashtra
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KRAForm;
