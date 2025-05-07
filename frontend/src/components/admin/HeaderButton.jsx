import React from 'react';

/**
 * Simple header action button component
 */
const HeaderButton = ({ icon, label, onClick, color = "gray", disabled = false }) => (
  <button
    onClick={onClick}
    className={`flex items-center px-3 py-1.5 text-sm rounded transition-colors
      ${color === "red" 
        ? "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50" 
        : color === "blue"
        ? "bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
        : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"}
    `}
    title={label}
    disabled={disabled}
  >
    <span className="mr-1.5">{icon}</span>
    <span>{label}</span>
  </button>
);

export default HeaderButton; 