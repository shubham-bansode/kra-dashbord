import { useState, useEffect, useCallback } from "react";
import {
  corporationApi,
  regionApi,
  circleApi,
  kraApi,
  kraEntryApi,
} from "../services/api";
import {
  generateKraYears,
  getMarathiMonths,
  isDateInFinancialYear,
  isValidMobileNumber,
  isValidNumber,
  parseFinancialYear,
} from "../utils/helpers";
import { useAuth } from "../auth/AuthContext";

// Icons
const ErrorIcon = () => (
  <svg
    className="w-4 h-4 flex-shrink-0 mt-0.5"
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
    xmlns="http://www.w3.org/2000/svg"
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
    ></circle>
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    ></path>
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

const SectionIcon = ({ children }) => (
  <span className="bg-white/20 p-1.5 rounded-lg">{children}</span>
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

const KRAIcon = () => (
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
      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
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
  const [kras, setKras] = useState([]);
  const [kraYears] = useState(generateKraYears());
  const [months] = useState(getMarathiMonths());

  // Form Data State
  const [formData, setFormData] = useState({
    corporation: "",
    region: "",
    circle: "",
    kraYear: "",
    kraMonth: "",
    kra: "",
    annualTarget: "",
    achievementDate: "",
    kraAchievement: "",
    remarks: "",
    contactNumber: "",
  });

  // UI States
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState({ type: "", message: "" });
  const [selectedCorporation, setSelectedCorporation] = useState(null);

  // Fetch initial data
  useEffect(() => {
    const fetchMasterData = async () => {
      setIsLoading(true);
      try {
        const [corpRes, kraRes] = await Promise.all([
          corporationApi.getAll(),
          kraApi.getAll(),
        ]);
        setCorporations(corpRes.data.data);
        setKras(kraRes.data.data);
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
    };

    fetchRegions();
  }, [formData.corporation, corporations]);

  // Fetch circles when region changes
  useEffect(() => {
    const fetchCircles = async () => {
      if (!formData.region) {
        setCircles([]);
        return;
      }

      try {
        const res = await circleApi.getByRegion(formData.region);
        setCircles(res.data.data);
      } catch (error) {
        console.error("Error fetching circles:", error);
      }
    };

    fetchCircles();
  }, [formData.region]);

  // Validation function
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
            error =
              "प्रादेशिक नाव निवडणे आवश्यक आहे | Region is required for MKVDC";
          }
          break;

        case "circle":
          if (selectedCorporation?.hasRegions && !value) {
            error =
              "वर्तुळ नाव निवडणे आवश्यक आहे | Circle is required for MKVDC";
          }
          break;

        case "kraYear":
          if (!value)
            error = "KRA वर्ष निवडणे आवश्यक आहे | KRA Year is required";
          break;

        case "kraMonth":
          if (!value) error = "महिना निवडणे आवश्यक आहे | Month is required";
          break;

        case "kra":
          if (!value)
            error = "KRA नाव निवडणे आवश्यक आहे | KRA Name is required";
          break;

        case "annualTarget":
          if (!value) {
            error = "वार्षिक लक्ष्य आवश्यक आहे | Annual Target is required";
          } else if (!isValidNumber(value)) {
            error =
              "कृपया वैध संख्या प्रविष्ट करा | Please enter a valid number";
          } else if (parseFloat(value) < 0) {
            error = "मूल्य नकारात्मक असू शकत नाही | Value cannot be negative";
          }
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

        case "kraAchievement":
          if (!value) {
            error = "KRA उपलब्धी आवश्यक आहे | KRA Achievement is required";
          } else if (!isValidNumber(value)) {
            error =
              "कृपया वैध संख्या प्रविष्ट करा | Please enter a valid number";
          } else if (parseFloat(value) < 0) {
            error = "मूल्य नकारात्मक असू शकत नाही | Value cannot be negative";
          }
          break;

        case "contactNumber":
          if (!value) {
            error = "संपर्क क्रमांक आवश्यक आहे | Contact Number is required";
          } else if (!isValidMobileNumber(value)) {
            error =
              "कृपया वैध 10 अंकी भारतीय मोबाईल क्रमांक प्रविष्ट करा | Please enter a valid 10-digit Indian mobile number";
          }
          break;

        default:
          break;
      }

      return error;
    },
    [selectedCorporation, formData.kraYear],
  );

  // Validate all fields
  const validateForm = useCallback(() => {
    const newErrors = {};

    Object.keys(formData).forEach((field) => {
      const error = validateField(field, formData[field]);
      if (error) newErrors[field] = error;
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, validateField]);

  // Handle input change
  const handleChange = (e) => {
    const { name, value } = e.target;

    // Reset dependent fields when parent changes
    let updatedFormData = { ...formData, [name]: value };

    if (name === "corporation") {
      updatedFormData.region = "";
      updatedFormData.circle = "";
    } else if (name === "region") {
      updatedFormData.circle = "";
    } else if (name === "kraYear") {
      // Re-validate date when year changes
      if (formData.achievementDate) {
        const dateError = validateField(
          "achievementDate",
          formData.achievementDate,
        );
        if (dateError) {
          setErrors((prev) => ({ ...prev, achievementDate: dateError }));
        }
      }
    }

    setFormData(updatedFormData);

    // Validate field if touched
    if (touched[name]) {
      const error = validateField(name, value);
      setErrors((prev) => ({ ...prev, [name]: error }));
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
    // Check required fields
    const requiredFields = [
      "corporation",
      "kraYear",
      "kraMonth",
      "kra",
      "annualTarget",
      "achievementDate",
      "kraAchievement",
      "contactNumber",
    ];

    // Add region/circle if corporation has regions
    if (selectedCorporation?.hasRegions) {
      requiredFields.push("region", "circle");
    }

    // Check all required fields have values
    for (const field of requiredFields) {
      if (!formData[field]) return false;
    }

    // Check no errors
    return Object.values(errors).every((error) => !error);
  }, [formData, errors, selectedCorporation]);

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Mark all fields as touched
    const allTouched = {};
    Object.keys(formData).forEach((key) => {
      allTouched[key] = true;
    });
    setTouched(allTouched);

    // Validate form
    if (!validateForm()) {
      setSubmitStatus({
        type: "error",
        message:
          "कृपया सर्व आवश्यक फील्ड योग्यरित्या भरा | Please fill all required fields correctly",
      });
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus({ type: "", message: "" });

    try {
      // Prepare data for API
      const submitData = {
        corporation: userCorporationId || formData.corporation,
        region: selectedCorporation?.hasRegions ? formData.region : null,
        circle: selectedCorporation?.hasRegions ? formData.circle : null,
        kraYear: formData.kraYear,
        kra: formData.kra,
        annualTarget: parseFloat(formData.annualTarget),
        achievementDate: formData.achievementDate,
        kraAchievement: parseFloat(formData.kraAchievement),
        remarks: formData.remarks || "",
        contactNumber: userMobileNumber || formData.contactNumber,
        submittedBy: userFullName || undefined,
      };

      // Check for duplicate
      const duplicateCheck = await kraEntryApi.checkDuplicate(submitData);
      if (duplicateCheck.data.isDuplicate) {
        setSubmitStatus({
          type: "error",
          message:
            "या महिन्यासाठी आधीच एंट्री अस्तित्वात आहे | An entry for this month already exists for this combination",
        });
        setIsSubmitting(false);
        return;
      }

      // Submit data
      await kraEntryApi.create(submitData);

      setSubmitStatus({
        type: "success",
        message:
          "फॉर्म यशस्वीरित्या सबमिट झाला! | Form submitted successfully!",
      });

      // Reset form
      setFormData({
        corporation: userCorporationId || "",
        region: "",
        circle: "",
        kraYear: "",
        kraMonth: "",
        kra: "",
        annualTarget: "",
        achievementDate: "",
        kraAchievement: "",
        remarks: "",
        contactNumber: userMobileNumber || "",
      });
      setTouched({});
      setErrors({});
    } catch (error) {
      const errorMessage =
        error.response?.data?.error ||
        error.response?.data?.message ||
        "सबमिट करताना त्रुटी आली | Error submitting form";
      setSubmitStatus({
        type: "error",
        message: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
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
      kra: "",
      annualTarget: "",
      achievementDate: "",
      kraAchievement: "",
      remarks: "",
      contactNumber: userMobileNumber || "",
    });
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

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
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
            केआरए निरीक्षण डेटा एंट्री फॉर्म
          </p>
          <p className="text-sm md:text-base mt-2 opacity-80">
            जलसंपदा विभाग, महाराष्ट्र शासन
          </p>
          <p className="text-xs md:text-sm mt-1 opacity-70">
            Water Resources Department, Government of Maharashtra
          </p>
        </div>

        {/* Status Message */}
        {submitStatus.message && (
          <div
            className={`mx-4 mt-4 p-4 rounded-lg flex items-start gap-3 shadow-md ${
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
              {submitStatus.type === "success" && (
                <p className="text-sm mt-1 opacity-75">
                  You can submit another entry now.
                </p>
              )}
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
            <div className="section-content space-y-6">
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
                  <option value="">Choose</option>
                  {corporations.length > 0
                    ? corporations.map((corp) => (
                        <option key={corp._id} value={corp._id}>
                          {corp.name}
                        </option>
                      ))
                    : null}
                </select>
                {isCorporationLocked ? (
                  <p className="field-help">
                    <InfoIcon />
                    <span>Logged-in user corporation is locked.</span>
                  </p>
                ) : null}
                {errors.corporation && touched.corporation && (
                  <p className="form-error">
                    <ErrorIcon /> {errors.corporation}
                  </p>
                )}
              </div>

              {/* Region - Only shown for MKVDC */}
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
                    <option value="">Choose</option>
                    {regions.length > 0 ? (
                      regions.map((region) => (
                        <option key={region._id} value={region._id}>
                          {region.name}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="CEWRD">CE WRD, Pune</option>
                        <option value="CESP">CE SP, Pune</option>
                      </>
                    )}
                  </select>
                  {errors.region && touched.region && (
                    <p className="form-error">
                      <ErrorIcon /> {errors.region}
                    </p>
                  )}
                </div>
              )}

              {/* Circle - Only shown for MKVDC */}
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
                    <option value="">-- निवडा | Select --</option>
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

          {/* KRA Section */}
          <div className="border-b border-gray-200">
            <div className="section-header">
              <SectionIcon>
                <KRAIcon />
              </SectionIcon>
              फलनिष्पत्तीची क्षेत्रे KRA
            </div>
            <div className="section-content">
              {/* Two column grid for desktop */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* KRA Year */}
                <div>
                  <label htmlFor="kraYear" className="form-label">
                    फलनिष्पत्तीची क्षेत्रे (KRA) वर्ष
                    <span className="required-star">*</span>
                  </label>
                  <select
                    id="kraYear"
                    name="kraYear"
                    value={formData.kraYear}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={`form-select ${errors.kraYear && touched.kraYear ? "input-error" : ""}`}
                  >
                    <option value="">Choose</option>
                    {kraYears.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                  {errors.kraYear && touched.kraYear && (
                    <p className="form-error">
                      <ErrorIcon /> {errors.kraYear}
                    </p>
                  )}
                </div>

                {/* Month */}
                <div>
                  <label htmlFor="kraMonth" className="form-label">
                    महिन्याचे साध्य KRA
                    <span className="required-star">*</span>
                  </label>
                  <select
                    id="kraMonth"
                    name="kraMonth"
                    value={formData.kraMonth}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={`form-select ${errors.kraMonth && touched.kraMonth ? "input-error" : ""}`}
                  >
                    <option value="">Choose</option>
                    {months.map((month) => (
                      <option key={month.value} value={month.value}>
                        {month.label}
                      </option>
                    ))}
                  </select>
                  {errors.kraMonth && touched.kraMonth && (
                    <p className="form-error">
                      <ErrorIcon /> {errors.kraMonth}
                    </p>
                  )}
                </div>
              </div>

              {/* KRA Name - Full width */}
              <div className="mt-6">
                <label htmlFor="kra" className="form-label">
                  फलनिष्पत्तीची क्षेत्रे KRA
                  <span className="required-star">*</span>
                </label>
                <select
                  id="kra"
                  name="kra"
                  value={formData.kra}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  className={`form-select ${errors.kra && touched.kra ? "input-error" : ""}`}
                >
                  <option value="">Choose</option>
                  {kras.map((kra) => (
                    <option key={kra._id} value={kra._id}>
                      {kra.name}
                    </option>
                  ))}
                </select>
                {errors.kra && touched.kra && (
                  <p className="form-error">
                    <ErrorIcon /> {errors.kra}
                  </p>
                )}
              </div>

              {/* Annual Target - Full width */}
              <div className="mt-6">
                <label htmlFor="annualTarget" className="form-label">
                  KRA वार्षिक उद्दिष्ट
                  <span className="required-star">*</span>
                </label>
                <input
                  type="number"
                  id="annualTarget"
                  name="annualTarget"
                  value={formData.annualTarget}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  min="0"
                  step="any"
                  placeholder="0"
                  className={`form-input ${errors.annualTarget && touched.annualTarget ? "input-error" : ""}`}
                />
                {errors.annualTarget && touched.annualTarget && (
                  <p className="form-error">
                    <ErrorIcon /> {errors.annualTarget}
                  </p>
                )}
              </div>

              {/* Two column grid for date and achievement */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                {/* Achievement Date */}
                <div>
                  <label htmlFor="achievementDate" className="form-label">
                    महिन्याचे साध्य KRA (तारीख)
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
                  {formData.kraYear && (
                    <p className="field-help">
                      <InfoIcon />
                      <span>
                        तारीख आर्थिक वर्ष {formData.kraYear} मध्ये असणे आवश्यक
                        आहे
                      </span>
                    </p>
                  )}
                  {errors.achievementDate && touched.achievementDate && (
                    <p className="form-error">
                      <ErrorIcon /> {errors.achievementDate}
                    </p>
                  )}
                </div>

                {/* KRA Achievement */}
                <div>
                  <label htmlFor="kraAchievement" className="form-label">
                    KRA साध्य<span className="required-star">*</span>
                  </label>
                  <input
                    type="number"
                    id="kraAchievement"
                    name="kraAchievement"
                    value={formData.kraAchievement}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    min="0"
                    step="any"
                    placeholder="0"
                    className={`form-input ${errors.kraAchievement && touched.kraAchievement ? "input-error" : ""}`}
                  />
                  {errors.kraAchievement && touched.kraAchievement && (
                    <p className="form-error">
                      <ErrorIcon /> {errors.kraAchievement}
                    </p>
                  )}
                </div>
              </div>

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
              {userFullName ? (
                <div className="mb-5">
                  <label className="form-label" htmlFor="fullName">
                    Full Name
                  </label>
                  <input
                    id="fullName"
                    className="form-input"
                    value={userFullName}
                    readOnly
                    disabled
                  />
                </div>
              ) : null}

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
                <p className="field-help">
                  <InfoIcon />
                  <span>
                    {userMobileNumber
                      ? "Logged-in mobile number is used for submission"
                      : "10 अंकी भारतीय मोबाईल क्रमांक प्रविष्ट करा | Enter 10-digit Indian mobile number"}
                  </span>
                </p>
                {errors.contactNumber && touched.contactNumber && (
                  <p className="form-error">
                    <ErrorIcon /> {errors.contactNumber}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="px-6 py-8 bg-gradient-to-b from-gray-50 to-gray-100">
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                type="submit"
                disabled={!isFormValid() || isSubmitting}
                className="btn-primary flex items-center justify-center gap-2 min-w-[220px]"
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
                      चिन्हांकित फील्ड आवश्यक आहेत | Fields marked with * are
                      mandatory
                    </li>
                    <li>
                      • प्रत्येक महिन्यासाठी फक्त एक एंट्री अनुमत आहे | Only one
                      entry allowed per month
                    </li>
                    <li>
                      • तारीख निवडलेल्या आर्थिक वर्षात असणे आवश्यक आहे | Date
                      must be within selected financial year
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
            <div className="mt-3 flex items-center justify-center gap-2 text-xs text-gray-400">
              <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              System Online
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KRAForm;
