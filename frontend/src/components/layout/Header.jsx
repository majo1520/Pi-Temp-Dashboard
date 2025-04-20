import React from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../../contexts/ThemeContext';
import { useFilter } from '../../contexts/FilterContext';
import LanguageSwitcher from '../LanguageSwitcher';
import { useTranslation } from 'react-i18next';

/**
 * Header component with navigation and actions
 * @param {Object} props - Component props
 * @param {Function} props.toggleSidebar - Function to toggle sidebar visibility 
 * @param {Object} props.auth - Authentication object containing loggedIn and logout function
 */
function Header({ toggleSidebar, auth }) {
  const { darkMode, toggleDarkMode } = useTheme();
  const { autoRefresh, setAutoRefresh, rangeKey } = useFilter();
  const { t } = useTranslation();
  const { loggedIn, logout } = auth;

  return (
    <header className="bg-blue-600 text-white py-6 shadow-md">
      <div className="container mx-auto px-4 flex flex-wrap items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={toggleSidebar}
            className="px-4 py-2 bg-blue-500 rounded hover:bg-blue-700"
            title="Prepnúť bočný panel"
          >
            ☰
          </button>
          <h1 className="text-3xl font-bold">{t('dashboardTitle')}</h1>
        </div>
        <div className="flex gap-3 items-center">
          <LanguageSwitcher />
          
          <button
            onClick={toggleDarkMode}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-blue-500 hover:bg-blue-700 transition-colors"
            title={darkMode ? "Prepnúť na svetlý režim" : "Prepnúť na tmavý režim"}
          >
            {darkMode ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span className="text-white text-sm whitespace-nowrap">{t('lightMode')}</span>
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
                <span className="text-white text-sm whitespace-nowrap">{t('darkMode')}</span>
              </>
            )}
          </button>
          
          <button
            onClick={() => setAutoRefresh((prev) => !prev)}
            disabled={rangeKey !== "live"}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full transition-colors ${
              rangeKey === "live"
                ? "bg-blue-500 text-white hover:bg-blue-700" 
                : "bg-blue-400/50 text-white/60 cursor-not-allowed"
            }`}
            title="Zapnúť alebo vypnúť automatické načítavanie dát"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="text-sm whitespace-nowrap">
              {autoRefresh ? t('autoRefreshOn') : t('autoRefreshOff')}
            </span>
          </button>
          
          {loggedIn ? (
            <>
              <Link to="/admin" className="text-white underline hover:text-gray-200">{t('admin')}</Link>
              <button
                onClick={logout}
                className="text-white underline hover:text-gray-200"
                title="Odhlásiť"
              >
                {t('logout')}
              </button>
            </>
          ) : (
            <Link to="/login" className="text-white underline hover:text-gray-200">{t('login')}</Link>
          )}
        </div>
      </div>
    </header>
  );
}

export default React.memo(Header); 