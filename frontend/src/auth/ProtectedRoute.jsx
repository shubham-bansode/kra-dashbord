import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { token, user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center bg-white p-8 rounded-xl shadow-lg">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-lg text-gray-700 font-semibold">Loading...</div>
        </div>
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Check admin access
  if (requireAdmin) {
    const isAdmin = user?.role === "admin" || user?.role === "superadmin";
    if (!isAdmin) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-12 text-center max-w-md">
            <div className="text-6xl mb-6">🔒</div>
            <h1 className="text-3xl font-bold text-red-600 mb-4">
              Access Denied
            </h1>
            <p className="text-xl text-gray-600 mb-2">प्रवेश नाकारला</p>
            <p className="text-lg text-gray-500 mb-8">
              Admin access required to view this page.
            </p>
            <a
              href="/"
              className="inline-block px-8 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-all duration-300"
            >
              Go Back Home
            </a>
          </div>
        </div>
      );
    }
  }

  return children;
}
