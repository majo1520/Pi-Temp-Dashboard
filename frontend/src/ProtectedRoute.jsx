// src/ProtectedRoute.jsx
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import * as api from "./services/api";

export default function ProtectedRoute({ children }) {
  const [checking, setChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    api.checkSession()
      .then(data => {
        setIsAuthenticated(data.loggedIn);
        setChecking(false);
      })
      .catch(() => {
        setIsAuthenticated(false);
        setChecking(false);
      });
  }, []);

  if (checking) return <div>Načítavam...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}
