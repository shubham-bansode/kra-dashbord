import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { corporationApi } from "../services/api";
import AuthSwitch from "../components/ui/auth-switch";

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

  const handleSignUp = async (data: { name: string; email: string; password: string; mobile: string }) => {
    if (!corporation) {
      setError("Please select a corporation");
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      await register({ 
        corporation, 
        fullName: data.name, 
        mobileNumber: data.mobile, 
        password: data.password 
      });
      navigate("/", { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, "Signup failed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-br from-blue-50 to-cyan-50">
      <div className="w-full max-w-lg space-y-4">
        {/* Corporation Selector */}
        <div className="bg-white rounded-xl shadow-xl border border-gray-100 p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            महामंडळ निवडा (Select Corporation)
          </label>
          <select
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gov-blue focus:border-transparent outline-none transition"
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
        </div>

        {/* Auth Switch Component */}
        <AuthSwitch 
          defaultMode="signup"
          onSignUp={handleSignUp}
        />

        {error && (
          <div className="text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 text-sm font-medium">
            {error}
          </div>
        )}

        <div className="text-center">
          <Link
            className="text-gov-blue font-semibold hover:underline text-sm"
            to="/login"
          >
            ← Already have an account? Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
