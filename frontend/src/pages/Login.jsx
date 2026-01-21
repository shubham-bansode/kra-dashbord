import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const getApiErrorMessage = (err, fallback) => {
  const firstValidationError = err?.response?.data?.errors?.[0]?.message;
  return firstValidationError || err?.response?.data?.message || fallback;
};

const normalizeIndianMobile = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  const last10 = digits.length > 10 ? digits.slice(-10) : digits;
  return last10;
};

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [mobileNumber, setMobileNumber] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await login({ mobileNumber, password });
      const nextPath = location.state?.from?.pathname || "/";
      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, "Login failed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden">
        <div className="bg-gov-blue text-white px-6 py-5 border-b-4 border-gov-orange">
          <h1 className="text-xl font-bold">Login</h1>
          <p className="text-sm opacity-90">मोबाईल क्रमांक आणि पासवर्ड</p>
        </div>

        <form className="p-6" onSubmit={onSubmit}>
          <label className="form-label" htmlFor="mobileNumber">
            मोबाईल क्रमांक
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

          <div className="mt-4">
            <label className="form-label" htmlFor="password">
              पासवर्ड
            </label>
            <input
              id="password"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
            />
          </div>

          {error ? (
            <div className="mt-4 text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 text-sm font-medium">
              {error}
            </div>
          ) : null}

          <button className="btn-primary w-full mt-6" disabled={isSubmitting}>
            {isSubmitting ? "Logging in..." : "Login"}
          </button>

          <div className="mt-4 text-sm text-gray-600">
            खाते नाही?{" "}
            <Link
              className="text-gov-blue font-bold hover:underline"
              to="/signup"
            >
              Signup
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
