import React, { useState } from 'react';
import { useChart } from '../../contexts/ChartContext';
import { useTranslation } from 'react-i18next';
import { useFilter } from '../../contexts/FilterContext';
import ThresholdSettings from '../ThresholdSettings';
import CardStylingSettings from '../CardStylingSettings';
import LocationColorSettings from '../LocationColorSettings';

// Component for collapsible section
const CollapsibleSection = ({ title, icon, children, defaultExpanded = false }) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  
  return (
    <div className="mb-4 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button 
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        onClick={() => setIsExpanded(prev => !prev)}
      >
        <span className="flex items-center font-medium w-full">
          <span className="mr-2 text-xl">{icon}</span>
          <span className="flex-1 text-center">{title}</span>
        </span>
        <span className="text-gray-500 dark:text-gray-400 ml-2">
          {isExpanded ? '▼' : '►'}
        </span>
      </button>
      
      {isExpanded && (
        <div className="p-4 bg-white dark:bg-gray-800">
          {children}
        </div>
      )}
    </div>
  );
};

/**
 * Improved sidebar component for dashboard settings and controls
 */
function Sidebar() {
  const { t } = useTranslation();
  const {
    // Chart display
    visibleGraphs,
    chartMode,
    setChartMode,
    
    // Thresholds
    thresholds,
    setThresholds,
    heatmapThresholds,
    setHeatmapThresholds,
    displayThresholds,
    toggleDisplayThresholds,
    
    // Heatmap settings - removed showHeatmapXLabels and setShowHeatmapXLabels
    heatmapType,
    setHeatmapType,
    updateHeatmapType,
    heatmapField,
    setHeatmapField,
    
    // Aggregation
    aggregationOptions,
    toggleAggregation,
    
    // UI state
    showHeatmapSettings,
    setShowHeatmapSettings,
    showTempThresholds,
    setShowTempThresholds,
    showHumidityThresholds,
    setShowHumidityThresholds,
    showPressureThresholds,
    setShowPressureThresholds,
    showCardStylingSettings,
    setShowCardStylingSettings,
    
    // Helper functions
    handleKobercovyToggle,
    handleOtherGraphToggle,
    setPreferMatrixHeatmap
  } = useChart();
  
  const { 
    selectedLocations, 
    setSelectedLocationsAsDefault 
  } = useFilter();
  
  return (
    <aside
      className="w-72 p-4 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700"
      style={{ position: "sticky", top: 0, maxHeight: "100vh", overflowY: "auto" }}
    >
      <div className="flex items-center justify-center mb-6 p-2 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-bold text-gray-800 dark:text-white">{t('sidebarTitle')}</h2>
      </div>

      {/* Charts Section */}
      <CollapsibleSection title={t('chartsAndVisualizations')} icon="📊" defaultExpanded={true}>
        <div className="space-y-2">
          {Object.entries(visibleGraphs).map(([key, value]) => (
            <div key={key} className="flex items-center p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
              <input
                type="checkbox"
                id={key}
                checked={value}
                onChange={key === 'koberec' 
                  ? handleKobercovyToggle 
                  : () => handleOtherGraphToggle(key)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <label htmlFor={key} className="ml-2 text-gray-700 dark:text-gray-200 capitalize cursor-pointer">
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
        
        <div className="mt-4">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">{t('displayMode')}</div>
          <div className="flex gap-2">
            <button
              onClick={() => setChartMode("merged")}
              className={`flex-1 ${
                chartMode === "merged" 
                  ? "bg-blue-600 text-white" 
                  : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600"
              } rounded-md px-3 py-2 text-sm font-medium transition-colors`}
              title="Zlúčiť všetky dáta do jedného grafu"
            >
              {t('merged')}
            </button>
            <button
              onClick={() => setChartMode("separate")}
              className={`flex-1 ${
                chartMode === "separate" 
                  ? "bg-blue-600 text-white" 
                  : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600"
              } rounded-md px-3 py-2 text-sm font-medium transition-colors`}
              title="Zobraziť každý senzor zvlášť"
            >
              {t('separate')}
            </button>
          </div>
        </div>
      </CollapsibleSection>

      {/* Location Colors Section */}
      <CollapsibleSection title={t('locationColors') || "Location Colors"} icon="🔵" defaultExpanded={false}>
        <LocationColorSettings />
      </CollapsibleSection>

      {/* Aggregation Section */}
      <CollapsibleSection title={t('dataAggregations')} icon="📈" defaultExpanded={false}>
        <div className="space-y-2">
          <div className="flex items-center p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
            <input
              type="checkbox"
              id="agg-min"
              checked={aggregationOptions.min}
              onChange={() => toggleAggregation('min')}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="agg-min" className="ml-2 text-gray-700 dark:text-gray-200 cursor-pointer flex items-center">
              <span>{t('minValues')}</span>
              <span className="ml-2 text-blue-500">📉</span>
            </label>
          </div>
          
          <div className="flex items-center p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
            <input
              type="checkbox"
              id="agg-avg"
              checked={aggregationOptions.avg}
              onChange={() => toggleAggregation('avg')}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="agg-avg" className="ml-2 text-gray-700 dark:text-gray-200 cursor-pointer flex items-center">
              <span>{t('avgValues')}</span>
              <span className="ml-2 text-green-500">📊</span>
            </label>
          </div>
          
          <div className="flex items-center p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
            <input
              type="checkbox"
              id="agg-max"
              checked={aggregationOptions.max}
              onChange={() => toggleAggregation('max')}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="agg-max" className="ml-2 text-gray-700 dark:text-gray-200 cursor-pointer flex items-center">
              <span>{t('maxValues')}</span>
              <span className="ml-2 text-red-500">📈</span>
            </label>
          </div>
        </div>
      </CollapsibleSection>

      {/* Threshold Controls Section */}
      <CollapsibleSection title={t('thresholdSettings')} icon="⚙️" defaultExpanded={false}>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-700 dark:text-gray-200"><span className="mr-1">🌡️</span>{t('temperature')}</span>
            <button
              onClick={() => setShowTempThresholds((prev) => !prev)}
              className="px-3 py-1 text-xs rounded bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-700 transition-colors"
            >
              {showTempThresholds ? t('hide') : t('edit')}
            </button>
          </div>
          
          {showTempThresholds && (
            <div className="mt-2 p-3 bg-gray-100 dark:bg-gray-700 rounded">
              <ThresholdSettings 
                title={"🌡️ " + t('temperature')}
                thresholdValues={thresholds.teplota}
                onUpdate={(newValues) => setThresholds(prev => ({
                  ...prev,
                  teplota: newValues
                }))}
              />
            </div>
          )}
          
          <div className="flex justify-between items-center">
            <span className="text-gray-700 dark:text-gray-200"><span className="mr-1">💧</span>{t('humidity')}</span>
            <button
              onClick={() => setShowHumidityThresholds((prev) => !prev)}
              className="px-3 py-1 text-xs rounded bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-700 transition-colors"
            >
              {showHumidityThresholds ? t('hide') : t('edit')}
            </button>
          </div>
          
          {showHumidityThresholds && (
            <div className="mt-2 p-3 bg-gray-100 dark:bg-gray-700 rounded">
              <ThresholdSettings 
                title={"💧 " + t('humidity')}
                thresholdValues={thresholds.vlhkost}
                onUpdate={(newValues) => setThresholds(prev => ({
                  ...prev,
                  vlhkost: newValues
                }))}
              />
            </div>
          )}
          
          <div className="flex justify-between items-center">
            <span className="text-gray-700 dark:text-gray-200"><span className="mr-1">🧭</span>{t('pressure')}</span>
            <button
              onClick={() => setShowPressureThresholds((prev) => !prev)}
              className="px-3 py-1 text-xs rounded bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-700 transition-colors"
            >
              {showPressureThresholds ? t('hide') : t('edit')}
            </button>
          </div>
          
          {showPressureThresholds && (
            <div className="mt-2 p-3 bg-gray-100 dark:bg-gray-700 rounded">
              <ThresholdSettings 
                title={"🧭 " + t('pressure')}
                thresholdValues={thresholds.tlak}
                onUpdate={(newValues) => setThresholds(prev => ({
                  ...prev,
                  tlak: newValues
                }))}
              />
            </div>
          )}
          
          <div className="pt-2">
            <button
              onClick={toggleDisplayThresholds}
              className={`w-full py-2 px-4 rounded ${
                displayThresholds 
                  ? "bg-blue-600 hover:bg-blue-700 text-white" 
                  : "bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-800 dark:text-white"
              } transition-colors`}
              title="Zobraziť alebo skryť prahové hodnoty v grafe"
            >
              {displayThresholds ? t('hideThresholds') : t('showThresholds')}
            </button>
          </div>
        </div>
      </CollapsibleSection>
      
      {/* Heatmap Settings Section */}
      <CollapsibleSection title={t('heatmapSettings')} icon="🗺️" defaultExpanded={false}>
        <div className="space-y-3">
          {/* Matrix/Calendar switch button - moved outside of collapsible area for better visibility */}
          <div className="mb-3">
            <button
              onClick={() => {
                const newType = heatmapType === "matrix" ? "calendar" : "matrix";
                updateHeatmapType(newType);
              }}
              className="w-full px-3 py-2 rounded bg-indigo-100 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-200 hover:bg-indigo-200 dark:hover:bg-indigo-700 transition-colors text-sm font-medium"
            >
              {heatmapType === "matrix" ? t('switchToCalendar') : t('switchToMatrix')}
            </button>
          </div>
          
          {/* Field type selector for heatmap */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('dataType') || 'Data Type'}:
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setHeatmapField("teplota")}
                className={`px-2 py-1 text-sm rounded-md transition-colors ${
                  heatmapField === "teplota" 
                    ? "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200" 
                    : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                }`}
              >
                <span className="mr-1">🌡️</span>{t('temperature')}
              </button>
              <button
                onClick={() => setHeatmapField("vlhkost")}
                className={`px-2 py-1 text-sm rounded-md transition-colors ${
                  heatmapField === "vlhkost" 
                    ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200" 
                    : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                }`}
              >
                <span className="mr-1">💧</span>{t('humidity')}
              </button>
              <button
                onClick={() => setHeatmapField("tlak")}
                className={`px-2 py-1 text-sm rounded-md transition-colors ${
                  heatmapField === "tlak" 
                    ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200" 
                    : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                }`}
              >
                <span className="mr-1">🧭</span>{t('pressure')}
              </button>
            </div>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-gray-700 dark:text-gray-200"><span className="mr-1">🗺️</span>{t('heatmap')}</span>
            <button
              onClick={() => setShowHeatmapSettings((prev) => !prev)}
              className="px-3 py-1 text-xs rounded bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-700 transition-colors"
            >
              {showHeatmapSettings ? t('hide') : t('edit')}
            </button>
          </div>
          
          {showHeatmapSettings && (
            <div className="mt-2 p-3 bg-gray-100 dark:bg-gray-700 rounded">
              <ThresholdSettings 
                title={"🗺️ " + t('heatmap')}
                thresholdValues={heatmapThresholds}
                onUpdate={setHeatmapThresholds}
              />
            </div>
          )}
        </div>
      </CollapsibleSection>
      
      {/* Settings Section */}
      <CollapsibleSection title={t('settings') || "Nastavenia"} icon="⚙️" defaultExpanded={false}>
        <div className="space-y-3">
          <div className="flex flex-col items-center mb-3">
            <div className="text-3xl mb-2">💾</div>
            <div className="text-center">
              <span className="text-gray-700 dark:text-gray-200 font-semibold">{t('defaultSelection') || "Predvolený výber"}</span>
            </div>
            <div className="h-px w-full bg-gray-200 dark:bg-gray-600 my-3"></div>
          </div>
          
          <div className="text-sm text-gray-600 dark:text-gray-300 text-center mb-4">
            <p>{t('defaultSelectionHelpText') || "Nastavte aktuálny výber ako predvolený pri načítaní."}</p>
          </div>
          
          <div className="flex justify-center">
            <button
              onClick={() => {
                setSelectedLocationsAsDefault();
                // Show confirmation message (you could add a toast notification here if available)
                alert(t('defaultSelectionSaved') || "Aktuálny výber bol nastavený ako predvolený.");
              }}
              className="px-4 py-2 rounded bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-200 hover:bg-green-200 dark:hover:bg-green-700 transition-colors text-sm"
              disabled={selectedLocations.length === 0}
              title={selectedLocations.length === 0 ? 
                (t('noLocationsSelected') || "Žiadne lokality nie sú vybrané") : 
                (t('setAsDefault') || "Nastaviť ako predvolené")}
            >
              {t('setCurrentSelectionAsDefault') || "Nastaviť aktuálny výber ako predvolený"}
            </button>
          </div>
        </div>
      </CollapsibleSection>
      
      {/* Help Section */}
      <CollapsibleSection title={t('help')} icon="❓" defaultExpanded={false}>
        <div className="text-sm text-gray-600 dark:text-gray-300 space-y-2">
          <p><strong>{t('chartsAndVisualizations')}</strong>: {t('chartsHelpText') || 'Výber typov údajov a spôsobu ich zobrazenia.'}</p>
          <p><strong>{t('locationColors') || 'Location Colors'}</strong>: {t('locationColorsHelpText') || 'Change the border colors for each location, which will be reflected in both cards and charts.'}</p>
          <p><strong>{t('dataAggregations')}</strong>: {t('aggregationsHelpText') || 'Zobrazenie minimálnych, priemerných a maximálnych hodnôt v grafoch.'}</p>
          <p><strong>{t('thresholdSettings')}</strong>: {t('thresholdsHelpText') || 'Nastavenie farebne označených hraníc pre merané hodnoty.'}</p>
          <p><strong>{t('heatmapSettings')}</strong>: {t('heatmapHelpText') || 'Zobrazuje historické hodnoty vo formáte matice alebo kalendára.'}</p>
        </div>
      </CollapsibleSection>
    </aside>
  );
}

export default React.memo(Sidebar);