import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import moment from 'moment';
import 'moment/locale/sk'; // Import Slovak locale
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import LoadingIndicator from './LoadingIndicator';

// SVG icons for the control buttons - more minimalistic versions
const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
    <path d="M8 12l-4-4h2.5V3h3v5H12L8 12z"/>
    <path d="M3 13h10v1H3z"/>
  </svg>
);

const FullscreenIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
    <path d="M1.5 1.5v4h1v-3h3v-1h-4zm12 0h-4v1h3v3h1v-4zm-12 12v-4h-1v4h4v-1h-3zm12 0h-4v1h4v-4h-1v3z"/>
  </svg>
);

const ExitFullscreenIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
    <path d="M5.5 1.5h-4v4h1v-3h3v-1zm5 0v1h3v3h1v-4h-4zm-10 9h1v3h3v1h-4v-4zm13 0v4h-4v-1h3v-3h1z"/>
  </svg>
);

// A custom heatmap implementation that creates a smooth gradient effect
const ReavizHeatMap = ({ 
  showLabels = true, 
  historicalData = null, 
  selectedLocations = [], 
  thresholds = null,
  rangeKey = '30d',
  customStart = null,
  customEnd = null,
  customApplied = false,
  heatmapField = 'teplota'
}) => {
  // Main state for data processing and display
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dataFetched, setDataFetched] = useState(false);
  const [localThresholds, setLocalThresholds] = useState(thresholds || {
    min: 10,
    mid: 20,
    high: 30,
    colorMin: "#B3E6FF",
    colorMid: "#FFFF99",
    colorHigh: "#FF9999",
  });
  
  // State for interactive features
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, content: '' });
  
  // Refs for DOM elements and component lifecycle
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const isMountedRef = useRef(true);
  const renderTimeoutRef = useRef(null);
  
  // Get theme context instead of detecting system color scheme
  const { darkMode } = useTheme();
  
  // Get translation hook at the top level of the component
  const { t, i18n } = useTranslation();
  
  // State to track date labels
  const [dateLabels, setDateLabels] = useState([]);
  
  // Helper function to get translated month name
  const getTranslatedMonth = useCallback((monthIndex) => {
    const currentLang = i18n.language;
    
    // Short month names based on language
    const monthKeys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    
    // Use translations if available
    if (currentLang === 'sk') {
      // Slovak translations using the translation system
      return t(`heatmapDetails.months.${monthKeys[monthIndex]}`, monthKeys[monthIndex]);
    } else {
      // English translations using the translation system
      return t(`heatmap.months.${monthKeys[monthIndex]}`, monthKeys[monthIndex]);
    }
  }, [i18n.language, t]);
  
  // Set moment locale based on current language
  useEffect(() => {
    const currentLang = i18n.language;
    moment.locale(currentLang === 'sk' ? 'sk' : 'en');
    console.log('Moment locale set to:', moment.locale());
  }, [i18n.language]);
  
  // Determine days based on the current filter range
  const getDaysFromRange = useCallback(() => {
    switch (rangeKey) {
      case "7d": return 7;
      case "30d": return 30;
      case "90d": return 90;
      case "180d": return 180;
      case "365d": return 365;
      case "custom":
        if (customApplied && customStart && customEnd) {
          return moment(customEnd).diff(moment(customStart), 'days') + 1;
        }
        return 30;
      default:
        return 30;
    }
  }, [rangeKey, customStart, customEnd, customApplied]);
  
  // Calculate days for the current filter
  const days = getDaysFromRange();
  
  // Monitor component lifecycle
  useEffect(() => {
    console.log('ReavizHeatMap mounted');
    isMountedRef.current = true;
    
    return () => {
      console.log('ReavizHeatMap unmounted');
      isMountedRef.current = false;
      if (renderTimeoutRef.current) {
        clearTimeout(renderTimeoutRef.current);
      }
    };
  }, []);

  // Direct processing of data whenever props change
  useEffect(() => {
    console.log('ReavizHeatMap data processing started');
    
    // Apply thresholds from props
    if (thresholds) {
      setLocalThresholds(thresholds);
    }
    
    // Reset state for new data fetch
    setLoading(true);
    setError(null);
    setData([]);
    setDataFetched(false);
    
    // Process data if we have it
    if (historicalData && selectedLocations.length > 0) {
      try {
        // Use the first selected location
        const location = selectedLocations[0];
        
        if (!location) {
          throw new Error(t('noLocationsSelected', "No location selected"));
        }
        
        // Get temperature data for the selected location
        const locationData = historicalData[location]?.[heatmapField] || [];
        
        if (!locationData || locationData.length === 0) {
          throw new Error(t('noData', "No data for") + ` ${heatmapField} in ${location}`);
        }
        
        console.log(`Found ${locationData.length} data points for ${location} (${heatmapField})`);
        
        // Process data for the heatmap
        const dateMap = new Map();
        
        // Group data by day and hour
        locationData.forEach(point => {
          if (!point || !point.time || point.value === undefined) return;
          
          const date = moment(point.time).format('YYYY-MM-DD');
          const hour = moment(point.time).hour();
          
          if (!dateMap.has(date)) {
            dateMap.set(date, Array(24).fill(null));
          }
          
          const hourData = dateMap.get(date);
          hourData[hour] = point.value;
        });
        
        // Get all dates sorted
        const dates = Array.from(dateMap.keys()).sort();
        
        if (dates.length === 0) {
          throw new Error("No dates in data");
        }
        
        // Get the number of days to display
        const limitDays = Math.min(days, dates.length);
        const limitedDates = dates.slice(-limitDays);
        
        // Transform data into the format needed for the heatmap
        const transformedData = limitedDates.map(date => {
          const momentDate = moment(date);
          const dayOfWeek = momentDate.day();
          const hourData = dateMap.get(date);
          
          // Interpolate missing values
          for (let i = 0; i < hourData.length; i++) {
            if (hourData[i] === null) {
              // Find the next valid value
              let nextValidIndex = i + 1;
              while (nextValidIndex < hourData.length && hourData[nextValidIndex] === null) {
                nextValidIndex++;
              }
              
              // Find the previous valid value
              let prevValidIndex = i - 1;
              while (prevValidIndex >= 0 && hourData[prevValidIndex] === null) {
                prevValidIndex--;
              }
              
              // Interpolate if we have both previous and next values
              if (prevValidIndex >= 0 && nextValidIndex < hourData.length) {
                const prevValue = hourData[prevValidIndex];
                const nextValue = hourData[nextValidIndex];
                const range = nextValidIndex - prevValidIndex;
                const step = (nextValue - prevValue) / range;
                hourData[i] = prevValue + step * (i - prevValidIndex);
              } 
              else if (prevValidIndex >= 0) {
                hourData[i] = hourData[prevValidIndex];
              }
              else if (nextValidIndex < hourData.length) {
                hourData[i] = hourData[nextValidIndex];
              } 
              else {
                hourData[i] = 0;
              }
            }
          }
          
          return {
            date,
            dayOfWeek,
            dayName: momentDate.format('dddd'),
            hours: hourData.map((value, hour) => ({
              hour,
              value: value || 0
            }))
          };
        });
        
        console.log(`Data processed - ${transformedData.length} days with 24 hours each`);
        
        if (isMountedRef.current) {
          setData(transformedData);
          setDataFetched(true);
          setLoading(false);
        }
      } catch (error) {
        console.error('Error processing data:', error);
        if (isMountedRef.current) {
          setError(error.message || t('dataNotAvailable', 'Error processing data'));
          setLoading(false);
        }
      }
    } else {
      if (isMountedRef.current) {
        setError(t('dataNotAvailable', 'No data available. Please select a location and time range.'));
        setLoading(false);
      }
    }
  }, [historicalData, selectedLocations, days, thresholds, rangeKey, t, heatmapField]);

  // Helper function to blend two colors
  const blendColors = useCallback((color1, color2, ratio) => {
    // Convert hex to RGB
    const parseColor = (hexColor) => {
      const hex = hexColor.startsWith('#') ? hexColor.slice(1) : hexColor;
      return {
        r: parseInt(hex.substring(0, 2), 16),
        g: parseInt(hex.substring(2, 4), 16),
        b: parseInt(hex.substring(4, 6), 16)
      };
    };
    
    const c1 = parseColor(color1);
    const c2 = parseColor(color2);
    
    // Linear interpolation between the colors
    const r = Math.round(c1.r * (1 - ratio) + c2.r * ratio);
    const g = Math.round(c1.g * (1 - ratio) + c2.g * ratio);
    const b = Math.round(c1.b * (1 - ratio) + c2.b * ratio);
    
    // Convert back to hex
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }, []);
  
  // Get color for a temperature value
  const getColorForValue = useCallback((value) => {
    if (value <= localThresholds.min) {
      return localThresholds.colorMin;
    } else if (value <= localThresholds.mid) {
      // Blend between min and mid colors
      const ratio = (value - localThresholds.min) / (localThresholds.mid - localThresholds.min);
      return blendColors(localThresholds.colorMin, localThresholds.colorMid, ratio);
    } else {
      // Blend between mid and high colors
      const ratio = Math.min(1, (value - localThresholds.mid) / (localThresholds.high - localThresholds.mid));
      return blendColors(localThresholds.colorMid, localThresholds.colorHigh, ratio);
    }
  }, [localThresholds, blendColors]);
  
  // Handle mouse interactions with canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data.length) return;
    
    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      
      // Ensure we have valid dimensions
      if (rect.width <= 0 || rect.height <= 0 || canvas.width <= 0 || canvas.height <= 0) {
        return;
      }
      
      // Calculate cell dimensions
      const cellWidth = canvas.width / Math.max(1, data.length);
      const cellHeight = canvas.height / 24;
      
      // Get mouse position
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Convert to canvas coordinates - check for valid dimensions
      const x = mouseX * (canvas.width / Math.max(1, rect.width));
      const y = mouseY * (canvas.height / Math.max(1, rect.height));
      
      // Calculate which cell the mouse is over
      const dateIndex = Math.floor(x / cellWidth);
      const hour = Math.floor(y / cellHeight);
      
      // Show tooltip if mouse is over a valid cell
      if (dateIndex >= 0 && dateIndex < data.length && hour >= 0 && hour < 24) {
        const dayData = data[dateIndex];
        const hourData = dayData?.hours[hour];
        
        if (dayData && hourData) {
          // Force moment locale to match current language
          const currentLang = i18n.language;
          moment.locale(currentLang);
          
          // Direct translation approach instead of relying on moment's locale
          let formattedDate;
          
          // Get the day of week directly from the date
          const date = moment(dayData.date);
          const dayOfWeek = date.day(); // 0 = Sunday, 1 = Monday, etc.
          const dayNum = date.date();
          const month = date.month(); // 0 = January, etc.
          const year = date.year();
          
          // Use direct translations for day names and month names
          const dayNames = {
            sk: ['Nedeľa', 'Pondelok', 'Utorok', 'Streda', 'Štvrtok', 'Piatok', 'Sobota'],
            en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
          };
          
          const monthNames = {
            sk: ['január', 'február', 'marec', 'apríl', 'máj', 'jún', 'júl', 'august', 'september', 'október', 'november', 'december'],
            en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
          };
          
          // Get localized day and month names
          const localizedDayName = dayNames[currentLang] ? dayNames[currentLang][dayOfWeek] : dayNames['en'][dayOfWeek];
          const localizedMonthName = monthNames[currentLang] ? monthNames[currentLang][month] : monthNames['en'][month];
          
          // Format the date string according to the language
          if (currentLang === 'sk') {
            formattedDate = `${localizedDayName}, ${dayNum}. ${localizedMonthName} ${year}`;
          } else {
            formattedDate = `${localizedDayName}, ${localizedMonthName} ${dayNum}, ${year}`;
          }
          
          // Format hour based on language preference
          let formattedHour;
          
          if (i18n.language === 'en') {
            const hour12 = hour % 12 || 12; // Convert 0 to 12 for 12 AM
            const ampm = hour >= 12 ? t('heatmapDetails.PM', 'PM') : t('heatmapDetails.AM', 'AM');
            formattedHour = t('heatmapDetails.hourFormatAMPM', { hour: hour12, ampm });
          } else {
            // For non-English languages, use 24-hour format with padded zeros
            formattedHour = t('heatmapDetails.hourFormat', { hour: hour.toString().padStart(2, '0') });
          }
          
          // Check if value is -1 which indicates "no data"
          let valueDisplay;
          if (hourData.value === -1) {
            valueDisplay = t('heatmapDetails.noData', 'No data');
          } else {
            // Format value based on field type
            switch (heatmapField) {
              case 'teplota':
                valueDisplay = `${hourData.value.toFixed(1)}°C`;
                break;
              case 'vlhkost':
                valueDisplay = `${hourData.value.toFixed(1)}%`;
                break;
              case 'tlak':
                valueDisplay = `${hourData.value.toFixed(1)} hPa`;
                break;
              default:
                valueDisplay = `${hourData.value.toFixed(1)}`;
            }
          }
          
          setTooltip({
            visible: true,
            x: e.clientX,
            y: e.clientY,
            content: `${formattedDate} ${formattedHour} - ${valueDisplay}`
          });
          return;
        }
      }
      
      setTooltip(prev => ({ ...prev, visible: false }));
    };
    
    const handleMouseLeave = () => {
      setTooltip(prev => ({ ...prev, visible: false }));
    };
    
    // Add event listeners
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    
    // Remove event listeners on cleanup
    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [data, t, i18n.language, heatmapField]);
  
  // Get container dimensions and update canvas when size changes
  useEffect(() => {
    const updateCanvasSize = () => {
      if (!data.length || !canvasRef.current || !containerRef.current) {
        return;
      }
      
      // Get the container dimensions
      const container = containerRef.current;
      const containerWidth = container.clientWidth || 300;
      const containerHeight = container.clientHeight || 600;
      
      // Update canvas size
      drawHeatmap(containerWidth, containerHeight);
    };
    
    // Set up resize observer
    const resizeObserver = new ResizeObserver(() => {
      updateCanvasSize();
    });
    
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    // Initial size update
    updateCanvasSize();
    
    return () => {
      resizeObserver.disconnect();
    };
  }, [data, localThresholds]);

  // Draw heatmap on canvas
  const drawHeatmap = useCallback((containerWidth, containerHeight) => {
    if (!data.length || !canvasRef.current) {
      return;
    }

    console.log(`Drawing heatmap with ${data.length} days of data`);
    
    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        console.error('Failed to get canvas 2D context');
        return;
      }
      
      // Ensure we have valid dimensions
      const width = Math.max(300, containerWidth - 20);
      const height = Math.max(300, containerHeight - 50);
      
      // Clear canvas with appropriate background color based on color scheme
      canvas.width = width;
      canvas.height = height;
      
      // Set background color based on dark mode
      ctx.fillStyle = darkMode ? '#1a202c' : '#ffffff';
      ctx.fillRect(0, 0, width, height);
      
      // Validate dimensions again after setting
      if (canvas.width <= 0 || canvas.height <= 0 || width <= 0 || height <= 0 || data.length <= 0) {
        console.error('Invalid dimensions for drawing:', { 
          canvasWidth: canvas.width, 
          canvasHeight: canvas.height, 
          width, 
          height, 
          dataLength: data.length 
        });
        return;
      }
      
      // Calculate cell width - prevent division by zero
      const cellWidth = width / Math.max(1, data.length);
      const cellHeight = height / 24;
      
      // Set grid line and text colors based on dark mode
      const gridLineColor = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
      const textColor = darkMode ? 'rgba(255,255,255,0.85)' : '#333';
      
      // Draw vertical day slices with enhanced gradient transitions
      for (let dateIndex = 0; dateIndex < data.length - 1; dateIndex++) {
        const x1 = dateIndex * cellWidth;
        const x2 = (dateIndex + 1) * cellWidth;
        
        // For each vertical slice (day)
        for (let hour = 0; hour < 23; hour++) {
          const y1 = hour * cellHeight;
          const y2 = (hour + 1) * cellHeight;
          
          const currentTopValue = data[dateIndex].hours[hour]?.value || 0;
          const currentBottomValue = data[dateIndex].hours[hour + 1]?.value || 0;
          const nextTopValue = data[dateIndex + 1]?.hours[hour]?.value || 0;
          const nextBottomValue = data[dateIndex + 1]?.hours[hour + 1]?.value || 0;
          
          // Create a 2D gradient with multiple color stops for smoother transitions
          try {
            const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
            
            // Add more gradient color stops for a smoother blend
            gradient.addColorStop(0, getColorForValue(currentTopValue));
            gradient.addColorStop(0.3, getColorForValue((currentTopValue * 2 + currentBottomValue + nextTopValue) / 4));
            gradient.addColorStop(0.5, getColorForValue((currentTopValue + currentBottomValue + nextTopValue + nextBottomValue) / 4));
            gradient.addColorStop(0.7, getColorForValue((currentBottomValue + nextTopValue * 2 + nextBottomValue) / 4));
            gradient.addColorStop(1, getColorForValue(nextBottomValue));
            
            // Draw the gradient rectangle for this segment
            ctx.fillStyle = gradient;
            ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
          } catch (error) {
            console.error('Error creating gradient:', error);
            // Fallback to solid color on error
            ctx.fillStyle = getColorForValue(currentTopValue);
            ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
          }
        }
        
        // Handle the last hour segment
        const lastHour = 23;
        const y1 = lastHour * cellHeight;
        const y2 = height;
        
        const currentValue = data[dateIndex].hours[lastHour]?.value || 0;
        const nextValue = data[dateIndex + 1]?.hours[lastHour]?.value || 0;
        
        try {
          const gradient = ctx.createLinearGradient(x1, y1, x2, y1);
          gradient.addColorStop(0, getColorForValue(currentValue));
          gradient.addColorStop(0.5, getColorForValue((currentValue + nextValue) / 2));
          gradient.addColorStop(1, getColorForValue(nextValue));
          
          ctx.fillStyle = gradient;
          ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
        } catch (error) {
          ctx.fillStyle = getColorForValue(currentValue);
          ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
        }
      }
      
      // Handle the last day column
      const lastDateIndex = data.length - 1;
      if (lastDateIndex >= 0) {
        const x1 = lastDateIndex * cellWidth;
        const x2 = width;
        
        for (let hour = 0; hour < 23; hour++) {
          const y1 = hour * cellHeight;
          const y2 = (hour + 1) * cellHeight;
          
          const topValue = data[lastDateIndex].hours[hour]?.value || 0;
          const bottomValue = data[lastDateIndex].hours[hour + 1]?.value || 0;
          
          // Create vertical gradient for the last column
          try {
            const gradient = ctx.createLinearGradient(x1, y1, x1, y2);
            gradient.addColorStop(0, getColorForValue(topValue));
            gradient.addColorStop(1, getColorForValue(bottomValue));
            
            ctx.fillStyle = gradient;
            ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
          } catch (error) {
            ctx.fillStyle = getColorForValue(topValue);
            ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
          }
        }
        
        // Handle last cell of last day
        const lastHour = 23;
        const y1 = lastHour * cellHeight;
        const y2 = height;
        const value = data[lastDateIndex].hours[lastHour]?.value || 0;
        ctx.fillStyle = getColorForValue(value);
        ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
      }
      
      // Draw grid lines
      ctx.strokeStyle = gridLineColor;
      
      // Draw vertical grid lines
      for (let dateIndex = 0; dateIndex <= data.length; dateIndex++) {
        const x = dateIndex * cellWidth;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      
      // Draw horizontal grid lines
      for (let hour = 0; hour <= 24; hour++) {
        const y = hour * cellHeight;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      
      // We don't need to draw date labels on canvas anymore since we're using HTML elements
      
      console.log('Canvas rendering complete');
    } catch (error) {
      console.error('Error rendering canvas:', error);
      setError('Error rendering chart: ' + (error.message || 'Unknown error'));
    }
  }, [data, localThresholds, getColorForValue, darkMode]);

  // Update date labels when data changes
  useEffect(() => {
    if (!data || data.length === 0) return;
    
    // Force moment locale to match current language
    moment.locale(i18n.language);
    
    // Group the dates by month
    const datesByMonth = {};
    
    data.forEach((day, index) => {
      if (!day || !day.date) return;
      
      const date = moment(day.date);
      if (!date.isValid()) return;
      
      const monthKey = date.format('YYYY-MM');
      // Use translation for month name instead of moment's format
      const monthNum = date.month(); // 0-based month index
      const monthName = getTranslatedMonth(monthNum);
      
      if (!datesByMonth[monthKey]) {
        datesByMonth[monthKey] = {
          month: monthName,
          monthNum: date.format('MM'),
          dates: [],
          firstDay: null,
          lastDay: null
        };
      }
      
      datesByMonth[monthKey].dates.push({
        date,
        index,
        isFirstOfMonth: date.date() === 1,
        dayOfMonth: date.date(),
        formatted: date.format('DD.MM')
      });
      
      // Track first and last day of each month
      if (!datesByMonth[monthKey].firstDay || index < datesByMonth[monthKey].firstDay.index) {
        datesByMonth[monthKey].firstDay = { date, index };
      }
      
      if (!datesByMonth[monthKey].lastDay || index > datesByMonth[monthKey].lastDay.index) {
        datesByMonth[monthKey].lastDay = { date, index };
      }
    });
    
    // Convert to array and sort by month
    const monthsArray = Object.values(datesByMonth).sort((a, b) => {
      return a.monthNum - b.monthNum;
    });
    
    setDateLabels(monthsArray);
  }, [data, i18n.language, getTranslatedMonth]);
  
  // Render date labels as actual HTML elements instead of canvas
  const renderDateLabels = () => {
    if (!containerRef.current || dateLabels.length === 0) return null;
    
    // Use canvas width for precise alignment with the heatmap
    const canvasWidth = canvasRef.current ? canvasRef.current.width : 0;
    const cellWidth = canvasWidth / Math.max(1, data.length);
    
    return (
      <div className="date-labels" style={{ 
        position: 'absolute', 
        bottom: -40,
        left: 0,
        width: `${canvasWidth}px`, // Match canvas width exactly
        overflow: 'visible',
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Month labels - generate evenly distributed month labels */}
        <div style={{ 
          width: '100%', 
          position: 'relative', 
          height: '25px',
          display: 'flex',
          marginTop: '-5px'
        }}>
          {dateLabels.map((month) => {
            // Calculate width for each month based on its date range
            const monthWidth = ((month.lastDay.index - month.firstDay.index + 1) / data.length) * 100;
            
            // Position based on first day of the month
            const leftPosition = (month.firstDay.index / data.length) * 100;
            
            // Month name with colored background
            return (
              <div 
                key={`month-${month.month}`}
                style={{
                  position: 'absolute',
                  left: `${leftPosition}%`,
                  width: `${monthWidth}%`,
                  bottom: 0,
                  color: darkMode ? '#e0e0e0' : '#333333',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  padding: '0 6px',
                  textAlign: 'center',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center'
                }}
              >
                {month.month}
              </div>
            );
          })}
        </div>
        
        {/* Day numbers - show at fixed intervals and first day of month */}
        {dateLabels.map((month) => {
          // Array of visible day markers: 1, 5, 10, 15, 20, 25, 30
          const dayMarkers = [1, 5, 10, 15, 20, 25, 30];
          const visibleDays = month.dates.filter(day => dayMarkers.includes(day.dayOfMonth));
          
          return visibleDays.map((day) => {
            // Calculate position based on canvas coordinates
            const dayPositionRatio = day.index / data.length;
            const x = dayPositionRatio * 100;
            
            return (
              <div 
                key={`day-${day.index}`}
                style={{
                  position: 'absolute',
                  left: `${x}%`,
                  bottom: '28px',
                  transform: 'translateX(-50%)',
                  color: darkMode ? '#cccccc' : '#555555',
                  fontSize: '10px',
                  textAlign: 'center',
                  width: '14px',
                  overflow: 'visible',
                  whiteSpace: 'nowrap'
                }}
              >
                {day.dayOfMonth}
              </div>
            );
          });
        })}
      </div>
    );
  };

  // Create hour labels component with proper positioning and localization
  const renderHourLabels = () => {
    const currentHour = new Date().getHours();
    const currentLang = i18n.language;
    
    return (
      <div className="hour-labels" style={{ 
        position: 'absolute', 
        left: isFullscreen ? '-40px' : '-20px', 
        top: '0', 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'space-between',
        zIndex: 10
      }}>
        {Array.from({ length: 24 }, (_, i) => {
          // Create hour label based on language
          let label;
          if (currentLang === 'en') {
            // For English: Use 12-hour format with no padding
            const hour12 = i % 12 || 12; // Convert 0 to 12 for 12 AM
            label = `${hour12}${i >= 12 ? ' PM' : ' AM'}`;
          } else {
            // For other languages: Use 24-hour format with proper padding and ":00" suffix
            label = `${i.toString().padStart(2, '0')}:00`; // Format as "00:00", "01:00", etc.
          }
          
          return {
            hour: i,
            label: label
          };
        }).map((hourData, index) => {
          // Calculate position to precisely align with grid cells
          // Position based on cell height - first cell starts at 0%, last at 100%-cellHeight
          const position = index * (100 / 24); // Distribute exactly based on grid cell height
          
          return (
            <div 
              key={hourData.hour} 
              style={{ 
                position: 'absolute',
                top: `${position}%`,
                height: `${100/24}%`, // Each label takes exactly 1/24 of the height
                left: 0,
                right: 0,
                display: 'flex',
                alignItems: 'center', // Center vertically within the cell
                justifyContent: 'flex-end', // Align text to the right
                fontSize: isFullscreen ? '14px' : '13px',
                fontFamily: '"Roboto Mono", Consolas, monospace',
                color: hourData.hour === currentHour 
                  ? '#44aaff' 
                  : darkMode 
                    ? 'rgba(255, 255, 255, 0.95)' 
                    : 'rgba(0, 0, 0, 0.85)', // Adjust color based on dark mode
                fontWeight: hourData.hour === currentHour ? 'bold' : '600',
                paddingRight: '8px',
                boxSizing: 'border-box',
                textRendering: 'geometricPrecision',
                whiteSpace: 'nowrap',
                textShadow: darkMode ? '0px 0px 2px rgba(0,0,0,0.8)' : 'none',
                WebkitFontSmoothing: 'antialiased',
                MozOsxFontSmoothing: 'grayscale',
                userSelect: 'none'
              }}
            >
              {hourData.label}
            </div>
          );
        })}
      </div>
    );
  };
  
  // We don't need the AM/PM labels anymore as they're included in the hour labels
  const renderAmPmLabels = () => {
    return null;
  };

  // New state variables for fullscreen and download options
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showDownloadOptions, setShowDownloadOptions] = useState(false);
  const heatmapContainerRef = useRef(null);
  
  // Toggle fullscreen mode
  const toggleFullscreen = useCallback(() => {
    if (!heatmapContainerRef.current) return;
    
    if (!isFullscreen) {
      if (heatmapContainerRef.current.requestFullscreen) {
        heatmapContainerRef.current.requestFullscreen();
      } else if (heatmapContainerRef.current.mozRequestFullScreen) {
        heatmapContainerRef.current.mozRequestFullScreen();
      } else if (heatmapContainerRef.current.webkitRequestFullscreen) {
        heatmapContainerRef.current.webkitRequestFullscreen();
      } else if (heatmapContainerRef.current.msRequestFullscreen) {
        heatmapContainerRef.current.msRequestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
      setIsFullscreen(false);
    }
  }, [isFullscreen]);
  
  // Listen for fullscreen change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(
        document.fullscreenElement || 
        document.mozFullScreenElement || 
        document.webkitFullscreenElement || 
        document.msFullscreenElement
      );
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);
    
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
    };
  }, []);
  
  // Get field title based on the field
  const getFieldTitle = () => {
    switch(heatmapField) {
      case 'teplota': return t('temperature', 'Temperature');
      case 'vlhkost': return t('humidity', 'Humidity');
      case 'tlak': return t('pressure', 'Pressure');
      default: return t('temperature', 'Temperature');
    }
  };
  
  // Get the appropriate scale title based on the field
  const getScaleTitle = () => {
    switch(heatmapField) {
      case 'teplota': return t('temperatureScale', 'Temperature Scale');
      case 'vlhkost': return t('humidityScale', 'Humidity Scale');
      case 'tlak': return t('pressureScale', 'Pressure Scale');
      default: return t('temperatureScale', 'Temperature Scale');
    }
  };
  
  // Get the appropriate legend title based on the field
  const getLegendTitle = () => {
    switch(heatmapField) {
      case 'teplota': return t('heatmap.legendTitle', 'Temperature Values');
      case 'vlhkost': return t('heatmap.humidityLegendTitle', 'Humidity Values');
      case 'tlak': return t('heatmap.pressureLegendTitle', 'Pressure Values');
      default: return t('heatmap.legendTitle', 'Temperature Values');
    }
  };
  
  // Get the appropriate unit for the field
  const getFieldUnit = () => {
    switch(heatmapField) {
      case 'teplota': return '°C';
      case 'vlhkost': return '%';
      case 'tlak': return 'hPa';
      default: return '°C';
    }
  };
  
  // Export image as PNG
  const exportAsPNG = useCallback(() => {
    if (!canvasRef.current) return;
    
    const timestamp = moment().format('YYYY-MM-DD_HH-mm');
    const fieldName = heatmapField === 'teplota' ? 'temperature' : 
                       heatmapField === 'vlhkost' ? 'humidity' : 
                       heatmapField === 'tlak' ? 'pressure' : 'temperature';
    const filename = `${fieldName}_heatmap_${selectedLocations[0] || 'sensor'}_${timestamp}.png`;
    
    try {
      // Convert canvas to PNG and download
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvasRef.current.toDataURL('image/png');
      link.click();
      
      // Close download options
      setShowDownloadOptions(false);
    } catch (error) {
      console.error('Error downloading PNG:', error);
      alert(t('errorDownloadingPNG', 'Error downloading PNG. Please try again.'));
    }
  }, [selectedLocations, t, heatmapField]);
  
  // Export image as SVG
  const exportAsSVG = useCallback(() => {
    if (!canvasRef.current) return;
    
    try {
      // Create a temporary canvas to get the image data
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // Create the SVG document
      const svgDoc = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svgDoc.setAttribute('width', canvas.width);
      svgDoc.setAttribute('height', canvas.height);
      svgDoc.setAttribute('viewBox', `0 0 ${canvas.width} ${canvas.height}`);
      
      // Create the image element in the SVG
      const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      img.setAttribute('width', canvas.width);
      img.setAttribute('height', canvas.height);
      img.setAttribute('href', canvas.toDataURL('image/png'));
      svgDoc.appendChild(img);
      
      // Convert the SVG to a data URL
      const svgData = new XMLSerializer().serializeToString(svgDoc);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      
      // Create a download link
      const link = document.createElement('a');
      const timestamp = moment().format('YYYY-MM-DD_HH-mm');
      const fieldName = heatmapField === 'teplota' ? 'temperature' : 
                       heatmapField === 'vlhkost' ? 'humidity' : 
                       heatmapField === 'tlak' ? 'pressure' : 'temperature';
      link.download = `${fieldName}_heatmap_${selectedLocations[0] || 'sensor'}_${timestamp}.svg`;
      link.href = svgUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up the URL object
      setTimeout(() => URL.revokeObjectURL(svgUrl), 100);
    } catch (error) {
      console.error('Error creating SVG:', error);
      alert(t('errorDownloadingSVG', 'Error downloading SVG. Please try again.'));
    }
  }, [selectedLocations, t, heatmapField]);

  if (loading) {
    // Get field name for loading message
    const fieldName = (() => {
      switch(heatmapField) {
        case 'teplota': return t('temperature', 'temperature');
        case 'vlhkost': return t('humidity', 'humidity');
        case 'tlak': return t('pressure', 'pressure');
        default: return t('temperature', 'temperature');
      }
    })();
    
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '500px',
        position: 'relative'
      }}>
        <LoadingIndicator text={`${t('loading', 'Loading')} ${fieldName} ${t('heatmap.matrix', 'matrix')} ${t('for', 'for')} ${selectedLocations[0] || 'sensor'}...`} />
        <div style={{ marginTop: '15px', fontSize: '14px', color: '#666' }}>
          {t('processing', 'Processing')} {fieldName} {t('data', 'data')}...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '500px',
        color: '#666'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '18px', marginBottom: '10px' }}>{error}</div>
          <div style={{ fontSize: '14px' }}>Try selecting another location or time range</div>
          <button 
            onClick={() => window.location.reload()}
            style={{
              marginTop: '15px',
              padding: '8px 15px',
              background: '#0066CC',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '500px',
        color: '#666'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '18px', marginBottom: '10px' }}>{t('dataNotAvailable', 'No data available. Please select a location and time range.')}</div>
          <div style={{ fontSize: '14px' }}>{t('trySelectingAnother', 'Try selecting another location or time range')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="custom-heatmap" style={{ 
      width: '100%',
      padding: '20px',
      backgroundColor: darkMode ? '#1a202c' : '#fff',
      color: darkMode ? '#e0e0e0' : '#333',
      borderRadius: '8px',
      transition: 'background-color 0.3s ease'
    }} ref={heatmapContainerRef}>
      {/* Header with title and controls */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '15px',
      }}>
        <div style={{ 
          fontSize: '16px', 
          fontWeight: 'bold',
          color: darkMode ? '#e0e0e0' : '#444'
        }}>
          {getFieldTitle()} {t('heatmap.matrix', 'Matrix')} ({selectedLocations[0]}) - {data.length} {t('heatmap.days', 'days')} × 24 {t('heatmap.hours', 'hours')}
        </div>
        
        {/* Control buttons */}
        <div style={{ display: 'flex', gap: '10px' }}>
          {/* Download button with dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowDownloadOptions(!showDownloadOptions)}
              className="download-btn"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                background: darkMode ? '#1a202c' : '#f0f0f0',
                border: `1px solid ${darkMode ? '#444' : '#ccc'}`,
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                color: darkMode ? '#e0e0e0' : '#333'
              }}
              title={t('heatmapControls.downloadChart', 'Download Chart')}
            >
              <DownloadIcon />
            </button>
            
            {showDownloadOptions && (
              <div style={{
                position: 'absolute',
                right: 0,
                top: '100%',
                marginTop: '5px',
                background: darkMode ? '#1a202c' : 'white',
                border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
                borderRadius: '4px',
                boxShadow: darkMode ? '0 2px 10px rgba(0,0,0,0.3)' : '0 2px 10px rgba(0,0,0,0.1)',
                zIndex: 100,
                overflow: 'hidden'
              }}>
                <button
                  onClick={exportAsPNG}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '8px 15px',
                    textAlign: 'left',
                    border: 'none',
                    borderBottom: `1px solid ${darkMode ? '#444' : '#eee'}`,
                    background: darkMode ? '#1a202c' : 'white',
                    color: darkMode ? '#e0e0e0' : '#333',
                    cursor: 'pointer'
                  }}
                  onMouseOver={(e) => e.target.style.background = darkMode ? '#2a3349' : '#f5f5f5'}
                  onMouseOut={(e) => e.target.style.background = darkMode ? '#1a202c' : 'white'}
                >
                  {t('heatmapControls.downloadAsPNG', 'Download as PNG')}
                </button>
                <button
                  onClick={exportAsSVG}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '8px 15px',
                    textAlign: 'left',
                    border: 'none',
                    background: darkMode ? '#1a202c' : 'white',
                    color: darkMode ? '#e0e0e0' : '#333',
                    cursor: 'pointer'
                  }}
                  onMouseOver={(e) => e.target.style.background = darkMode ? '#2a3349' : '#f5f5f5'}
                  onMouseOut={(e) => e.target.style.background = darkMode ? '#1a202c' : 'white'}
                >
                  {t('heatmapControls.downloadAsSVG', 'Download as SVG')}
                </button>
              </div>
            )}
          </div>
          
          {/* Fullscreen button */}
          <button
            onClick={toggleFullscreen}
            className="fullscreen-btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '6px 12px',
              background: darkMode ? '#1a202c' : '#f0f0f0',
              border: `1px solid ${darkMode ? '#444' : '#ccc'}`,
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              color: darkMode ? '#e0e0e0' : '#333'
            }}
            title={isFullscreen ? t('heatmapControls.exitFullscreen', 'Exit Fullscreen') : t('heatmapControls.enterFullscreen', 'Enter Fullscreen')}
          >
            {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
          </button>
        </div>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'row' }}>
        {/* Y-axis title - removed since we now have direct hour labels */}
        
        {/* Canvas container - adjusted padding to accommodate lower labels */}
        <div 
          ref={containerRef}
          style={{ 
            position: 'relative', 
            width: 'calc(100% - 30px)',
            paddingRight: '20px',
            paddingBottom: '80px',
            height: isFullscreen ? '80vh' : '600px',
            marginLeft: '60px',
          }}
        >
          <canvas 
            ref={canvasRef} 
            style={{ 
              width: '100%', 
              height: isFullscreen ? '100%' : '600px',
              display: 'block',
              border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
              borderRadius: '4px',
              boxShadow: darkMode ? '0 2px 4px rgba(0,0,0,0.3)' : '0 2px 4px rgba(0,0,0,0.1)'
            }}
          />
          
          {/* Tooltip */}
          {tooltip.visible && (
            <div style={{
              position: 'fixed',
              left: `${tooltip.x + 10}px`,
              top: `${tooltip.y + 10}px`,
              background: darkMode ? 'rgba(50,50,50,0.9)' : 'rgba(0,0,0,0.8)',
              color: 'white',
              padding: '5px 10px',
              borderRadius: '4px',
              fontSize: '12px',
              pointerEvents: 'none',
              zIndex: 1000,
              boxShadow: darkMode ? '0 2px 8px rgba(0,0,0,0.5)' : '0 2px 8px rgba(0,0,0,0.2)'
            }}>
              {tooltip.content}
            </div>
          )}
          
          {/* Render hour labels */}
          {renderHourLabels()}
          
          {/* Render date labels */}
          {renderDateLabels()}
        </div>
      </div>
      
      {/* Temperature Scale Legend - in a separate div with margin to visually separate it */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        marginTop: '40px',
        padding: '10px',
        gap: '15px',
        fontSize: '13px',
        border: `1px solid ${darkMode ? '#444' : '#eee'}`,
        borderRadius: '4px',
        backgroundColor: darkMode ? 'rgba(26, 32, 44, 0.8)' : 'rgba(255,255,255,0.8)'
      }}>
        <div style={{ 
          fontWeight: 'bold', 
          marginRight: '10px',
          color: darkMode ? '#e0e0e0' : 'inherit'
        }}>
          {getScaleTitle()}:
        </div>
        {/* Create a gradient bar for the legend */}
        <div style={{ 
          width: '300px', 
          height: '20px',
          background: `linear-gradient(to right, 
            ${localThresholds.colorMin}, 
            ${localThresholds.colorMid}, 
            ${localThresholds.colorHigh})`,
          borderRadius: '2px',
          boxShadow: darkMode ? '0 1px 3px rgba(0,0,0,0.4)' : '0 1px 3px rgba(0,0,0,0.2)'
        }} />
        <span style={{ color: darkMode ? '#e0e0e0' : 'inherit' }}>{getFieldUnit()} ≤ {localThresholds.min}</span>
        <span style={{ color: darkMode ? '#e0e0e0' : 'inherit' }}>{getFieldUnit()} {localThresholds.mid}</span>
        <span style={{ color: darkMode ? '#e0e0e0' : 'inherit' }}>{getFieldUnit()} ≥ {localThresholds.high}</span>
      </div>
    </div>
  );
};

export default ReavizHeatMap;