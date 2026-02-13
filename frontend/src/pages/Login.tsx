import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import AuthSwitch from "../components/ui/auth-switch";

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

  const handleSignIn = async (data: { email: string; password: string }) => {
    setError("");
    setIsSubmitting(true);

    try {
      // Use email as mobile number for now, or adapt as needed
      await login({ mobileNumber: data.email, password: data.password });
      const nextPath = location.state?.from?.pathname || "/";
      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err, "Login failed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-br from-blue-50 to-cyan-50">
      <div className="w-full max-w-md">
        <AuthSwitch 
          defaultMode="signin"
          onSignIn={handleSignIn}
        />
        
        {error && (
          <div className="mt-4 text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 text-sm font-medium">
            {error}
          </div>
        )}
        
        <div className="mt-6 text-center">
          <Link
            className="text-gov-blue font-semibold hover:underline text-sm"
            to="/signup"
          >
            Don't have an account? Sign up →
          </Link>
        </div>
      </div>
    </div>
  );
}
