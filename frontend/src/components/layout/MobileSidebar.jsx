import React, { useState } from 'react';
import { useChart } from '../../contexts/ChartContext';
import { useTranslation } from 'react-i18next';

/**
 * Mobile-optimized sidebar designed for touch interfaces
 * @param {Object} props
 * @param {boolean} props.isVisible - Whether the sidebar is currently visible
 * @param {Function} props.onClose - Function to close the sidebar
 */
const MobileSidebar = ({ isVisible, onClose }) => {
  const { t } = useTranslation();
  const {
    // Chart display
    visibleGraphs,
    chartMode,
    setChartMode,
    
    // Thresholds
    displayThresholds,
    toggleDisplayThresholds,
    
    // Heatmap settings
    heatmapType,
    setHeatmapType,
    setPreferMatrixHeatmap,
    updateHeatmapType,
    
    // Aggregation
    aggregationOptions,
    toggleAggregation,
    
    // Helper functions
    handleKobercovyToggle,
    handleOtherGraphToggle
  } = useChart();

  // Using tabs for better mobile UX
  const [activeTab, setActiveTab] = useState('charts');

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-75 z-50 flex items-end sm:items-center justify-center">
      <div 
        className="bg-white dark:bg-gray-800 w-full h-[85vh] sm:h-auto sm:max-h-[90vh] sm:w-[350px] rounded-t-xl sm:rounded-xl overflow-hidden shadow-lg flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between border-b dark:border-gray-700">
          <h2 className="text-lg font-semibold">{t('settings')}</h2>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            aria-label="Close sidebar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Navigation tabs */}
        <div className="flex border-b dark:border-gray-700">
          <button
            className={`flex-1 py-3 px-4 font-medium text-sm ${
              activeTab === 'charts' 
                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400' 
                : 'text-gray-500 dark:text-gray-400'
            }`}
            onClick={() => setActiveTab('charts')}
          >
            {t('chartsAndVisualizations')}
          </button>
          <button
            className={`flex-1 py-3 px-4 font-medium text-sm ${
              activeTab === 'aggregation' 
                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400' 
                : 'text-gray-500 dark:text-gray-400'
            }`}
            onClick={() => setActiveTab('aggregation')}
          >
            {t('dataAggregations')}
          </button>
        </div>
        
        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Chart tab content */}
          {activeTab === 'charts' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-medium mb-3 text-gray-800 dark:text-gray-200">
                  {t('visibleCharts')}
                </h3>
                <div className="space-y-3">
                  {Object.entries(visibleGraphs).map(([key, value]) => (
                    <div 
                      key={key} 
                      className="flex items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg touch-manipulation"
                      onClick={() => {
                        if (key === 'koberec') {
                          handleKobercovyToggle();
                        } else {
                          handleOtherGraphToggle(key);
                        }
                      }}
                    >
                      <input
                        type="checkbox"
                        id={`mobile-${key}`}
                        checked={value}
                        readOnly
                        className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <label 
                        htmlFor={`mobile-${key}`} 
                        className="ml-3 flex-1 text-gray-700 dark:text-gray-200 capitalize"
                      >
                        {key === "teplota"
                          ? <span><span className="mr-1">🌡️</span>{t('temperature')}</span>
                          : key === "vlhkost"
                          ? <span><span className="mr-1">💧</span>{t('humidity')}</span>
                          : key === "tlak"
                          ? <span><span className="mr-1">🧭</span>{t('pressure')}</span>
                          : <span><span className="mr-1">🗺️</span>{t('heatmap')}</span>}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              
              <div>
                <h3 className="font-medium mb-3 text-gray-800 dark:text-gray-200">
                  {t('displayMode')}
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setChartMode("merged")}
                    className={`py-3 text-center rounded-lg ${
                      chartMode === "merged" 
                        ? "bg-blue-600 text-white" 
                        : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    {t('merged')}
                  </button>
                  <button
                    onClick={() => setChartMode("separate")}
                    className={`py-3 text-center rounded-lg ${
                      chartMode === "separate" 
                        ? "bg-blue-600 text-white" 
                        : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    {t('separate')}
                  </button>
                </div>
              </div>
              
              {visibleGraphs.koberec && (
                <div>
                  <h3 className="font-medium mb-3 text-gray-800 dark:text-gray-200">
                    {t('heatmapStyle')}
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => updateHeatmapType("matrix")}
                      className={`py-3 text-center rounded-lg ${
                        heatmapType === "matrix" 
                          ? "bg-blue-600 text-white" 
                          : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                      }`}
                    >
                      {t('matrix')}
                    </button>
                    <button
                      onClick={() => updateHeatmapType("calendar")}
                      className={`py-3 text-center rounded-lg ${
                        heatmapType === "calendar" 
                          ? "bg-blue-600 text-white" 
                          : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                      }`}
                    >
                      {t('calendar')}
                    </button>
                  </div>
                </div>
              )}
              
              <div>
                <div 
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg touch-manipulation"
                  onClick={() => toggleDisplayThresholds()}
                >
                  <span className="text-gray-700 dark:text-gray-200">
                    {t('showThresholds')}
                  </span>
                  <div className={`w-12 h-6 rounded-full ${displayThresholds ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'} relative`}>
                    <div 
                      className={`absolute w-5 h-5 rounded-full bg-white top-0.5 transition-all ${
                        displayThresholds ? 'right-0.5' : 'left-0.5'
                      }`} 
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Aggregation tab content */}
          {activeTab === 'aggregation' && (
            <div className="space-y-4">
              <h3 className="font-medium mb-3 text-gray-800 dark:text-gray-200">
                {t('dataAggregationOptions')}
              </h3>
              
              <div 
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg touch-manipulation"
                onClick={() => toggleAggregation('min')}
              >
                <div className="flex items-center">
                  <span className="text-blue-600 mr-2">📉</span>
                  <span className="text-gray-700 dark:text-gray-200">{t('minValues')}</span>
                </div>
                <div className={`w-12 h-6 rounded-full ${aggregationOptions.min ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'} relative`}>
                  <div 
                    className={`absolute w-5 h-5 rounded-full bg-white top-0.5 transition-all ${
                      aggregationOptions.min ? 'right-0.5' : 'left-0.5'
                    }`} 
                  />
                </div>
              </div>
              
              <div 
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg touch-manipulation"
                onClick={() => toggleAggregation('avg')}
              >
                <div className="flex items-center">
                  <span className="text-green-600 mr-2">📊</span>
                  <span className="text-gray-700 dark:text-gray-200">{t('avgValues')}</span>
                </div>
                <div className={`w-12 h-6 rounded-full ${aggregationOptions.avg ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'} relative`}>
                  <div 
                    className={`absolute w-5 h-5 rounded-full bg-white top-0.5 transition-all ${
                      aggregationOptions.avg ? 'right-0.5' : 'left-0.5'
                    }`} 
                  />
                </div>
              </div>
              
              <div 
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg touch-manipulation"
                onClick={() => toggleAggregation('max')}
              >
                <div className="flex items-center">
                  <span className="text-red-600 mr-2">📈</span>
                  <span className="text-gray-700 dark:text-gray-200">{t('maxValues')}</span>
                </div>
                <div className={`w-12 h-6 rounded-full ${aggregationOptions.max ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'} relative`}>
                  <div 
                    className={`absolute w-5 h-5 rounded-full bg-white top-0.5 transition-all ${
                      aggregationOptions.max ? 'right-0.5' : 'left-0.5'
                    }`} 
                  />
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Footer with action buttons */}
        <div className="p-4 border-t dark:border-gray-700">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-lg bg-blue-600 text-white font-medium text-center"
          >
            {t('done')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MobileSidebar; 