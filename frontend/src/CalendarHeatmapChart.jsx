import React, { useState, useEffect } from 'react';
import CalendarHeatmap from "react-calendar-heatmap";
import { Tooltip } from "react-tooltip";
import "react-calendar-heatmap/dist/styles.css";
import { useTranslation } from 'react-i18next';
import { useTheme } from './contexts/ThemeContext';
import "./CalendarHeatmapOverrides.css";

/**
 * Main component that renders either a single heatmap with fixed length
 * (fixedDays, default 365 days) or, if the interval covers multiple years,
 * splits the data into separate heatmaps, one for each year.
 */
function CalendarHeatmapChart({
  data = [],
  startDate,
  endDate,
  thresholds = {
    min: 20,
    mid: 25,
    high: 30,
    colorMin: "#B3E6FF",
    colorMid: "#FFFF99",
    colorHigh: "#FF9999"
  },
  fixedDays = 365,
  heatmapField = 'teplota'
}) {
  const { t } = useTranslation();
  const { darkMode } = useTheme();
  
  // Make sure data is always an array to prevent undefined.filter errors
  const safeData = Array.isArray(data) ? data : [];
  
  // Make sure we have valid dates to prevent NaN in SVG viewBox
  let validStartDate = startDate ? new Date(startDate) : new Date();
  if (isNaN(validStartDate.getTime())) {
    validStartDate = new Date(); // Fallback to current date if invalid
  }
  
  // If endDate is provided and the difference in years is at least one, we split the data by years
  if (endDate && new Date(endDate).getFullYear() > validStartDate.getFullYear()) {
    const startYear = validStartDate.getFullYear();
    const endYear = new Date(endDate).getFullYear();
    const charts = [];
    for (let year = startYear; year <= endYear; year++) {
      const yearStart = new Date(`${year}-01-01`);
      const yearEnd = new Date(`${year}-12-31`);
      charts.push(
        <div key={year} style={{ 
          marginBottom: "2rem", 
          padding: "1rem", 
          borderRadius: "8px",
          backgroundColor: darkMode ? "rgba(26, 32, 44, 0.8)" : "rgba(240, 240, 240, 0.5)"
        }}>
          <h3 style={{ 
            textAlign: "center", 
            marginBottom: "0.5rem",
            color: darkMode ? "#e0e0e0" : "inherit"
          }}>{t('heatmapDetails.year', { year })}</h3>
          <CalendarHeatmapChartSingle
            data={safeData.filter((item) => new Date(item.x).getFullYear() === year)}
            startDate={yearStart}
            endDate={yearEnd}
            thresholds={thresholds}
            fixedDays={isLeapYear(year) ? 366 : 365}
            heatmapField={heatmapField}
          />
        </div>
      );
    }
    return <div>{charts}</div>;
  } else {
    // Single year mode - use fixedDays (default 365 days)
    // Ensure fixedDays is a valid number to prevent NaN in viewBox calculations
    const safeDays = typeof fixedDays === 'number' && !isNaN(fixedDays) && fixedDays > 0 ? fixedDays : 365;
    const alignedStart = new Date(validStartDate);
    const alignedEnd = new Date(alignedStart.getTime() + (safeDays - 1) * 86400000);
    return <CalendarHeatmapChartSingle data={safeData} startDate={alignedStart} endDate={alignedEnd} thresholds={thresholds} fixedDays={safeDays} heatmapField={heatmapField} />;
  }
}

/**
 * Subcomponent that renders a single heatmap according to the given interval.
 * Uses fixedDays to calculate endDate.
 */
function CalendarHeatmapChartSingle({ data = [], startDate, endDate, thresholds, fixedDays, heatmapField = 'teplota' }) {
  const { t } = useTranslation();
  const { darkMode } = useTheme();
  
  // In single year mode, we ignore the original endDate and calculate it from startDate and fixedDays
  let alignedStart = new Date(startDate || new Date());
  if (isNaN(alignedStart.getTime())) {
    alignedStart = new Date(); // Fallback to current date if invalid
  }
  
  // Ensure fixedDays is valid for calculations
  const safeDays = typeof fixedDays === 'number' && !isNaN(fixedDays) && fixedDays > 0 ? fixedDays : 365;
  const alignedEnd = new Date(alignedStart.getTime() + (safeDays - 1) * 86400000);

  // Ensure data is an array before mapping
  const transformedData = Array.isArray(data) ? data.map((item) => {
    if (!item || typeof item !== 'object') return null;
    
    try {
      const d = new Date(item.x);
      if (isNaN(d.getTime())) return null;
      
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return {
        date: `${yyyy}-${mm}-${dd}`,
        count: item.y
      };
    } catch (err) {
      console.error("Error transforming heatmap data item:", err);
      return null;
    }
  }).filter(Boolean) : [];

  // Function that determines the cell color based on the value
  function getFillColor(count) {
    if (count == null || count < 0) {
      return darkMode ? "#2d3748" : "#eee"; // Use appropriate color for missing data based on theme
    }
    
    // Ensure threshold values are defined
    const safeThresholds = thresholds || {
      min: 20,
      mid: 25,
      high: 30,
      colorMin: darkMode ? "#3182CE" : "#B3E6FF", // More saturated blue in dark mode
      colorMid: darkMode ? "#ECC94B" : "#FFFF99", // More saturated yellow in dark mode
      colorHigh: darkMode ? "#E53E3E" : "#FF9999" // More saturated red in dark mode
    };
    
    if (count < safeThresholds.min) {
      return safeThresholds.colorMin;
    } else if (count < safeThresholds.mid) {
      return safeThresholds.colorMid;
    } else {
      return safeThresholds.colorHigh;
    }
  }

  // Get appropriate unit based on heatmapField
  const getValueWithUnit = (value) => {
    if (value === null || value < 0) return t('heatmapDetails.noData');
    
    switch(heatmapField) {
      case 'teplota':
        return `${value.toFixed(1)}°C`;
      case 'vlhkost':
        return `${value.toFixed(1)}%`;
      case 'tlak':
        return `${value.toFixed(1)} hPa`;
      default:
        return `${value.toFixed(1)}`;
    }
  };

  // Explicitly evaluate translation keys for months
  const monthLabels = [
    t('heatmapDetails.months.jan'), 
    t('heatmapDetails.months.feb'), 
    t('heatmapDetails.months.mar'), 
    t('heatmapDetails.months.apr'), 
    t('heatmapDetails.months.may'), 
    t('heatmapDetails.months.jun'), 
    t('heatmapDetails.months.jul'), 
    t('heatmapDetails.months.aug'), 
    t('heatmapDetails.months.sep'), 
    t('heatmapDetails.months.oct'), 
    t('heatmapDetails.months.nov'), 
    t('heatmapDetails.months.dec')
  ];
  
  // Explicitly evaluate translation keys for weekdays
  const weekdayLabels = [
    t('heatmapDetails.weekdays.mon'), 
    t('heatmapDetails.weekdays.tue'), 
    t('heatmapDetails.weekdays.wed'), 
    t('heatmapDetails.weekdays.thu'), 
    t('heatmapDetails.weekdays.fri'), 
    t('heatmapDetails.weekdays.sat'), 
    t('heatmapDetails.weekdays.sun')
  ];

  return (
    <div className={`calendar-heatmap-container ${darkMode ? 'dark' : ''}`} style={{ 
      maxWidth: 1200, 
      margin: "0 auto",
      backgroundColor: darkMode ? "#1a202c" : "transparent",
      padding: darkMode ? "15px" : "0",
      borderRadius: darkMode ? "8px" : "0"
    }}>
      <CalendarHeatmap
        startDate={alignedStart}
        endDate={alignedEnd}
        values={transformedData}
        horizontal={true}
        showWeekdayLabels={true}
        showMonthLabels={true}
        weekdayLabels={weekdayLabels}
        monthLabels={monthLabels}
        tooltipDataAttrs={(value) => {
          if (!value || !value.date) {
            return { 
              "data-tooltip-id": "calendar-tooltip", 
              "data-tooltip-content": t('heatmapDetails.noData')
            };
          }
          
          // Create tooltip content with appropriate unit
          const tooltipText = value.count != null && value.count >= 0
            ? `${value.date}: ${getValueWithUnit(value.count)}`
            : t('heatmapDetails.noData');
            
          return { 
            "data-tooltip-id": "calendar-tooltip", 
            "data-tooltip-content": tooltipText 
          };
        }}
        transformDayElement={(element, value) => {
          const fill = value ? getFillColor(value.count) : (darkMode ? "#2d3748" : "#eee");
          return React.cloneElement(element, {
            style: {
              fill,
              stroke: darkMode ? "#4a5568" : "#fff",
              strokeWidth: darkMode ? 1.5 : 1,
              opacity: value ? 1 : (darkMode ? 0.8 : 0.3) // Make empty cells more visible in dark mode
            },
            width: 15,
            height: 15
          });
        }}
      />
      <Tooltip id="calendar-tooltip" style={{
        backgroundColor: darkMode ? "#1a202c" : "#333",
        color: "#fff",
        border: `1px solid ${darkMode ? "#2d3748" : "#666"}`,
        borderRadius: "4px",
        padding: "8px 12px",
        fontSize: "12px",
        boxShadow: darkMode ? "0 2px 8px rgba(0,0,0,0.5)" : "0 2px 8px rgba(0,0,0,0.2)",
        zIndex: 1000
      }} />
    </div>
  );
}

// Helper function to check for leap years
function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export default CalendarHeatmapChart;
