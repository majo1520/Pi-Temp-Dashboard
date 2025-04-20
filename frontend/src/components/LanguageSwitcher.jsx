import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Language Switcher Component
 * Allows users to switch between supported languages
 */
function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  
  const languages = [
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'sk', name: 'Slovenčina', flag: '🇸🇰' },
  ];

  const changeLanguage = (langCode) => {
    i18n.changeLanguage(langCode);
    setIsOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const currentLang = languages.find(lang => lang.code === i18n.language) || languages[0];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-blue-500 hover:bg-blue-700 transition-colors"
        title="Change language / Zmeniť jazyk"
      >
        <span className="font-bold text-white text-sm">
          {currentLang.flag} {currentLang.code.toUpperCase()}
        </span>
        <svg 
          className={`h-4 w-4 text-white transition-transform ${isOpen ? 'rotate-180' : ''}`} 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {isOpen && (
        <div className="absolute top-full mt-1 right-0 bg-white dark:bg-gray-800 rounded shadow-lg z-10 border border-gray-200 dark:border-gray-700 min-w-[150px]">
          <ul className="py-1">
            {languages.map((lang) => (
              <li key={lang.code}>
                <button
                  onClick={() => changeLanguage(lang.code)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 ${
                    i18n.language === lang.code 
                      ? 'bg-blue-100 dark:bg-blue-800 font-medium text-blue-700 dark:text-blue-200' 
                      : 'text-gray-800 dark:text-gray-200'
                  }`}
                >
                  <span className="text-lg">{lang.flag}</span>
                  <span>{lang.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default LanguageSwitcher; 