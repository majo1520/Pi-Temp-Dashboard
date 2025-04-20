import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Custom hook for managing authentication
 * @param {Object} errorHandler - Error handler from useErrorHandler hook
 * @returns {Object} Authentication state and functions
 */
function useAuth(errorHandler) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const navigate = useNavigate();
  
  const { handleError, withErrorHandling } = errorHandler || {};

  /**
   * Check current session status
   */
  const checkSession = useCallback(async () => {
    try {
      const res = await fetch('/api/session');
      const data = await res.json();
      setLoggedIn(data.loggedIn);
      if (data.user) {
        setUser(data.user);
      }
    } catch (error) {
      if (handleError) {
        handleError(error, 'session-check');
      } else {
        console.error('Error checking session:', error);
      }
      setLoggedIn(false);
    }
  }, [handleError]);

  /**
   * Log out the current user
   */
  const handleLogout = useCallback(async () => {
    try {
      await fetch("/api/logout", { method: "POST" });
      setLoggedIn(false);
      setUser(null);
      navigate("/");
    } catch (error) {
      if (handleError) {
        handleError(error, 'logout');
      } else {
        console.error("Error during logout:", error);
      }
    }
  }, [navigate, handleError]);

  /**
   * Log in a user with credentials
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<boolean>} Success status
   */
  const login = useCallback(async (username, password) => {
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });
      
      if (!response.ok) {
        throw new Error('Login failed');
      }
      
      const data = await response.json();
      setLoggedIn(true);
      setUser(data.user);
      return true;
    } catch (error) {
      if (handleError) {
        handleError(error, 'login');
      } else {
        console.error('Login error:', error);
      }
      return false;
    }
  }, [handleError]);

  // Check session on initial load
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  return {
    loggedIn,
    user,
    login: withErrorHandling ? withErrorHandling(login, 'login') : login,
    logout: handleLogout,
    checkSession
  };
}

export default useAuth; 