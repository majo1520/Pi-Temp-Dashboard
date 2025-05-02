import { useEffect, useMemo, useState, useCallback, useRef, lazy, Suspense } from "react";
import { Responsive, WidthProvider } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import config from "./config";
import { useNavigate, Link } from "react-router-dom";
import i18n, { reloadTranslations } from "./i18n"; // Import reloadTranslations

// Force language to Slovak
i18n.changeLanguage('sk');
console.log("Forced language to:", i18n.language);

import { 
  AggregationCard, 
  SensorCard, 
  ErrorBoundary, 
  ErrorDisplay,
  ReavizHeatMap
} from "./components";
import { 
  useWindowDimensions,
  useUserPreferences,
  useSensorData,
  useAuth,
  useErrorHandler
} from "./hooks";
import { RANGES, HEATMAP_AGGREGATORS, DEFAULT_THRESHOLDS } from "./constants";
import { 
  computeOverallAggregations,
  getStatusColor,
  prepareCalendarData,
  getCalendarStart,
  splitDataByYear
} from "./utils/chartUtils.jsx";
import { exportExcel, exportCSV } from "./utils/exportUtils";
import LoadingIndicator from "./components/LoadingIndicator";
import { useTranslation } from 'react-i18next';

// Lazy loaded components
const ApexChart = lazy(() => import("./components/ApexChart"));
const CalendarHeatmapChart = lazy(() => import("./CalendarHeatmapChart"));
const LazyYearHeatmap = lazy(() => import("./components/LazyYearHeatmap"));
const KobercovyConfirmation = lazy(() => import("./components/KobercovyConfirmation"));

// Import layout components
import { Header, ResponsiveSidebar, FilterControls } from "./components/layout";

// Import context providers
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import { ChartProvider, useChart } from "./contexts/ChartContext";
import { FilterProvider, useFilter } from "./contexts/FilterContext";

const { FIELDS } = config;

const ResponsiveGridLayout = WidthProvider(Responsive);

// Default heatmap thresholds in case they're not loaded yet
const DEFAULT_HEATMAP_THRESHOLDS = {
  min: 10,
  mid: 20,
  high: 30,
  colorMin: "#B3E6FF",
  colorMid: "#FFFF99",
  colorHigh: "#FF9999"
};

/**
 * Main Dashboard App Component
 */
function DashboardContent() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const errorHandler = useErrorHandler();
  const { errors, clearErrors, isLoading } = errorHandler;
  
  // Get state from contexts
  const { darkMode } = useTheme();
  const { 
    chartMode, 
    visibleGraphs, 
    toggleGraph,
    thresholds, 
    heatmapThresholds, 
    displayThresholds,
    showHeatmapXLabels,
    heatmapType,
    heatmapField,
    aggregationOptions
  } = useChart();
  
  const {
    rangeKey,
    selectedLocations,
    autoRefresh,
    customStart,
    customEnd,
    customApplied
  } = useFilter();
  
  // Get language translation function
  const { t } = useTranslation();
  
  // Reload translations on mount to ensure fresh translations
  useEffect(() => {
    reloadTranslations();
  }, []);
  
  // Debug: Log current i18n language and loaded resources
  useEffect(() => {
    // Dynamically import i18n to avoid circular dependency
    import('./i18n').then(({ default: i18n }) => {
      // Print current language
      console.log('[i18n debug] Current language:', i18n.language);
      // Print loaded resources (only keys for brevity)
      console.log('[i18n debug] Loaded resources:', Object.keys(i18n.services.resourceStore.data));
      // Print a sample translation for heatmap.temperatureMatrix
      console.log('[i18n debug] Sample translation (heatmap.temperatureMatrix):', i18n.t('heatmap.temperatureMatrix'));
    });
  }, []);
  
  // Authentication
  const auth = useAuth(errorHandler);
  
  // UI state
  const [sidebarVisible, setSidebarVisible] = useState(true);
  
  // Sensor data
  const sensorData = useSensorData({
    selectedLocations,
    rangeKey,
    autoRefresh,
    customStart,
    customEnd,
    customApplied,
    heatmapField
  }, errorHandler);
  
  const {
    allSensors,
    visibleLocationSensors,
    visibleCardSensors,
    locations,
    mqttData,
    lastSeen,
    chartData,
    historicalChartData,
    heatmapSeries,
    apexSeries,
    isMultiYear,
    yearlyData
  } = sensorData;

  // Filter series for enabled fields
  const enabledFields = Object.keys(visibleGraphs).filter(
    (key) => key !== "koberec" && visibleGraphs[key]
  );
  
  const filteredApexSeries = apexSeries.filter((series) =>
    enabledFields.some((field) => series.name.toLowerCase().includes(field))
  );

  // Calculate dynamic heatmap width
  const MIN_CELL_WIDTH = 30;
  const dynamicHeatmapWidth =
    rangeKey === "365d" && heatmapSeries.length > 0
      ? Math.max(windowWidth, heatmapSeries[0].data.length * MIN_CELL_WIDTH)
      : undefined;
  
  // Implement data windowing for large datasets
  const windowData = useCallback((data, maxPoints = 1000) => {
    if (!data || !Array.isArray(data) || data.length <= maxPoints) return data;
    
    // If data exceeds maxPoints, sample it to reduce memory usage
    const samplingRate = Math.ceil(data.length / maxPoints);
    return data.filter((_, index) => index % samplingRate === 0);
  }, []);
  
  // Apply windowing to filtered series for performance
  const optimizedApexSeries = useMemo(() => {
    return filteredApexSeries.map(series => ({
      ...series,
      data: windowData(series.data)
    }));
  }, [filteredApexSeries, windowData]);
  
  // Apply windowing to heatmap series
  const optimizedHeatmapSeries = useMemo(() => {
    if (!heatmapSeries || heatmapSeries.length === 0) return [];
    
    return heatmapSeries.map(series => ({
      ...series,
      data: windowData(series.data)
    }));
  }, [heatmapSeries, windowData]);
  
  // Tooltip debounce ref to prevent memory leaks and flickering
  const tooltipDebounceTimerRef = useRef(null);
  
  // Clean up the tooltip timer on unmount
  useEffect(() => {
    return () => {
      if (tooltipDebounceTimerRef.current) {
        clearTimeout(tooltipDebounceTimerRef.current);
      }
    };
  }, []);
  
  // ApexCharts shared options to fix tooltip flickering
  const sharedChartOptions = useMemo(() => ({
    tooltip: {
      // Prevent flickering by optimizing tooltip
      intersect: false,
      shared: true,
      followCursor: true,
      custom: undefined,
      hideEmptySeries: true,
      hideEmptyShared: true,
      // Use built-in debounce to prevent flickering
      debounce: 150
    },
    chart: {
      // Optimize chart to prevent flickering
      events: {
        mouseMove: (event, chartContext, config) => {
          // Clear previous timeout to prevent multiple toolips
          if (tooltipDebounceTimerRef.current) {
            clearTimeout(tooltipDebounceTimerRef.current);
          }
          
          // Set new timeout for tooltip display using the ref
          tooltipDebounceTimerRef.current = setTimeout(() => {
            // This performs the actual tooltip update after the timeout
            // The empty function is intentional, as the timeout itself
            // is what creates the debounce effect
            tooltipDebounceTimerRef.current = null;
          }, 150);
        }
      },
      // Optimize rendering performance
      animations: {
        enabled: false // Disable animations for better performance
      },
      dynamicAnimation: {
        enabled: false
      },
      // Reduce redraw rate
      redrawOnWindowResize: false,
      redrawOnParentResize: false
    },
    // Optimize rendering by limiting markers
    markers: {
      size: rangeKey === "live" ? 3 : 0,
      showNullDataPoints: false,
    },
    // Reduce rendering load with responsive options
    responsive: [{
      breakpoint: 9999,
      options: {
        // Smoothes interactions
        plotOptions: {
          bar: {
            columnWidth: '90%'
          }
        }
      }
    }]
  }), [tooltipDebounceTimerRef, rangeKey]);
  
  // Create sensor cards with memoization for performance
  const sensorCards = useMemo(() => {
    // Filter selectedLocations to only include those with cardVisible=true
    const visibleCardLocations = selectedLocations.filter(loc => 
      visibleCardSensors.some(sensor => sensor.name === loc)
    );
    
    return visibleCardLocations.map((loc) => {
      let data = null;
      let isActive = false;
      
      if (rangeKey === "live") {
        data = mqttData[loc];
        isActive = lastSeen[loc] && Date.now() - lastSeen[loc] < 60_000;
    
        // Fallback to last DB record if MQTT data not available
        if (!data || Object.keys(data).length <= 1) {
          const fallback = {};
          if (historicalChartData[loc]) {
            FIELDS.forEach((field) => {
              const arr = historicalChartData[loc][field];
              if (arr && arr.length > 0) {
                const last = arr[arr.length - 1];
                fallback[field] = last.value;
                fallback.time = last.time;
              }
            });
          }
          if (Object.keys(fallback).length > 0) {
            data = fallback;
          }
        }
      } else {
        // For other ranges, use historical data
        if (historicalChartData[loc]) {
          FIELDS.forEach((field) => {
            const arr = historicalChartData[loc][field];
            if (arr && arr.length > 0) {
              data = data || {};
              data[field] = arr[arr.length - 1].value;
              data.time = arr[arr.length - 1].time;
            }
          });
        }
        isActive = data && Object.keys(data).length > 0;
      }
    
      return (
        <SensorCard
          key={loc}
          location={loc}
          data={data}
          isActive={isActive}
          lastSeen={lastSeen}
          rangeKey={rangeKey}
          thresholds={thresholds}
          getStatusColor={getStatusColor}
        />
      );
    });
  }, [selectedLocations, mqttData, lastSeen, historicalChartData, rangeKey, thresholds, visibleCardSensors]);

  // Create aggregated cards component for reuse
  const createAggregatedCards = useCallback((series, options = aggregationOptions) => {
    if (!(options.min || options.avg || options.max)) return null;
    
    // Group series by field type (teplota, vlhkost, tlak)
    const fieldGroups = {};
    
    series.forEach(s => {
      // Extract field name from series name (format: "location - field")
      const fieldMatch = s.name.toLowerCase().match(/(teplota|vlhkost|tlak)/);
      if (fieldMatch) {
        const field = fieldMatch[0];
        if (!fieldGroups[field]) {
          fieldGroups[field] = [];
        }
        fieldGroups[field].push(s);
      }
    });
    
    // Map field names to translation keys
    const fieldToTranslationKey = {
      teplota: "temperature",
      vlhkost: "humidity",
      tlak: "pressure"
    };
    
    return (
      <div className="grid grid-cols-1 gap-4">
        {Object.entries(fieldGroups).map(([field, fieldSeries]) => {
          // Skip if no data for this field
          if (!fieldSeries.length) return null;
          
          const translatedField = t(fieldToTranslationKey[field] || field);
          
          return (
            <div key={field} className="mb-4">
              <h3 className="text-lg font-semibold mb-2 capitalize">{translatedField}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {options.min && (
                  <AggregationCard 
                    type="min" 
                    value={Math.min(...fieldSeries.flatMap(s => s.data.map(d => d.y)).filter(v => !isNaN(v)))} 
                    time={null} 
                  />
                )}
                {options.avg && (
                  <AggregationCard 
                    type="avg" 
                    value={fieldSeries.flatMap(s => s.data.map(d => d.y)).filter(v => !isNaN(v)).reduce((a, b) => a + b, 0) / 
                          fieldSeries.flatMap(s => s.data.map(d => d.y)).filter(v => !isNaN(v)).length} 
                    time={null} 
                  />
                )}
                {options.max && (
                  <AggregationCard 
                    type="max" 
                    value={Math.max(...fieldSeries.flatMap(s => s.data.map(d => d.y)).filter(v => !isNaN(v)))} 
                    time={null} 
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }, [aggregationOptions, t]);

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <Header 
          toggleSidebar={() => setSidebarVisible(!sidebarVisible)} 
          auth={auth} 
        />

        <div className="flex">
          <ResponsiveSidebar 
            isVisible={sidebarVisible} 
            onToggle={() => setSidebarVisible(!sidebarVisible)}
          />

          <main className="flex-1">
            <FilterControls 
              visibleLocationSensors={visibleLocationSensors} 
              locations={locations} 
            />

            <section className="container mx-auto px-4 mb-8 flex flex-wrap gap-4">
              {sensorCards}
            </section>

            <section className="container mx-auto px-4 py-4">
              {chartMode === "separate" ? (
                FIELDS.filter((field) => visibleGraphs[field]).map((field) => {
                  const sensorSeries = selectedLocations.map((loc) => {
                    if (rangeKey === "live") {
                      const data = chartData[loc]?.[field] || [];
                      return { name: `${loc} - ${field}`, data: data.map((d) => ({ x: d.time, y: d.value })) };
                    } else {
                      const data = historicalChartData[loc]?.[field] || [];
                      return { name: `${loc} - ${field}`, data: data.map((d) => ({ x: d.time, y: d.value })) };
                    }
                  });
                  let minVal = null;
                  let avgVal = null;
                  let maxVal = null;
                  let minTime = null;
                  let maxTime = null;
                  if (aggregationOptions.min || aggregationOptions.avg || aggregationOptions.max) {
                    const { min, avg, max, minTime: mT, maxTime: MxT } = computeOverallAggregations(sensorSeries);
                    minVal = min;
                    avgVal = avg;
                    maxVal = max;
                    minTime = mT;
                    maxTime = MxT;
                  }
                  
                  // Map field names to translation keys
                  const fieldToTranslationKey = {
                    teplota: "temperature",
                    vlhkost: "humidity",
                    tlak: "pressure"
                  };
                  
                  const translatedTitle = t(fieldToTranslationKey[field] || field);
                  
                  return (
                    <div key={field} className="mb-8 bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                      <Suspense fallback={<LoadingIndicator text={`Loading ${translatedTitle} chart...`} />}>
                        <ApexChart
                          title={translatedTitle}
                          series={sensorSeries}
                          chartType="line"
                          fieldName={field}
                          thresholds={thresholds || DEFAULT_THRESHOLDS}
                          displayThresholds={displayThresholds}
                          additionalOptions={sharedChartOptions}
                          allowFullScreen={true}
                        />
                      </Suspense>
                      {(aggregationOptions.min || aggregationOptions.avg || aggregationOptions.max) && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                          {aggregationOptions.min && (
                            <AggregationCard type="min" value={minVal} time={minTime} />
                          )}
                          {aggregationOptions.avg && (
                            <AggregationCard type="avg" value={avgVal} time={null} />
                          )}
                          {aggregationOptions.max && (
                            <AggregationCard type="max" value={maxVal} time={maxTime} />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                (() => {
                  // Create aggregated cards for merged view
                  const aggregatedCards = createAggregatedCards(optimizedApexSeries);

                  return (
                    <div className="mb-8 bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                      <Suspense fallback={<LoadingIndicator text={t("loadingMergedChart") || "Loading merged chart..."} />}>
                        <ApexChart
                          title={t("merged")}
                          series={optimizedApexSeries}
                          chartType="line"
                          fieldName={null}
                          thresholds={thresholds || DEFAULT_THRESHOLDS}
                          displayThresholds={displayThresholds}
                          additionalOptions={sharedChartOptions}
                          allowFullScreen={true}
                        />
                      </Suspense>
                      {(aggregationOptions.min || aggregationOptions.avg || aggregationOptions.max) && (
                        <div className="mt-4">{aggregatedCards}</div>
                      )}
                    </div>
                  );
                })()
              )}

              {visibleGraphs.koberec && (
                <div className="mb-8 bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <Suspense fallback={<LoadingIndicator text={t("loadingHeatmap") || "Loading heatmap..."} />}>
                    {(() => {
                      // Still keep this for backwards compatibility with any other components that might use it
                      window.dashboardState = {
                        historicalChartData,
                        selectedLocations,
                        thresholds: heatmapThresholds || DEFAULT_HEATMAP_THRESHOLDS
                      };
                      const event = new CustomEvent('dashboardStateUpdated');
                      window.dispatchEvent(event);
                      
                      // For 30d and 365d, respect the toggle (default for 30d is matrix, but user can switch)
                      if (heatmapType === "calendar") {
                        // Pass necessary data to CalendarHeatmapChart
                        const calendarData = prepareCalendarData(optimizedHeatmapSeries);
                        const calendarStartDate = getCalendarStart(rangeKey);
                        const calendarEndDate = new Date(); // Current date as end date
                        
                        return <CalendarHeatmapChart 
                          data={calendarData}
                          startDate={customApplied ? new Date(customStart) : calendarStartDate}
                          endDate={customApplied ? new Date(customEnd) : calendarEndDate}
                          thresholds={heatmapThresholds || DEFAULT_HEATMAP_THRESHOLDS}
                          heatmapField={heatmapField}
                        />;
                      } else {
                        // Pass the data directly as props instead of relying on window.dashboardState
                        return <ReavizHeatMap 
                          showLabels={true}
                          historicalData={historicalChartData}
                          selectedLocations={selectedLocations}
                          thresholds={heatmapThresholds || DEFAULT_HEATMAP_THRESHOLDS}
                          // Pass range information for days calculation
                          rangeKey={rangeKey}
                          customStart={customStart}
                          customEnd={customEnd}
                          customApplied={customApplied}
                          heatmapField={heatmapField}
                        />;
                      }
                    })()}
                  </Suspense>
                </div>
              )}
            </section>
          </main>
        </div>
        
        <Suspense fallback={<LoadingIndicator text={t("loadingKobercovyConfirmation") || "Loading Kobercovy confirmation..."} />}>
          <KobercovyConfirmation />
        </Suspense>

        <footer className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">
          Powered by <strong>IT europlac</strong>
        </footer>
        
        {/* Error display component */}
        <ErrorDisplay errors={errors} clearErrors={clearErrors} />
      </div>
    </div>
  );
}

// Main App component wrapping with context providers
export function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ChartProvider>
          <FilterProvider>
            <DashboardContent />
          </FilterProvider>
        </ChartProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;


