import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * SensorTimeline component for visualizing sensor uptime/downtime data
 */
const SensorTimeline = ({ 
  online = [], 
  offline = [],
  aggregatedData = { aggregated: [], timeMarkers: [] },
  range = '24h',
  t
}) => {
  const timelineRef = useRef(null);
  const [cursorInfo, setCursorInfo] = useState(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [animationComplete, setAnimationComplete] = useState(false);
  
  // Ensure we have valid data 
  const validOnline = useMemo(() => {
    return Array.isArray(online) && online.length > 0 && 
      online.every(point => point && typeof point.x === 'number');
  }, [online]);
  
  const validOffline = useMemo(() => {
    return Array.isArray(offline) && offline.length > 0 && 
      offline.every(point => point && typeof point.x === 'number');
  }, [offline]);
  
  // Check if we have valid data to display
  const hasData = useMemo(() => validOnline || validOffline, [validOnline, validOffline]);
  
  // Get time range for the data
  const timeRange = useMemo(() => {
    if (!hasData) return { min: 0, max: 0, duration: 0 };
    
    let minTime = Number.MAX_SAFE_INTEGER;
    let maxTime = 0;
    
    if (validOnline) {
      online.forEach(point => {
        if (point.x < minTime) minTime = point.x;
        if (point.x > maxTime) maxTime = point.x;
      });
    }
    
    if (validOffline) {
      offline.forEach(point => {
        if (point.x < minTime) minTime = point.x;
        if (point.x > maxTime) maxTime = point.x;
      });
    }
    
    if (minTime === Number.MAX_SAFE_INTEGER) minTime = Date.now() - 24 * 60 * 60 * 1000;
    if (maxTime === 0) maxTime = Date.now();
    
    return { min: minTime, max: maxTime, duration: maxTime - minTime };
  }, [online, offline, hasData, validOnline, validOffline]);
  
  // Start animation when component mounts
  useEffect(() => {
    setAnimationComplete(false);
    const timer = setTimeout(() => {
      setAnimationComplete(true);
    }, 800); // Animation duration
    return () => clearTimeout(timer);
  }, [online, offline, range]);
  
  // Handle mouse move to show cursor info
  const handleMouseMove = (e) => {
    if (!timelineRef.current || !hasData) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const relativeX = e.clientX - rect.left;
    const percentage = relativeX / rect.width;
    
    setTooltipVisible(true);
    
    const cursorTime = timeRange.min + (timeRange.duration * percentage);
    
    // Find the closest data point
    let closestPointOnline = null;
    let closestPointOffline = null;
    let minDistanceOnline = Number.MAX_VALUE;
    let minDistanceOffline = Number.MAX_VALUE;
    
    // Check online points
    if (validOnline) {
      online.forEach(point => {
        const distance = Math.abs(point.x - cursorTime);
        if (distance < minDistanceOnline) {
          minDistanceOnline = distance;
          closestPointOnline = point;
        }
      });
    }
    
    // Check offline points
    if (validOffline) {
      offline.forEach(point => {
        const distance = Math.abs(point.x - cursorTime);
        if (distance < minDistanceOffline) {
          minDistanceOffline = distance;
          closestPointOffline = point;
        }
      });
    }
    
    // Determine which point is actually closer
    const closestPoint = minDistanceOnline <= minDistanceOffline && closestPointOnline ? 
      { ...closestPointOnline, isOnline: true } : 
      closestPointOffline ? { ...closestPointOffline, isOnline: false } : null;
    
    if (closestPoint) {
      const date = new Date(closestPoint.x);
      
      // Format date differently based on range
      let dateFormat = '';
      try {
        if (range === '24h') {
          dateFormat = date.toLocaleString([], { 
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
          });
        } else if (range === '7d') {
          dateFormat = date.toLocaleString([], { 
            weekday: 'short',
            month: 'short', 
            day: 'numeric',
            hour: '2-digit', 
            minute: '2-digit'
          });
        } else {
          dateFormat = date.toLocaleString([], { 
            month: 'short', 
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit'
          });
        }
      } catch (e) {
        console.error('Error formatting date:', e);
        dateFormat = date.toString();
      }
      
      setCursorInfo({
        time: dateFormat,
        x: relativeX,
        isOnline: closestPoint.isOnline,
        y: closestPoint.y
      });
    } else {
      setCursorInfo(null);
    }
  };

  const handleMouseLeave = () => {
    setTooltipVisible(false);
  };
  
  // Format time markers for display
  const formattedTimeMarkers = useMemo(() => {
    if (!Array.isArray(timeRange) || !timeRange.min || !timeRange.max) {
      // Generate default time markers based on range
      const now = Date.now();
      const markers = [];
      let interval = 60 * 60 * 1000; // 1 hour
      
      if (range === '24h') {
        interval = 2 * 60 * 60 * 1000; // 2 hours
        for (let i = 0; i <= 24; i += 4) {
          markers.push(now - (24 - i) * 60 * 60 * 1000);
        }
      } else if (range === '7d') {
        interval = 24 * 60 * 60 * 1000; // 1 day
        for (let i = 0; i <= 7; i++) {
          markers.push(now - (7 - i) * 24 * 60 * 60 * 1000);
        }
      } else {
        interval = 7 * 24 * 60 * 60 * 1000; // 1 week
        for (let i = 0; i <= 4; i++) {
          markers.push(now - (4 - i) * 7 * 24 * 60 * 60 * 1000);
        }
      }
      
      return markers.map(timestamp => {
        try {
          const date = new Date(timestamp);
          if (range === '24h') {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          } else if (range === '7d') {
            return `${date.toLocaleDateString([], { weekday: 'short' })} ${date.toLocaleTimeString([], { hour: '2-digit' })}`;
          } else {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
          }
        } catch (e) {
          console.error('Error formatting timestamp:', e);
          return '';
        }
      });
    }
    
    const markers = Array.isArray(aggregatedData.timeMarkers) ? aggregatedData.timeMarkers : [];
    
    return markers.map(timestamp => {
      if (!timestamp) return '';
      
      try {
        const date = new Date(timestamp);
        
        // Different format based on range
        if (range === '24h') {
          return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (range === '7d') {
          return `${date.toLocaleDateString([], { weekday: 'short' })} ${date.toLocaleTimeString([], { hour: '2-digit' })}`;
        } else {
          return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
      } catch (e) {
        console.error('Error formatting timestamp:', e);
        return '';
      }
    });
  }, [aggregatedData.timeMarkers, range, timeRange]);
  
  // Calculate estimated uptime percentage
  const uptimePercentage = useMemo(() => {
    if (!validOnline) return 0;
    
    let onlinePoints = 0;
    let totalPoints = 0;
    
    // Count online points (where y=1) vs total points
    online.forEach(point => {
      if (point && point.y === 1) onlinePoints++;
      totalPoints++;
    });
    
    return totalPoints > 0 ? Math.round((onlinePoints / totalPoints) * 100) : 0;
  }, [online, validOnline]);
  
  // If no data, show a friendly message
  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-32 bg-gray-50 rounded p-4 mb-4">
        <p className="text-gray-500">{t ? t('noDataAvailable') : 'No data available'}</p>
      </div>
    );
  }

  // Render the timeline
  return (
    <div className="pb-6">
      {/* Uptime percentage indicator */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-gray-700">{t ? t('uptime') : 'Uptime'}:</div>
          <div className="flex items-center">
            <div className="w-16 h-4 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-green-500 transition-all duration-1000" 
                style={{ width: `${animationComplete ? uptimePercentage : 0}%` }}
              ></div>
            </div>
            <span className="ml-2 text-sm font-medium">{uptimePercentage}%</span>
          </div>
        </div>
        <div className="text-xs text-gray-500">
          {hasData && (
            <>
              <span>{new Date(timeRange.min).toLocaleDateString()}</span>
              <span> - </span>
              <span>{new Date(timeRange.max).toLocaleDateString()}</span>
            </>
          )}
        </div>
      </div>
      
      {/* Timeline visualization */}
      <div 
        className="relative h-16 bg-gray-100 rounded overflow-hidden" 
        ref={timelineRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Online periods (green) */}
        {validOnline && online.map((point, index) => {
          if (index === 0 || !online[index - 1]) return null;
          
          const prevPoint = online[index - 1];
          // Skip if points are not online
          if (prevPoint.y !== 1 || point.y !== 1) return null;
          
          const startPos = ((prevPoint.x - timeRange.min) / timeRange.duration) * 100;
          const endPos = ((point.x - timeRange.min) / timeRange.duration) * 100;
          const width = endPos - startPos;
          
          // Only render if valid and visible
          if (isNaN(startPos) || isNaN(width) || width <= 0 || startPos < 0 || startPos > 100) return null;
          
          return (
            <div 
              key={`online-${index}`}
              className="absolute top-0 h-full bg-green-500"
              style={{
                left: `${startPos}%`,
                width: `${width}%`,
                opacity: animationComplete ? 0.8 : 0,
                transition: 'opacity 0.7s ease-in'
              }}
            />
          );
        })}
        
        {/* Offline periods (red) */}
        {validOffline && offline.map((point, index) => {
          if (index === 0 || !offline[index - 1]) return null;
          
          const prevPoint = offline[index - 1];
          const startPos = ((prevPoint.x - timeRange.min) / timeRange.duration) * 100;
          const endPos = ((point.x - timeRange.min) / timeRange.duration) * 100;
          const width = endPos - startPos;
          
          // Only render if valid and visible
          if (isNaN(startPos) || isNaN(width) || width <= 0 || startPos < 0 || startPos > 100) return null;
          
          return (
            <div 
              key={`offline-${index}`}
              className="absolute top-0 h-full bg-red-500"
              style={{
                left: `${startPos}%`,
                width: `${width}%`,
                opacity: animationComplete ? 0.8 : 0,
                transition: 'opacity 0.7s ease-in'
              }}
            />
          );
        })}
        
        {/* Time markers (x-axis) */}
        <div className="absolute bottom-0 left-0 w-full flex justify-between px-1 text-xs text-gray-500">
          {formattedTimeMarkers.map((marker, index) => (
            <div key={`marker-${index}`} className="whitespace-nowrap">{marker}</div>
          ))}
        </div>
        
        {/* Tooltip */}
        {cursorInfo && tooltipVisible && (
          <div 
            className="absolute top-0 transform -translate-x-1/2 bg-white/90 shadow border border-gray-200 rounded-md px-2 py-1 text-xs z-10"
            style={{ left: cursorInfo.x }}
          >
            <div className={`font-medium ${cursorInfo.isOnline ? 'text-green-600' : 'text-red-600'}`}>
              {cursorInfo.isOnline ? (t ? t('online') : 'Online') : (t ? t('offline') : 'Offline')}
            </div>
            <div>{cursorInfo.time}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SensorTimeline; 