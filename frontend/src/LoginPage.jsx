import { useState } from "react";
import { useNavigate } from "react-router-dom";
import * as api from "./services/api";
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from "./components/LanguageSwitcher";

export default function LoginPage() {
  const { t } = useTranslation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isAccountDisabled, setIsAccountDisabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setIsAccountDisabled(false);

    try {
      const data = await api.login(username, password);

      if (data.success) {
        navigate("/admin");
      } else {
        // Check if this is a disabled account error
        if (data.error === 'account_disabled') {
          setIsAccountDisabled(true);
          setError(t('accountDisabledMessage'));
        } else {
          setError(data.message || t('invalidCredentials') || "Invalid credentials");
        }
      }
    } catch (err) {
      console.error("Login error:", err);
      setError(t('serverConnectionError') || "Error connecting to server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 p-8 rounded shadow-md w-full max-w-sm">
        <div className="flex justify-between items-center mb-4">
          {/* Back to main page */}
          <button
            onClick={() => navigate("/")}
            className="text-sm text-blue-600 hover:underline flex items-center"
          >
            ← {t('backToHomepage') || 'Back to homepage'}
          </button>
          
          {/* Language Switcher */}
          <LanguageSwitcher />
        </div>

        <h2 className="text-2xl font-semibold mb-4 text-center text-gray-800 dark:text-white">
          {t('login')}
        </h2>

        <form onSubmit={handleLogin}>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t('usernameOrEmail') || "Email or username"}
            className="w-full px-4 py-2 mb-4 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            required
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('password')}
            className="w-full px-4 py-2 mb-4 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            required
          />

          {error && (
            <div className={`text-sm mb-3 p-2 rounded ${isAccountDisabled ? 'bg-orange-100 text-orange-800' : 'text-red-500'}`}>
              {isAccountDisabled && (
                <div className="font-bold mb-1">{t('accountDisabled')}</div>
              )}
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || isAccountDisabled}
            className={`w-full py-2 px-4 rounded text-white ${
              loading || isAccountDisabled ? "bg-blue-300" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {loading ? (t('loggingIn') || "Logging in...") : t('login')}
          </button>
        </form>
      </div>
    </div>
  );
}
