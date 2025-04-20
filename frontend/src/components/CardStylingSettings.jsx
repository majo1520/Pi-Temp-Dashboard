import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useChart } from '../contexts/ChartContext';

/**
 * Component for configuring sensor card styling (color and opacity)
 * 
 * @param {Object} props
 * @returns {JSX.Element}
 */
const CardStylingSettings = () => {
  const { t } = useTranslation();
  const { cardStyling, updateCardStyling } = useChart();
  
  const handleBackgroundColorChange = (e) => {
    updateCardStyling({ backgroundColor: e.target.value });
  };
  
  const handleBorderColorChange = (e) => {
    updateCardStyling({ borderColor: e.target.value });
  };
  
  const handleOpacityChange = (e) => {
    const value = parseInt(e.target.value, 10);
    updateCardStyling({ opacity: value });
  };
  
  // Example card to preview the styles
  const cardPreviewStyle = {
    backgroundColor: cardStyling.backgroundColor,
    opacity: cardStyling.opacity / 100,
    borderColor: cardStyling.borderColor,
    border: `1px solid ${cardStyling.borderColor}`,
    padding: '12px',
    borderRadius: '0.375rem',
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    width: '100%',
    marginTop: '12px',
    marginBottom: '12px',
    transition: 'all 0.3s ease'
  };
  
  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {t('cardStylingDescription') || 'Customize the appearance of sensor cards by adjusting colors and opacity.'}
      </div>
      
      {/* Example card with current styling */}
      <div style={cardPreviewStyle}>
        <div className="text-sm font-medium mb-2">{t('previewCard')}</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="text-xs">{t('temperature')}: 22.5°C</div>
          <div className="text-xs">{t('humidity')}: 45%</div>
          <div className="text-xs">{t('pressure')}: 1013 hPa</div>
          <div className="text-xs">{t('lastUpdate')}: 5m ago</div>
        </div>
      </div>
      
      {/* Background color picker */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t('backgroundColor') || 'Background Color'}
        </label>
        <div className="flex items-center">
          <input
            type="color"
            value={cardStyling.backgroundColor}
            onChange={handleBackgroundColorChange}
            className="w-10 h-10 rounded border mr-2 cursor-pointer"
          />
          <input
            type="text"
            value={cardStyling.backgroundColor}
            onChange={handleBackgroundColorChange}
            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
          />
        </div>
      </div>
      
      {/* Border color picker */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t('borderColor') || 'Border Color'}
        </label>
        <div className="flex items-center">
          <input
            type="color"
            value={cardStyling.borderColor}
            onChange={handleBorderColorChange}
            className="w-10 h-10 rounded border mr-2 cursor-pointer"
          />
          <input
            type="text"
            value={cardStyling.borderColor}
            onChange={handleBorderColorChange}
            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
          />
        </div>
      </div>
      
      {/* Opacity slider */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t('opacity') || 'Opacity'}: {cardStyling.opacity}%
        </label>
        <input
          type="range"
          min="20"
          max="100"
          value={cardStyling.opacity}
          onChange={handleOpacityChange}
          className="w-full"
        />
      </div>
      
      {/* Reset button */}
      <div className="mt-4">
        <button
          onClick={() => updateCardStyling({
            backgroundColor: "#FFFFFF",
            borderColor: "#E5E7EB",
            opacity: 100
          })}
          className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded transition-colors"
        >
          {t('resetToDefault') || 'Reset to Default'}
        </button>
      </div>
    </div>
  );
};

export default CardStylingSettings; 