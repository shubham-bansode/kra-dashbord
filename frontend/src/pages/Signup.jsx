import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { corporationApi } from "../services/api";

const getApiErrorMessage = (err, fallback) => {
  const firstValidationError = err?.response?.data?.errors?.[0]?.message;
  return firstValidationError || err?.response?.data?.message || fallback;
};

const normalizeIndianMobile = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  // If user pastes +91XXXXXXXXXX or 0XXXXXXXXXX, keep last 10 digits
  const last10 = digits.length > 10 ? digits.slice(-10) : digits;
  return last10;
};

export default function Signup() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [corporations, setCorporations] = useState([]);
  const [corporation, setCorporation] = useState("");
  const [fullName, setFullName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [password, setPassword] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const res = await corporationApi.getAll();
        setCorporations(res.data?.data || []);
      } catch (e) {
        setError(e.response?.data?.message || "Failed to load corporations");
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await register({ corporation, fullName, mobileNumber, password });
      navigate("/", { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, "Signup failed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden">
        <div className="bg-gov-blue text-white px-6 py-5 border-b-4 border-gov-orange">
          <h1 className="text-xl font-bold">Signup</h1>
          <p className="text-sm opacity-90">User Registration</p>
        </div>

        <form className="p-6" onSubmit={onSubmit}>
          <label className="form-label" htmlFor="corporation">
            महामंडळ निवडा
          </label>
          <select
            id="corporation"
            className="form-select"
            value={corporation}
            onChange={(e) => setCorporation(e.target.value)}
            disabled={isLoading}
            required
          >
            <option value="">Select corporation</option>
            {corporations.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>

          <div className="mt-4">
            <label className="form-label" htmlFor="fullName">
              Full Name
            </label>
            <input
              id="fullName"
              className="form-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full name"
              required
            />
          </div>

          <div className="mt-4">
            <label className="form-label" htmlFor="mobileNumber">
              Mobile Number
            </label>
            <input
              id="mobileNumber"
              type="tel"
              className="form-input"
              value={mobileNumber}
              onChange={(e) =>
                setMobileNumber(normalizeIndianMobile(e.target.value))
              }
              inputMode="numeric"
              placeholder="10-digit mobile"
              maxLength={10}
              pattern="[6-9][0-9]{9}"
              title="Enter a valid 10-digit Indian mobile number (starts with 6-9)"
              required
            />
            <p className="field-help">
              Mobile number must be 10 digits (starts with 6-9)
            </p>
          </div>

          <div className="mt-4">
            <label className="form-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
              required
            />
          </div>

          {error ? (
            <div className="mt-4 text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 text-sm font-medium">
              {error}
            </div>
          ) : null}

          <button
            className="btn-primary w-full mt-6"
            disabled={isSubmitting || isLoading}
          >
            {isSubmitting ? "Creating account..." : "Create Account"}
          </button>

          <div className="mt-4 text-sm text-gray-600">
            आधीपासून खाते आहे?{" "}
            <Link
              className="text-gov-blue font-bold hover:underline"
              to="/login"
            >
              Login
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
