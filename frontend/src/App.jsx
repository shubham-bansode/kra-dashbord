import { Link, Route, Routes } from "react-router-dom";
import KRAForm from "./components/KRAForm";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ProtectedRoute from "./auth/ProtectedRoute";
import { useAuth } from "./auth/AuthContext";

function App() {
  const { token, user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-gray-100">
      {/* Top Banner */}
      <div className="bg-gov-orange h-1.5"></div>

      <div className="bg-white/80 backdrop-blur border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="font-bold text-gov-blue">
            KRA Monitoring
          </Link>
          <div className="flex items-center gap-3">
            {token ? (
              <>
                <div className="text-sm text-gray-700">
                  {user?.fullName ? user.fullName : "User"}
                </div>
                <button className="btn-secondary py-2 px-4" onClick={logout}>
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  className="text-sm font-bold text-gov-blue hover:underline"
                  to="/login"
                >
                  Login
                </Link>
                <Link
                  className="text-sm font-bold text-gov-blue hover:underline"
                  to="/signup"
                >
                  Signup
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <KRAForm />
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
      </Routes>

      {/* Bottom Banner */}
      <div className="bg-gov-blue h-1"></div>
    </div>
  );
}

export default App;
