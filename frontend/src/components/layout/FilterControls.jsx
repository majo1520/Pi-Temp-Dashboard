import React from 'react';
import { useFilter } from '../../contexts/FilterContext';
import { useChart } from '../../contexts/ChartContext';
import { useTranslation } from 'react-i18next';

/**
 * Component for filter controls (range selection, locations selection, etc)
 * @param {Object} props - Component props
 * @param {Array} props.visibleLocationSensors - Array of visible sensors with their locations
 */
function FilterControls({ visibleLocationSensors, locations }) {
  const { t } = useTranslation();
  const {
    // Range settings
    rangeKey,
    handleRangeSelection,
    
    // Location settings
    selectedLocations,
    setSelectedLocations,
    toggleLocation,
    
    // Custom range
    tempCustomStart,
    setTempCustomStart,
    tempCustomEnd,
    setTempCustomEnd,
    customApplied,
    applyCustomRange,
  } = useFilter();

  return (
    <section className="container mx-auto px-4 py-4">
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 bg-white dark:bg-gray-900 p-4 rounded shadow">
          <h2 className="text-lg font-medium mb-2">{t('locationSelector')}:</h2>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button
              onClick={() => setSelectedLocations(visibleLocationSensors.map(s => s.name))}
              className="px-4 py-2 rounded bg-white text-blue-600 shadow"
              title={t('allLocations')}
            >
              {t('allLocations')}
            </button>
            <button
              onClick={() => setSelectedLocations([])}
              className="px-4 py-2 rounded bg-white text-blue-600 shadow"
              title={t('clearSelection')}
            >
              {t('noLocationsSelected')}
            </button>
          </div>
          <div className="flex gap-2 flex-wrap">
            {visibleLocationSensors.map(({ name }) => (
              <button
                key={name}
                onClick={() => toggleLocation(name)}
                className={`px-4 py-2 rounded shadow ${
                  selectedLocations.includes(name)
                    ? "bg-blue-600 text-white"
                    : "bg-white text-blue-600 border"
                }`}
                title={name}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 bg-white dark:bg-gray-900 p-4 rounded shadow">
          <h2 className="text-lg font-medium mb-2">{t('timeRange')}</h2>
          <div className="flex gap-2 flex-wrap">
            {["live", "1h", "6h", "24h", "7d", "30d", "365d", "custom"].map((range) => (
              <button
                key={range}
                onClick={() => handleRangeSelection(range)}
                className={`inline-flex items-center ${
                  rangeKey === range ? "bg-blue-600 text-white" : "bg-white text-blue-600 border"
                } rounded-full px-4 py-2 text-sm shadow`}
                title={
                  range === "custom"
                    ? t('customRange')
                    : `${t('timeRange')}: ${range.toUpperCase()}`
                }
              >
                {range === "live" ? "🟢 " : "🕒 "}
                {range === "custom" ? t('custom') : range.toUpperCase()}
              </button>
            ))}
          </div>
          {rangeKey === "custom" && (
            <div className="mt-4 flex flex-wrap gap-2 items-center">
              <label className="text-sm">{t('from')}:</label>
              <input
                type="datetime-local"
                className="border rounded px-2 py-1 text-sm"
                value={tempCustomStart}
                onChange={(e) => setTempCustomStart(e.target.value)}
              />
              <label className="text-sm">{t('to')}:</label>
              <input
                type="datetime-local"
                className="border rounded px-2 py-1 text-sm"
                value={tempCustomEnd}
                onChange={(e) => setTempCustomEnd(e.target.value)}
              />
              <button
                onClick={applyCustomRange}
                className="px-4 py-2 rounded bg-green-500 text-white shadow text-sm"
                title={t('apply')}
              >
                {t('apply')}
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 bg-white dark:bg-gray-900 p-4 rounded shadow">
          <h2 className="text-lg font-medium mb-2">{t('displayMode')}</h2>
          <ChartModeSelector />
        </div>
      </div>
    </section>
  );
}

/**
 * Component for chart mode selection (merged vs separate)
 */
function ChartModeSelector() {
  const { t } = useTranslation();
  const { chartMode, setChartMode } = useChart();
  
  return (
    <div className="flex gap-2">
      <button
        onClick={() => setChartMode("merged")}
        className={`inline-flex items-center ${
          chartMode === "merged" ? "bg-blue-600 text-white" : "bg-white text-blue-600 border"
        } rounded-full px-4 py-2 text-sm shadow`}
        title={t('mergedTitle') || "Zlúčiť všetky dáta do jedného grafu"}
      >
        📊 {t('merged')}
      </button>
      <button
        onClick={() => setChartMode("separate")}
        className={`inline-flex items-center ${
          chartMode === "separate" ? "bg-blue-600 text-white" : "bg-white text-blue-600 border"
        } rounded-full px-4 py-2 text-sm shadow`}
        title={t('separateTitle') || "Zobraziť každý senzor zvlášť"}
      >
        📈 {t('separate')}
      </button>
    </div>
  );
}

export default React.memo(FilterControls); 