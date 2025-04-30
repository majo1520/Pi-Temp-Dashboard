import { useState, useEffect, useMemo, useRef, lazy, Suspense, useCallback } from "react";
import useWindowDimensions from "../hooks/useWindowDimensions";
import { exportExcel } from "../utils/exportUtils";
import { getTeplotaAnnotations, getHumidityAnnotations, getPressureAnnotations } from "../utils/chartUtils";
import { useTranslation } from 'react-i18next';
import { useChart } from "../contexts/ChartContext";
import LoadingIndicator from "./LoadingIndicator";
import logger from "../utils/logger";

// Dynamically import ApexCharts
const Chart = lazy(() => import("react-apexcharts"));

// Performance monitoring constants
const PERFORMANCE_CATEGORY = 'apex_chart';
const RENDER_METRIC = 'render_time';
const UPDATE_METRIC = 'update_time';
const INTERACTION_METRIC = 'interaction_time';

// =============================
// Komponent ApexChart
// =============================
function ApexChart({
  title,
  series,
  chartType = "line",
  heatmapRanges,
  fieldName,
  thresholds = null,
  displayThresholds,
  customHeight,
  customWidth,
  allowFullScreen,
  showXAxisLabels,
  additionalOptions = {}
}) {
  const { t, i18n } = useTranslation();
  const { locationColors, thresholds: contextThresholds } = useChart();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [fullScreen, setFullScreen] = useState(false);
  const [isChartLoaded, setIsChartLoaded] = useState(false);
  const [chartError, setChartError] = useState(null);
  const chartRef = useRef(null);
  const chartColorRef = useRef([]);
  const chartInstanceRef = useRef(null);
  const chartOptionsRef = useRef(null);
  // Add refs to track user interaction and chart state
  const userInteractedRef = useRef(false);
  const lastInteractionTimeRef = useRef(0);
  const savedRangeRef = useRef(null);

  // Safe method to access the chart instance
  const getChartInstance = useCallback(() => {
    return chartInstanceRef.current;
  }, []);

  // Enhanced chart instance initialization - moved up and memoized
  const initChartInstance = useCallback((chartContext, chartConfig) => {
    if (chartContext && chartContext.chart) {
      chartInstanceRef.current = chartContext.chart;
      
      // Monitor chart interactions
      chartContext.chart.addEventListener('zoomed', (e) => {
        logger.startPerformanceMeasure('chart_zoom');
        userInteractedRef.current = true;
        lastInteractionTimeRef.current = Date.now();
        
        // Save the current zoom/scroll state
        try {
          const w = chartContext.chart.w;
          if (w && w.globals && w.globals.minX !== undefined && w.globals.maxX !== undefined) {
            savedRangeRef.current = {
              minX: w.globals.minX,
              maxX: w.globals.maxX,
              origin: 'zoom'
            };
            logger.log('User zoomed chart, zoom state saved', { category: 'chart_interaction' });
          }
        } catch (err) {
          logger.error('Error saving zoom state', err);
        }
        
        setTimeout(() => {
          const zoomDuration = logger.endPerformanceMeasure('chart_zoom', PERFORMANCE_CATEGORY);
          if (zoomDuration) {
            logger.log(`Chart zoom operation completed in ${zoomDuration}ms`, {
              type: INTERACTION_METRIC,
              interaction: 'zoom'
            });
          }
        }, 0);
      });

      chartContext.chart.addEventListener('scrolled', (e) => {
        logger.startPerformanceMeasure('chart_scroll');
        userInteractedRef.current = true;
        lastInteractionTimeRef.current = Date.now();
        
        // Save the current scroll state
        try {
          const w = chartContext.chart.w;
          if (w && w.globals && w.globals.minX !== undefined && w.globals.maxX !== undefined) {
            savedRangeRef.current = {
              minX: w.globals.minX,
              maxX: w.globals.maxX,
              origin: 'scroll'
            };
            logger.log('User scrolled chart, scroll state saved', { category: 'chart_interaction' });
          }
        } catch (err) {
          logger.error('Error saving scroll state', err);
        }
        
        setTimeout(() => {
          const scrollDuration = logger.endPerformanceMeasure('chart_scroll', PERFORMANCE_CATEGORY);
          if (scrollDuration) {
            logger.log(`Chart scroll operation completed in ${scrollDuration}ms`, {
              type: INTERACTION_METRIC,
              interaction: 'scroll'
            });
          }
        }, 0);
      });
      
      // Listen for user reset action
      chartContext.chart.addEventListener('reset', (e) => {
        userInteractedRef.current = false;
        savedRangeRef.current = null;
        logger.log('Chart reset by user', { category: 'chart_interaction' });
      });
    }
  }, []);

  // Effect to restore saved range when chart updates with new data
  useEffect(() => {
    // Only run this when we have a chart instance and the series data changes
    if (chartInstanceRef.current && isChartLoaded && savedRangeRef.current) {
      // If the user has interacted and we have a saved range, restore it
      // Always maintain zoom during auto-refresh updates (when window.__isAutoRefreshUpdate is true)
      if (userInteractedRef.current || window.__isAutoRefreshUpdate) {
        try {
          const { minX, maxX } = savedRangeRef.current;
          
          // Add a small delay to let the chart finish updating
          setTimeout(() => {
            if (chartInstanceRef.current) {
              logger.log('Restoring saved chart range', { 
                minX, maxX, 
                category: 'chart_interaction',
                isAutoRefresh: window.__isAutoRefreshUpdate
              });
              
              // Use updateOptions to update the chart without redrawing
              chartInstanceRef.current.updateOptions({
                xaxis: {
                  min: minX,
                  max: maxX
                }
              }, false, false); // false for redraw, false for animate
            }
          }, 50);
        } catch (err) {
          logger.error('Error restoring chart range', err);
        }
      }
    }
  }, [series, isChartLoaded]);

  // Set chart as loaded when component mounts
  useEffect(() => {
    setIsChartLoaded(true);
    return () => {
      if (chartInstanceRef.current) {
        try {
          chartInstanceRef.current = null;
        } catch (err) {
          logger.error("Error cleaning up chart:", err);
        }
      }
    };
  }, []);

  // Use provided thresholds or fallback to context thresholds or empty object
  const safeThresholds = thresholds || contextThresholds || {};

  // Ensure we have default values for each threshold type
  const completeThresholds = useMemo(() => {
    const DEFAULT_THRESHOLDS = {
      teplota: {
        min: 20, 
        mid: 25, 
        high: 30,
        colorMin: "#B3E6FF",
        colorMid: "#FFFF99",
        colorHigh: "#FF9999"
      },
      vlhkost: {
        min: 30, 
        mid: 50, 
        high: 70,
        colorMin: "#C3FFC3",
        colorMid: "#FFFF99",
        colorHigh: "#FF9999"
      },
      tlak: {
        min: 1010, 
        mid: 1020, 
        high: 1030,
        colorMin: "#C3FFC3",
        colorMid: "#FFFF99",
        colorHigh: "#FF9999"
      }
    };

    return {
      ...DEFAULT_THRESHOLDS,
      ...(safeThresholds || {}),
      teplota: {
        ...DEFAULT_THRESHOLDS.teplota,
        ...(safeThresholds.teplota || {})
      },
      vlhkost: {
        ...DEFAULT_THRESHOLDS.vlhkost,
        ...(safeThresholds.vlhkost || {})
      },
      tlak: {
        ...DEFAULT_THRESHOLDS.tlak,
        ...(safeThresholds.tlak || {})
      }
    };
  }, [safeThresholds]);

  // Debug logging
  useEffect(() => {
    if (fieldName) {
      logger.log(`ApexChart Debug - fieldName: ${fieldName}, has threshold: ${!!completeThresholds[fieldName]}`);
      logger.log(`ApexChart Debug - thresholds available: ${Object.keys(completeThresholds).join(', ')}`);
      logger.log(`ApexChart Debug - chartType: ${chartType}, displayThresholds: ${displayThresholds}`);
      
      // Log data info for the chart
      if (series && Array.isArray(series)) {
        logger.log(`ApexChart Debug - ${fieldName} - series count: ${series.length}`);
        series.forEach((s, idx) => {
          const dataPoints = s.data ? s.data.length : 0;
          const validPoints = s.data ? s.data.filter(d => d.y !== null && d.y !== -1 && !isNaN(d.y)).length : 0;
          logger.log(`ApexChart Debug - ${fieldName} - series[${idx}] name: ${s.name}, points: ${dataPoints}, valid points: ${validPoints}`);
        });
      } else {
        logger.log(`ApexChart Debug - ${fieldName} - No series data available`);
      }
    }
  }, [fieldName, completeThresholds, chartType, displayThresholds, series]);

  // Performance monitoring for initial render
  useEffect(() => {
    if (isChartLoaded) {
      logger.startPerformanceMeasure('chart_initial_render');
      return () => {
        const duration = logger.endPerformanceMeasure('chart_initial_render', PERFORMANCE_CATEGORY);
        if (duration) {
          logger.log(`Chart initial render completed in ${duration}ms`, { 
            type: RENDER_METRIC,
            chartType,
            seriesCount: series?.length,
            dataPoints: series?.[0]?.data?.length
          });
        }
      };
    }
  }, [isChartLoaded, chartType, series]);

  // Translate the title with appropriate icons
  const translatedTitle = useMemo(() => {
    if (title) {
      // Check if the title corresponds to temperature, humidity, or pressure
      if (title.toLowerCase().includes(t('temperature').toLowerCase())) {
        return "🌡️ " + t('temperature');
      } else if (title.toLowerCase().includes(t('humidity').toLowerCase())) {
        return "💧 " + t('humidity');
      } else if (title.toLowerCase().includes(t('pressure').toLowerCase())) {
        return "🧭 " + t('pressure');
      }
    }
    return title;
  }, [title, t]);

  // Apply location colors to chart series with improved handling
  const colorizedSeries = useMemo(() => {
    if (!series || !Array.isArray(series) || series.length === 0) {
      return [];
    }
    
    // Create a map of unique locations to ensure consistent colors
    const locationSet = new Set(series.map(s => s.name?.split(' - ')?.[0]).filter(Boolean));
    const locationArray = Array.from(locationSet);
    
    // Generate colors for locations that don't have assigned colors
    const defaultColors = [
      '#008FFB', '#00E396', '#FEB019', '#FF4560', '#775DD0',
      '#3F51B5', '#03A9F4', '#4CAF50', '#F9CE1D', '#FF9800'
    ];
    
    const locationColorMap = {};
    locationArray.forEach((loc, index) => {
      locationColorMap[loc] = locationColors[loc] || defaultColors[index % defaultColors.length];
    });
    
    // Clone and colorize series
    const newSeries = series.map(s => {
      const newSeries = { ...s };
      const locationName = s.name?.split(' - ')?.[0];
      
      if (locationName && locationColorMap[locationName]) {
        newSeries.color = locationColorMap[locationName];
      }
      
      return newSeries;
    });
    
    // Store colors in ref for options
    chartColorRef.current = newSeries.map(s => s.color);
    
    return newSeries;
  }, [series, locationColors]);

  // Define chart options with improved series handling
  const chartOptions = useMemo(() => {
    let baseOptions = {
      chart: {
        id: "apex-chart",
        type: chartType,
        zoom: { 
          enabled: true, 
          type: "x", 
          autoScaleYaxis: true,
          // Add preserve zoom configuration
          preserveDataZoom: true,
          zoomOnPanning: true
        },
        animations: { enabled: false },
        selection: {
          enabled: true,
          type: 'x',
          // Ensure selection doesn't auto-reset
          preserveSelection: true,
          fill: {
            color: '#506ee4',
            opacity: 0.4
          }
        },
        toolbar: {
          show: true,
          tools: {
            download: true,
            selection: true,
            zoom: true,
            zoomin: true,
            zoomout: true,
            pan: true,
            reset: true,
          },
          autoSelected: 'zoom',
          offsetY: 0,
          offsetX: 0,
          position: 'top',
        },
        // Optimize chart performance
        redrawOnParentResize: false,
        redrawOnWindowResize: false,
        // Add default settings to prevent unwanted behavior
        forceNiceScale: true,
        sparkline: {
          enabled: false
        },
        fontFamily: "Arial, sans-serif",
        background: fullScreen ? "#1a1a1a" : "transparent",
        events: {
          mounted: initChartInstance,
          // Add updated event handler to preserve zoom state
          updated: function(chartContext, config) {
            // If we have a saved range and the user has interacted with the chart, restore it
            if (savedRangeRef.current && userInteractedRef.current && chartInstanceRef.current) {
              const { minX, maxX } = savedRangeRef.current;
              
              // Delay the restore slightly to ensure chart is fully updated
              setTimeout(() => {
                if (chartInstanceRef.current) {
                  logger.log('Restoring zoom after chart update', { minX, maxX });
                  chartInstanceRef.current.updateOptions({
                    xaxis: {
                      min: minX,
                      max: maxX
                    }
                  }, false, false);
                }
              }, 100);
            }
          }
        }
      },
      dataLabels: {
        enabled: false
      },
      colors: chartColorRef.current,
      stroke: {
        curve: "smooth",
        width: fullScreen ? 3 : 2,
        lineCap: "round",
        dashArray: series.map(() => 0) // Ensure all lines are solid
      },
      markers: {
        size: fullScreen ? 5 : 3,
        strokeWidth: fullScreen ? 2 : 1,
        hover: {
          size: fullScreen ? 7 : 5
        },
        discrete: [],
        shape: "circle"
      },
      xaxis: {
        type: chartType === "heatmap" ? "category" : "datetime",
        labels: {
          datetimeUTC: false,
          formatter: (val) => (chartType === "heatmap" ? val : new Date(val).toLocaleString()),
          style: { 
            colors: "#b6b6b6", 
            fontSize: fullScreen ? "14px" : "12px" 
          },
          rotate: chartType === "heatmap" ? -45 : 0,
          show: typeof showXAxisLabels === "boolean" ? showXAxisLabels : true,
        },
        crosshairs: { 
          show: true, 
          stroke: { 
            color: fullScreen ? "#ffffff" : "#b6b6b6", 
            width: fullScreen ? 2 : 1,
            dashArray: 0
          } 
        },
        tooltip: {
          enabled: true
        }
      },
      yaxis: {
        title: {
          text: translatedTitle,
          style: { 
            color: "#b6b6b6", 
            fontSize: fullScreen ? "16px" : "14px", 
            fontWeight: 600 
          },
        },
        labels: {
          style: { 
            colors: "#b6b6b6",
            fontSize: fullScreen ? "14px" : "12px"
          },
          formatter: (val) =>
            typeof val === "number" ? (val === -1 ? t('noData') : val.toFixed(2)) : "-",
        },
        tickAmount: 8,
        forceNiceScale: true
      },
      tooltip: {
        theme: "dark",
        x: {
          formatter: (val) => (chartType === "heatmap" ? val : new Date(val).toLocaleString()),
        },
        y: {
          formatter: (val) =>
            typeof val === "number" ? (val === -1 ? t('noData') : val.toFixed(2)) : "-",
        },
        intersect: false,
        shared: true,
        followCursor: true
      },
      legend: {
        show: true,
        position: 'top',
        horizontalAlign: 'left',
        fontSize: fullScreen ? '14px' : '12px',
        markers: {
          width: 12,
          height: 12,
          radius: 6
        }
      },
      grid: { 
        borderColor: fullScreen ? "#444444" : "#e0e0e0",
        strokeDashArray: 1,
        xaxis: {
          lines: {
            show: true
          }
        },
        yaxis: {
          lines: {
            show: true
          }
        }
      }
    };

    if (chartType === "heatmap" && completeThresholds) {
      baseOptions.xaxis.title = {
        text: t('day'),
        style: { color: "#b6b6b6", fontSize: "14px", fontWeight: 600 },
      };

      baseOptions.tooltip = {
        ...baseOptions.tooltip,
        theme: "dark",
        x: {
          formatter: (val, { seriesIndex, dataPointIndex, w }) => {
            const rowName = w.config.series[seriesIndex].name;
            return `${rowName} ${val}`;
          },
        },
        y: {
          formatter: (val) => (val === -1 ? t('noData') : val.toString()),
        },
      };

      baseOptions.plotOptions = {
        heatmap: {
          shadeIntensity: 0.5,
          radius: 0,
          distributed: false,
          dataLabels: {
            enabled: series && series.length > 0 && series[0].data && series[0].data.length <= 50,
            formatter: function (val) {
              if (val === -1) {
                return t('noData');
              }
              return val.toString();
            },
          },
          colorScale: {
            ranges: [
              { from: -1, to: -1, name: t('noData'), color: "#808080" },
              { from: 0, to: completeThresholds.teplota.min, name: t('thresholdMin'), color: completeThresholds.teplota.colorMin },
              { from: completeThresholds.teplota.min, to: completeThresholds.teplota.mid, name: t('thresholdMid'), color: completeThresholds.teplota.colorMid },
              { from: completeThresholds.teplota.mid, to: 999999, name: t('thresholdHigh'), color: completeThresholds.teplota.colorHigh },
            ],
          },
        },
      };
    }

    // Add threshold annotations for line charts if displayThresholds is enabled
    if (chartType === "line" && displayThresholds && fieldName) {
      // Calculate global min/max for appropriate Y axis scaling
      let globalMin = Infinity;
      let globalMax = -Infinity;
      
      if (series && series.length > 0) {
        series.forEach((s) => {
          if (s.data && s.data.length > 0) {
            const samplingStep = s.data.length > 1000 ? Math.floor(s.data.length / 100) : 1;
            for (let i = 0; i < s.data.length; i += samplingStep) {
              const point = s.data[i];
              if (point && point.y !== null && point.y !== -1 && !isNaN(point.y)) {
                globalMin = Math.min(globalMin, point.y);
                globalMax = Math.max(globalMax, point.y);
              }
            }
          }
        });
      }
      
      if (globalMin === Infinity) {
        globalMin = completeThresholds[fieldName]?.min || 0;
        globalMax = completeThresholds[fieldName]?.high || 100;
      }
      
      // Add field-specific annotations with visual improvements
      if (fieldName === "teplota" && completeThresholds.teplota) {
        baseOptions.annotations = { 
          yaxis: getTeplotaAnnotations(completeThresholds.teplota)
        };
        baseOptions.yaxis.min = Math.floor(Math.min(globalMin, completeThresholds.teplota.min) - 1);
        baseOptions.yaxis.max = Math.ceil(Math.max(globalMax, completeThresholds.teplota.high) + 1);
      } else if (fieldName === "vlhkost" && completeThresholds.vlhkost) {
        baseOptions.annotations = { 
          yaxis: getHumidityAnnotations(completeThresholds.vlhkost)
        };
        baseOptions.yaxis.min = Math.floor(Math.min(globalMin, completeThresholds.vlhkost.min) - 1);
        baseOptions.yaxis.max = Math.ceil(Math.max(globalMax, completeThresholds.vlhkost.high) + 1);
      } else if (fieldName === "tlak" && completeThresholds.tlak) {
        baseOptions.annotations = { 
          yaxis: getPressureAnnotations(completeThresholds.tlak)
        };
        baseOptions.yaxis.min = Math.floor(Math.min(globalMin, completeThresholds.tlak.min) - 1);
        baseOptions.yaxis.max = Math.ceil(Math.max(globalMax, completeThresholds.tlak.high) + 1);
      }
    } else if (chartType === "line") {
      // When thresholds are not displayed, remove annotations and auto-scale the y-axis
      baseOptions.annotations = { yaxis: [] };
      delete baseOptions.yaxis.min;
      delete baseOptions.yaxis.max;
    }

    const shouldAddLatestAnnotation = series && series.length > 0 && 
      series[0].data && series[0].data.length <= 100 && chartType === "line";
      
    if (shouldAddLatestAnnotation) {
      const pointAnnotations = [];
      series.forEach((s) => {
        if (s.data && s.data.length > 0) {
          const lastPoint = s.data[s.data.length - 1];
          pointAnnotations.push({
            x: lastPoint.x,
            y: lastPoint.y,
            marker: { size: 8, fillColor: "#fff", strokeColor: "#000", strokeWidth: 2 },
            label: {
              text: "Latest",
              offsetY: -10,
              style: { color: "#000", background: "#fff" },
            },
          });
        }
      });
      
      // Make sure we have an annotations object before adding points
      baseOptions.annotations = baseOptions.annotations || {};
      baseOptions.annotations.points = pointAnnotations;
    }

    // Add annotations based on thresholds
    if (displayThresholds && completeThresholds) {
      if (fieldName === "teplota" && completeThresholds.teplota) {
        baseOptions.annotations.yaxis = getTeplotaAnnotations(completeThresholds.teplota);
      } else if (fieldName === "vlhkost" && completeThresholds.vlhkost) {
        baseOptions.annotations.yaxis = getHumidityAnnotations(completeThresholds.vlhkost);
      } else if (fieldName === "tlak" && completeThresholds.tlak) {
        baseOptions.annotations.yaxis = getPressureAnnotations(completeThresholds.tlak);
      }
    }

    // Enhanced annotation visibility
    if (baseOptions.annotations && baseOptions.annotations.yaxis && baseOptions.annotations.yaxis.length > 0) {
      // Increase opacity for better visibility
      baseOptions.annotations.yaxis = baseOptions.annotations.yaxis.map(annotation => ({
        ...annotation,
        opacity: fullScreen ? 0.3 : 0.2,  // Increase opacity in fullscreen
        label: {
          ...annotation.label,
          borderColor: 'transparent',
          style: {
            background: fullScreen ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.5)',
            color: '#000',
            fontSize: fullScreen ? '14px' : '12px',
            fontWeight: 'bold',
            padding: {
              left: 5,
              right: 5,
              top: 2,
              bottom: 2
            }
          }
        }
      }));
    }

    // Deep merge additional options
    const mergeOptions = (target, source) => {
      const result = { ...target };
      
      if (source && typeof source === 'object') {
        Object.keys(source).forEach(key => {
          // Check if both source[key] and target[key] are objects but not null
          if (source[key] && typeof source[key] === 'object' && 
              target[key] && typeof target[key] === 'object' &&
              !Array.isArray(source[key]) && !Array.isArray(target[key])) {
            result[key] = mergeOptions(target[key], source[key]);
          } else {
            result[key] = source[key];
          }
        });
      }
      
      return result;
    };
    
    return mergeOptions(baseOptions, additionalOptions);
  }, [chartType, fieldName, completeThresholds, displayThresholds, additionalOptions, windowWidth, translatedTitle, series, showXAxisLabels, t, fullScreen, initChartInstance]);

  // Store chart options in ref to avoid circular dependency
  useEffect(() => {
    chartOptionsRef.current = chartOptions;
  }, [chartOptions]);

  // Monitor chart updates using ref to avoid circular dependency
  useEffect(() => {
    if (isChartLoaded && chartInstanceRef.current) {
      logger.startPerformanceMeasure('chart_update');
      const updateDuration = logger.endPerformanceMeasure('chart_update', PERFORMANCE_CATEGORY);
      if (updateDuration) {
        logger.log(`Chart update completed in ${updateDuration}ms`, {
          type: UPDATE_METRIC,
          chartType,
          seriesCount: series?.length,
          dataPoints: series?.[0]?.data?.length
        });
      }
    }
  }, [series, isChartLoaded, chartType]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) setFullScreen(false);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Add custom CSS to position toolbar icons higher and improve zoom persistence
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      .apexcharts-toolbar {
        top: 2px !important;
        right: 10px !important;
      }
      .apexcharts-menu-icon,
      .apexcharts-reset-icon, 
      .apexcharts-zoom-icon, 
      .apexcharts-zoomin-icon, 
      .apexcharts-zoomout-icon, 
      .apexcharts-pan-icon,
      .apexcharts-download-icon,
      .apexcharts-selection-icon {
        transform: translateY(0px);
      }
      .apexcharts-marker {
        opacity: 1 !important;
        visibility: visible !important;
      }
      .apexcharts-series-markers {
        opacity: 1 !important;
        visibility: visible !important;
      }
      
      /* Prevent chart from auto-zooming out */
      .apexcharts-canvas.apexcharts-zoom-enabled .apexcharts-reset-zoom-icon {
        visibility: visible !important;
      }
      .apexcharts-canvas.apexcharts-zoom-enabled .apexcharts-selection-icon,
      .apexcharts-canvas.apexcharts-zoom-enabled .apexcharts-zoom-icon {
        visibility: visible !important;
      }
      .apexcharts-canvas.apexcharts-zoom-enabled.apexcharts-theme-light .apexcharts-selection-rect {
        fill: rgba(80, 110, 228, 0.1) !important;
        stroke: rgba(80, 110, 228, 0.4) !important;
      }
      .apexcharts-canvas.apexcharts-zoom-enabled.apexcharts-theme-dark .apexcharts-selection-rect {
        fill: rgba(80, 110, 228, 0.3) !important;
        stroke: rgba(80, 110, 228, 0.6) !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Add custom CSS for fullscreen mode
  useEffect(() => {
    if (fullScreen) {
      const style = document.createElement('style');
      style.innerHTML = `
        .fullscreen .apexcharts-line-series .apexcharts-series path {
          stroke-width: 4px !important;
        }
        .fullscreen .apexcharts-area-series .apexcharts-series path {
          fill-opacity: 0.4 !important;
        }
        .fullscreen .apexcharts-tooltip {
          font-size: 14px !important;
        }
        .fullscreen .apexcharts-marker {
          stroke-width: 3px !important;
          r: 5 !important;
        }
        .fullscreen .apexcharts-xaxis-label,
        .fullscreen .apexcharts-yaxis-label {
          font-size: 14px !important;
        }
      `;
      document.head.appendChild(style);
      return () => {
        document.head.removeChild(style);
      };
    }
  }, [fullScreen]);

  // Force chart redraw when location colors change
  useEffect(() => {
    if (chartRef.current && isChartLoaded) {
      try {
        // Add a slight delay to ensure the chart has been mounted
        const timer = setTimeout(() => {
          const chartInstance = getChartInstance();
          if (chartInstance) {
            chartInstance.updateOptions({
              colors: chartColorRef.current
            });
          }
        }, 100);
        
        return () => clearTimeout(timer);
      } catch (err) {
        logger.error("Error updating chart colors:", err);
      }
    }
  }, [locationColors, isChartLoaded]);

  const toggleFullScreen = () => {
    try {
      if (!document.fullscreenElement) {
        const chartContainer = document.querySelector(".chart-container");
        if (chartContainer) {
          if (chartContainer.requestFullscreen) {
            chartContainer.requestFullscreen()
              .then(() => setFullScreen(true))
              .catch(err => logger.error("Error attempting to enable fullscreen:", err));
          } else if (chartContainer.mozRequestFullScreen) { /* Firefox */
            chartContainer.mozRequestFullScreen()
              .then(() => setFullScreen(true))
              .catch(err => logger.error("Error attempting to enable fullscreen:", err));
          } else if (chartContainer.webkitRequestFullscreen) { /* Chrome, Safari & Opera */
            chartContainer.webkitRequestFullscreen()
              .then(() => setFullScreen(true))
              .catch(err => logger.error("Error attempting to enable fullscreen:", err));
          } else if (chartContainer.msRequestFullscreen) { /* IE/Edge */
            chartContainer.msRequestFullscreen()
              .then(() => setFullScreen(true))
              .catch(err => logger.error("Error attempting to enable fullscreen:", err));
          }
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen()
            .then(() => setFullScreen(false))
            .catch(err => logger.error("Error attempting to exit fullscreen:", err));
        } else if (document.mozCancelFullScreen) { /* Firefox */
          document.mozCancelFullScreen()
            .then(() => setFullScreen(false))
            .catch(err => logger.error("Error attempting to exit fullscreen:", err));
        } else if (document.webkitExitFullscreen) { /* Chrome, Safari & Opera */
          document.webkitExitFullscreen()
            .then(() => setFullScreen(false))
            .catch(err => logger.error("Error attempting to exit fullscreen:", err));
        } else if (document.msExitFullscreen) { /* IE/Edge */
          document.msExitFullscreen()
            .then(() => setFullScreen(false))
            .catch(err => logger.error("Error attempting to exit fullscreen:", err));
        }
      }
    } catch (error) {
      logger.error("Error toggling fullscreen:", error);
    }
  };

  // Enhanced error handling
  const handleChartError = (err) => {
    setChartError(err);
    logger.error("Chart error:", {
      error: err,
      chartType,
      seriesCount: series?.length,
      dataPoints: series?.[0]?.data?.length,
      memoryUsage: performance.memory ? {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
      } : undefined
    });
  };

  // Define height and width for chart container
  const containerStyle = useMemo(() => {
    const style = {};
    
    if (fullScreen) {
      style.width = '100vw';
      style.height = '100vh';
    } else {
      style.width = customWidth || '100%';
      style.height = customHeight || (chartType === "heatmap" ? 400 : 400);
    }
    
    return style;
  }, [fullScreen, chartType, customHeight, customWidth]);

  if (chartError) {
    return (
      <div className="chart-error p-4">
        <h3>Chart Error</h3>
        <p>There was an error displaying the chart. Please try refreshing the page.</p>
      </div>
    );
  }

  return (
    <div 
      className={`chart-container ${fullScreen ? 'fullscreen fixed inset-0 z-50 bg-gray-900' : ''}`} 
      ref={chartRef}
    >
      <div className="flex justify-end items-center mb-2 px-2">
        <div className="flex space-x-2">
          <button 
            onClick={() => exportExcel(translatedTitle, colorizedSeries || [])}
            className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label="Export to Excel"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M12 16L7 11H10V4H14V11H17L12 16Z"/>
              <path d="M18 18H6V15H4V18C4 19.1 4.9 20 6 20H18C19.1 20 20 19.1 20 18V15H18V18Z"/>
            </svg>
          </button>
          {allowFullScreen && (
            <button 
              onClick={toggleFullScreen}
              className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
              aria-label="Toggle fullscreen"
            >
              {fullScreen ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path d="M3 3a1 1 0 00-1 1v4a1 1 0 102 0V5h3a1 1 0 100-2H4a1 1 0 00-1 1zM13 3a1 1 0 011 1v4a1 1 0 11-2 0V5h-3a1 1 0 110-2h3a1 1 0 011 1zM3 13a1 1 0 001 1h4a1 1 0 100-2H5v-3a1 1 0 10-2 0v3a1 1 0 001 1zM13 13a1 1 0 001 1h4a1 1 0 001-1v-3a1 1 0 10-2 0v3h-3a1 1 0 100 2z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path d="M3.37 2.51A.75.75 0 014 2h6a.75.75 0 010 1.5H5.56l8.22 8.22a.75.75 0 11-1.06 1.06L4.5 4.56v4.44a.75.75 0 01-1.5 0v-6a.75.75 0 01.37-.65zM16.63 17.49A.75.75 0 0116 18h-6a.75.75 0 010-1.5h4.44l-8.22-8.22a.75.75 0 111.06-1.06l8.22 8.22v-4.44a.75.75 0 011.5 0v6a.75.75 0 01-.37.65z" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>
      <div style={containerStyle}>
        <Suspense fallback={<LoadingIndicator text={`${t('loading')} ${translatedTitle}...`} />}>
          {isChartLoaded && (
            <Chart
              options={chartOptions}
              series={colorizedSeries || []}
              type={chartType}
              width="100%"
              height="100%"
              onError={handleChartError}
            />
          )}
        </Suspense>
      </div>
    </div>
  );
}

export default ApexChart;