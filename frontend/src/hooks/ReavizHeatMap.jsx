import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import moment from 'moment';
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
  customApplied = false
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
  
  // Determine days based on the current filter range
  const getDaysFromRange = useCallback(() => {
    switch (rangeKey) {
      case "7d": return 7;
      case "30d": return 30;
      case "90d": return 90;
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
        const locationData = historicalData[location]?.['teplota'] || [];
        
        if (!locationData || locationData.length === 0) {
          throw new Error(t('noData', "No temperature data for") + ` ${location}`);
        }
        
        console.log(`Found ${locationData.length} data points for ${location}`);
        
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
  }, [historicalData, selectedLocations, days, thresholds, rangeKey, t]);

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
          // Set moment locale based on current language for localized day and month names
          const currentLang = i18n.language;
          moment.locale(currentLang === 'sk' ? 'sk' : 'en');
          
          // Format date based on the current language - with localized day names
          let formattedDate;
          if (currentLang === 'sk') {
            // For Slovak, use the correct date format with proper declension
            // Slovak date format is typically: "deň. mesiac rok" (e.g., "1. mája 2023")
            const day = moment(dayData.date).format('D');
            const month = moment(dayData.date).format('MMMM');
            const year = moment(dayData.date).format('YYYY');
            const weekday = moment(dayData.date).format('dddd');
            
            // Capitalize first letter of day name
            const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
            
            // Full formatted Slovak date
            formattedDate = `${capitalizedWeekday}, ${day}. ${month} ${year}`;
          } else {
            // For English, use standard format
            formattedDate = moment(dayData.date).format('dddd, MMMM D, YYYY');
          }
          
          // Format hour based on language preference
          let formattedHour;
          
          if (currentLang === 'en') {
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
            valueDisplay = t('heatmapDetails.noData', currentLang === 'sk' ? 'Žiadne údaje' : 'No data');
          } else {
            valueDisplay = `${hourData.value.toFixed(1)}°C`;
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
  }, [data, t, i18n.language]);
  
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
          // Missing fillRect call - adding it here:
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
      
      // Add grid lines
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      
      // Draw grid lines with appropriate color
      for (let dateIndex = 0; dateIndex <= data.length; dateIndex++) {
        const x = dateIndex * cellWidth;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.strokeStyle = gridLineColor;
        ctx.stroke();
      }
      
      for (let hour = 0; hour <= 24; hour++) {
        const y = hour * cellHeight;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.strokeStyle = gridLineColor;
        ctx.stroke();
      }
      
      // Add date labels on the X-axis
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      
      // Calculate label interval based on number of days
      let labelInterval = Math.max(1, Math.ceil(data.length / 15));
      
      // Create set of labels to show
      const labelsToShow = new Set();
      labelsToShow.add(0); // First day
      labelsToShow.add(data.length - 1); // Last day
      
      // Add regularly spaced labels
      for (let i = labelInterval; i < data.length - 1; i += labelInterval) {
        labelsToShow.add(i);
      }
      
      // Add 1st of month markers
      for (let i = 0; i < data.length; i++) {
        try {
          const date = moment(data[i].date);
          if (date.date() === 1) {
            labelsToShow.add(i);
          }
        } catch (error) {
          console.error('Error parsing date:', error);
        }
      }
      
      // Sort labels
      const sortedLabels = Array.from(labelsToShow).sort((a, b) => a - b);
      
      // Format dates
      for (let i = 0; i < sortedLabels.length; i++) {
        try {
          const dateIndex = sortedLabels[i];
          const x = dateIndex * cellWidth + (cellWidth / 2);
          const dayData = data[dateIndex];
          
          if (!dayData || !dayData.date) continue;
          
          const date = moment(dayData.date);
          if (!date.isValid()) continue;
          
          const dayOfMonth = date.date(); // 1-31
          
          // Draw day of month with color scheme-appropriate text color
          ctx.fillStyle = textColor;
          ctx.font = '12px Arial';
          ctx.fillText(dayOfMonth.toString(), x, height + 5);
          
          // Draw abbreviated month name if it's the first day of month or first shown day
          if (date.date() === 1 || dateIndex === 0 || i === 0) {
            ctx.fillText(date.format('MMM'), x, height + 20);
          }
        } catch (error) {
          console.error('Error drawing date label:', error);
        }
      }
      
      console.log('Canvas rendering complete');
    } catch (error) {
      console.error('Error rendering canvas:', error);
      setError('Error rendering chart: ' + (error.message || 'Unknown error'));
    }
  }, [data, localThresholds, getColorForValue, darkMode]);

  // Create hour labels component with proper positioning and localization
  const renderHourLabels = () => {
    const currentHour = new Date().getHours();
    const currentLang = i18n.language;
    
    return (
      <div className="hour-labels" style={{ 
        position: 'absolute', 
        left:'30px', 
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
            label = hour12.toString();
          } else {
            // For other languages: Use 24-hour format with proper padding
            label = i.toString().padStart(2, '0'); // Ensure two digits with leading zero
          }
          
          return {
            hour: i,
            label: label
          };
        }).map((hourData, index) => {
          // Calculate position to align with grid cells
          const position = (index / 23) * 100; // Distribute evenly across height
          
          return (
            <div 
              key={hourData.hour} 
              style={{ 
                position: 'absolute',
                top: `${position}%`,
                transform: 'translateY(-50%)',
                right: '2px',
                fontSize: isFullscreen ? '14px' : '13px',
                fontFamily: '"Roboto Mono", Consolas, monospace',
                color: hourData.hour === currentHour 
                  ? '#44aaff' 
                  : darkMode 
                    ? 'rgba(255, 255, 255, 0.95)' 
                    : 'rgba(0, 0, 0, 0.85)', // Adjust color based on dark mode
                fontWeight: hourData.hour === currentHour ? 'bold' : '600',
                textRendering: 'geometricPrecision',
                letterSpacing: '0px',
                textAlign: 'right',
                whiteSpace: 'nowrap',
                textShadow: darkMode ? '0px 0px 2px rgba(0,0,0,0.8)' : 'none',
                WebkitFontSmoothing: 'antialiased',
                MozOsxFontSmoothing: 'grayscale',
                width: '24px',
                lineHeight: '1',
                padding: '2px 0',
                userSelect: 'none',
                willChange: 'transform',
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden'
              }}
            >
              {hourData.label}
            </div>
          );
        })}
      </div>
    );
  };
  
  // AM/PM hour labels on the right side
  const renderAmPmLabels = () => {
    const currentHour = new Date().getHours();
    const currentLang = i18n.language;
    
    return (
      <div className="ampm-labels" style={{ 
        position: 'absolute', 
        left: '97%', 
        top: '0', 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'space-between',
        zIndex: 10,
        paddingLeft: '5px',
      }}>
        {Array.from({ length: 24 }, (_, i) => {
          let label;
          if (currentLang === 'en') {
            // For English: Display AM/PM
            label = i >= 12 ? t('heatmapDetails.PM', 'PM') : t('heatmapDetails.AM', 'AM');
          } else {
            // For other languages: Display ":00" suffix
            label = ':00';
          }
          
          return {
            hour: i,
            label: label
          };
        }).map((hourData, index) => {
          // Calculate position to align with grid cells
          const position = (index / 23) * 100; // Distribute evenly across height
          
          return (
            <div 
              key={hourData.hour} 
              style={{ 
                position: 'absolute',
                top: `${position}%`,
                transform: 'translateY(-50%)',
                left: '0',
                fontSize: isFullscreen ? '13px' : '12px',
                fontFamily: 'Arial, sans-serif',
                color: hourData.hour === currentHour 
                  ? '#44aaff' 
                  : darkMode 
                    ? 'rgba(255, 255, 255, 0.9)' 
                    : 'rgba(0, 0, 0, 0.8)', // Adjust color based on dark mode
                fontWeight: hourData.hour === currentHour ? 'bold' : '600',
                textRendering: 'geometricPrecision',
                letterSpacing: '0.1px',
                textAlign: 'left',
                whiteSpace: 'nowrap',
                textShadow: darkMode ? '0px 0px 2px rgba(0,0,0,0.8)' : 'none'
              }}
            >
              {hourData.label}
            </div>
          );
        })}
      </div>
    );
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
  
  // Handle download as PNG
  const downloadAsPNG = useCallback(() => {
    if (!canvasRef.current) return;
    
    try {
      // Create a temporary link element
      const link = document.createElement('a');
      const timestamp = moment().format('YYYY-MM-DD_HH-mm');
      const filename = `temperature_heatmap_${selectedLocations[0] || 'sensor'}_${timestamp}.png`;
      
      // Convert canvas to PNG and download
      link.download = filename;
      link.href = canvasRef.current.toDataURL('image/png');
      link.click();
      
      // Close download options
      setShowDownloadOptions(false);
    } catch (error) {
      console.error('Error downloading PNG:', error);
      alert(t('errorDownloadingPNG', 'Error downloading PNG. Please try again.'));
    }
  }, [selectedLocations, t]);
  
  // Handle download as SVG
  const downloadAsSVG = useCallback(() => {
    if (!canvasRef.current || !data.length) return;
    
    try {
      // Create SVG element
      const svgNamespace = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNamespace, "svg");
      const canvas = canvasRef.current;
      const width = canvas.width;
      const height = canvas.height;
      
      // Set SVG attributes
      svg.setAttribute("width", width);
      svg.setAttribute("height", height);
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      svg.setAttribute("xmlns", svgNamespace);
      
      // Calculate cell dimensions
      const cellWidth = width / Math.max(1, data.length);
      const cellHeight = height / 24;
      
      // Create gradient definitions for SVG
      const defs = document.createElementNS(svgNamespace, "defs");
      svg.appendChild(defs);
      
      // Draw vertical day slices
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
          
          // Create a gradient for this cell
          const gradientId = `grad-${dateIndex}-${hour}`;
          const gradient = document.createElementNS(svgNamespace, "linearGradient");
          gradient.setAttribute("id", gradientId);
          gradient.setAttribute("x1", "0%");
          gradient.setAttribute("y1", "0%");
          gradient.setAttribute("x2", "100%");
          gradient.setAttribute("y2", "100%");
          
          // Add color stops
          const createStop = (offset, value) => {
            const stop = document.createElementNS(svgNamespace, "stop");
            stop.setAttribute("offset", offset);
            stop.setAttribute("stop-color", getColorForValue(value));
            return stop;
          };
          
          gradient.appendChild(createStop("0%", currentTopValue));
          gradient.appendChild(createStop("30%", (currentTopValue * 2 + currentBottomValue + nextTopValue) / 4));
          gradient.appendChild(createStop("50%", (currentTopValue + currentBottomValue + nextTopValue + nextBottomValue) / 4));
          gradient.appendChild(createStop("70%", (currentBottomValue + nextTopValue * 2 + nextBottomValue) / 4));
          gradient.appendChild(createStop("100%", nextBottomValue));
          
          defs.appendChild(gradient);
          
          // Draw the rectangle with gradient
          const rect = document.createElementNS(svgNamespace, "rect");
          rect.setAttribute("x", x1);
          rect.setAttribute("y", y1);
          rect.setAttribute("width", x2 - x1);
          rect.setAttribute("height", y2 - y1);
          rect.setAttribute("fill", `url(#${gradientId})`);
          
          svg.appendChild(rect);
        }
      }
      
      // Handle grid lines
      for (let dateIndex = 0; dateIndex <= data.length; dateIndex++) {
        const x = dateIndex * cellWidth;
        const line = document.createElementNS(svgNamespace, "line");
        line.setAttribute("x1", x);
        line.setAttribute("y1", 0);
        line.setAttribute("x2", x);
        line.setAttribute("y2", height);
        line.setAttribute("stroke", "rgba(255,255,255,0.05)");
        line.setAttribute("stroke-width", "1");
        svg.appendChild(line);
      }
      
      for (let hour = 0; hour <= 24; hour++) {
        const y = hour * cellHeight;
        const line = document.createElementNS(svgNamespace, "line");
        line.setAttribute("x1", 0);
        line.setAttribute("y1", y);
        line.setAttribute("x2", width);
        line.setAttribute("y2", y);
        line.setAttribute("stroke", "rgba(255,255,255,0.05)");
        line.setAttribute("stroke-width", "1");
        svg.appendChild(line);
      }
      
      // Create SVG content
      const svgContent = new XMLSerializer().serializeToString(svg);
      
      // Create and trigger download
      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = moment().format('YYYY-MM-DD_HH-mm');
      link.download = `temperature_heatmap_${selectedLocations[0] || 'sensor'}_${timestamp}.svg`;
      link.href = url;
      link.click();
      
      // Clean up
      URL.revokeObjectURL(url);
      setShowDownloadOptions(false);
    } catch (error) {
      console.error('Error downloading SVG:', error);
      alert(t('errorDownloadingSVG', 'Error downloading SVG. Please try again.'));
    }
  }, [data, getColorForValue, selectedLocations, t]);

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '500px',
        position: 'relative'
      }}>
        <LoadingIndicator text={`Loading temperature matrix for ${selectedLocations[0] || 'sensor'}...`} />
        <div style={{ marginTop: '15px', fontSize: '14px', color: '#666' }}>
          Processing temperature data...
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
          {t('heatmapDetails.temperatureMatrix', 'Temperature Matrix')} ({selectedLocations[0]}) - {data.length} {t('heatmapDetails.days', 'days')} × 24 {t('heatmapDetails.hours', 'hours')}
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
                  onClick={downloadAsPNG}
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
                  onClick={downloadAsSVG}
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
        {/* Y-axis title */}
        <div style={{ 
          width: '30px',
          writingMode: 'vertical-rl',
          transform: 'rotate(180deg)',
          textAlign: 'center',
          fontSize: '14px',
          fontWeight: 'bold',
          marginRight: '15px',
          color: darkMode ? '#aaa' : '#555'
        }}>
          {t('heatmapDetails.hoursOfDay', 'Hours of Day')}
        </div>
        
        {/* Canvas container */}
        <div 
          ref={containerRef}
          style={{ 
            position: 'relative', 
            width: 'calc(100% - 30px)',
            paddingLeft: '50px',
            paddingRight: '60px',
            paddingBottom: '70px', // Increased padding to make space for axis label
            height: isFullscreen ? '80vh' : '600px' // Adjust height based on fullscreen state
          }}
        >
          <canvas 
            ref={canvasRef} 
            style={{ 
              width: '100%', 
              height: isFullscreen ? '100%' : '600px', // Adjust height based on fullscreen state
              display: 'block',
              border: `1px solid ${darkMode ? '#444' : '#ddd'}`,
              borderRadius: '4px',
              boxShadow: darkMode ? '0 2px 4px rgba(0,0,0,0.3)' : '0 2px 4px rgba(0,0,0,0.1)'
            }}
          />
          
          {/* X-axis title - positioned below the canvas */}
          <div style={{
            textAlign: 'center',
            fontSize: '14px',
            fontWeight: 'bold',
            position: 'absolute',
            bottom: '-30px', // Adjusted to position closer to the heatmap
            left: '50%',
            transform: 'translateX(-50%)',
            width: '100%',
            color: darkMode ? '#aaa' : '#555'
          }}>
            {t('heatmapDetails.calendarDays', 'Calendar Days')}
          </div>
          
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
          
          {/* Render AM/PM labels */}
          {renderAmPmLabels()}
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
          {t('heatmapDetails.temperatureScale', 'Temperature Scale')}:
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
        <span style={{ color: darkMode ? '#e0e0e0' : 'inherit' }}>≤ {localThresholds.min}°C</span>
        <span style={{ color: darkMode ? '#e0e0e0' : 'inherit' }}>{localThresholds.mid}°C</span>
        <span style={{ color: darkMode ? '#e0e0e0' : 'inherit' }}>≥ {localThresholds.high}°C</span>
      </div>
    </div>
  );
};

export default ReavizHeatMap;