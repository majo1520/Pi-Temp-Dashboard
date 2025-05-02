import { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { useChart } from './ChartContext';
import { RANGES } from '../constants/index.js';
import * as apiService from '../services/api';

const FilterContext = createContext();

export function FilterProvider({ children }) {
  // Dashboard settings
  const [rangeKey, setRangeKey] = useState("6h");
  const [selectedLocations, setSelectedLocations] = useState(["IT OFFICE"]);
  const [defaultCardLocations, setDefaultCardLocations] = useState([]);
  
  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(true);
  
  // Custom date range
  const [tempCustomStart, setTempCustomStart] = useState("");
  const [tempCustomEnd, setTempCustomEnd] = useState("");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [customApplied, setCustomApplied] = useState(false);
  
  // Get the chart context to access visibleGraphs, toggleGraph, and heatmap settings
  const chartContext = useChart();
  // Create a ref to store the chart context to prevent dependency cycles
  const chartContextRef = useRef();
  
  // Update the ref whenever chart context changes
  useEffect(() => {
    chartContextRef.current = {
      visibleGraphs: chartContext.visibleGraphs,
      toggleGraph: chartContext.toggleGraph,
      setHeatmapType: chartContext.setHeatmapType,
      updateHeatmapType: chartContext.updateHeatmapType,
      preferMatrixHeatmap: chartContext.preferMatrixHeatmap
    };
  }, [chartContext.visibleGraphs, chartContext.toggleGraph, chartContext.setHeatmapType, 
      chartContext.updateHeatmapType, chartContext.preferMatrixHeatmap]);
  
  // Fetch default cards from API
  useEffect(() => {
    const fetchDefaultCards = async () => {
      try {
        const sensors = await apiService.getSensors();
        const defaultCards = sensors.filter(sensor => sensor.defaultCard).map(sensor => sensor.name);
        setDefaultCardLocations(defaultCards);
        
        // If no locations are selected yet, use default cards
        if (selectedLocations.length === 0 && defaultCards.length > 0) {
          setSelectedLocations(defaultCards);
        }
      } catch (error) {
        console.error("Error fetching default cards:", error);
      }
    };
    
    fetchDefaultCards();
  }, []);
  
  // Load preferences from localStorage on initial mount
  useEffect(() => {
    const savedPreferences = localStorage.getItem('dashboardPreferences');
    if (savedPreferences) {
      try {
        const preferences = JSON.parse(savedPreferences);
        if (preferences.rangeKey) setRangeKey(preferences.rangeKey);
        if (preferences.selectedLocations && preferences.selectedLocations.length > 0) {
          setSelectedLocations(preferences.selectedLocations);
        }
        if (preferences.autoRefresh !== undefined) setAutoRefresh(preferences.autoRefresh);
        if (preferences.defaultLocations) {
          setDefaultCardLocations(preferences.defaultLocations);
        }
      } catch (err) {
        console.error('Error parsing saved preferences', err);
      }
    }
  }, []);
  
  // Save dashboard settings whenever they change
  useEffect(() => {
    try {
      const preferences = {
        rangeKey,
        selectedLocations,
        autoRefresh,
        defaultLocations: defaultCardLocations
      };
      localStorage.setItem('dashboardPreferences', JSON.stringify(preferences));
    } catch (err) {
      console.error('Error saving preferences', err);
    }
  }, [rangeKey, selectedLocations, autoRefresh, defaultCardLocations]);
  
  // Update auto-refresh when range changes
  useEffect(() => {
    setAutoRefresh(rangeKey === "live");
  }, [rangeKey]);
  
  // Auto-adjust auto-refresh when range changes
  useEffect(() => {
    // If range is set to certain values, auto-refresh should be automatic
    if (
      rangeKey === "live" ||
      rangeKey === "5m" ||
      rangeKey === "15m" ||
      rangeKey === "1h"
    ) {
      setAutoRefresh(true);
    }
  }, [rangeKey]);
  
  // Auto-adjust heatmap type based on selected range when kobercovy graph is active
  useEffect(() => {
    if (chartContextRef.current?.visibleGraphs?.koberec) {
      // Access the current value of preferMatrixHeatmap
      const userPrefersMatrix = chartContextRef.current.preferMatrixHeatmap;
      
      // For longer time ranges (30d and above), check user preference
      if (rangeKey === "30d" || rangeKey === "90d" || rangeKey === "180d" || rangeKey === "365d" || 
          (rangeKey === "custom" && customApplied)) {
        // If user doesn't prefer matrix, use calendar for these ranges
        if (!userPrefersMatrix) {
          chartContextRef.current.updateHeatmapType("calendar");
        } else {
          // If they prefer matrix, ensure we use matrix
          chartContextRef.current.updateHeatmapType("matrix");
        }
      } else {
        // For shorter time ranges, always use matrix heat map
        chartContextRef.current.updateHeatmapType("matrix");
      }
    }
  }, [rangeKey, customStart, customEnd, customApplied]);
  
  // Clear custom range applied flag when range changes
  useEffect(() => {
    if (rangeKey !== "custom" && customApplied) {
      setCustomApplied(false);
    }
  }, [rangeKey, customApplied]);
  
  // Function to toggle location selection
  const toggleLocation = useCallback((loc) => {
    setSelectedLocations(prev => 
      prev.includes(loc) 
        ? prev.filter(l => l !== loc) 
        : [...prev, loc]
    );
  }, []);
  
  // Function to set current selected locations as default cards
  const setSelectedLocationsAsDefault = useCallback(async () => {
    try {
      // Update localStorage
      const preferences = {
        rangeKey,
        selectedLocations,
        autoRefresh,
        defaultLocations: selectedLocations
      };
      localStorage.setItem('dashboardPreferences', JSON.stringify(preferences));
      setDefaultCardLocations(selectedLocations);
      
      // Update sensors via API
      const sensors = await apiService.getSensors();
      
      // Update each sensor's defaultCard property based on whether it's in the selected locations
      for (const sensor of sensors) {
        const isDefault = selectedLocations.includes(sensor.name);
        if (sensor.defaultCard !== isDefault) {
          await apiService.updateSensorVisibility(sensor.name, {
            defaultCard: isDefault
          });
        }
      }
      
      console.log('Default cards updated successfully');
    } catch (error) {
      console.error('Error setting default cards:', error);
    }
  }, [selectedLocations]);
  
  // Function to apply custom date range
  const applyCustomRange = useCallback(() => {
    setCustomStart(tempCustomStart);
    setCustomEnd(tempCustomEnd);
    setCustomApplied(true);
  }, [tempCustomStart, tempCustomEnd]);
  
  // Handle range selection with kobercový graph logic
  const handleRangeSelection = useCallback((range) => {
    // Using the ref version to break dependency cycle
    if (chartContextRef.current) {
      // If selecting live range and kobercový graf is on, turn it off
      if (range === 'live' && chartContextRef.current.visibleGraphs.koberec) {
        chartContextRef.current.toggleGraph('koberec');
      }
    }
    
    setRangeKey(range);
    if (range === "custom") setCustomApplied(false);
  }, []); // No dependencies needed as we use ref
  
  const value = {
    // Range settings
    rangeKey,
    setRangeKey,
    handleRangeSelection,
    
    // Location settings
    selectedLocations,
    setSelectedLocations,
    toggleLocation,
    setSelectedLocationsAsDefault,
    defaultCardLocations,
    
    // Custom range
    tempCustomStart,
    setTempCustomStart,
    tempCustomEnd,
    setTempCustomEnd,
    customStart,
    customEnd,
    customApplied,
    applyCustomRange,
    
    // Auto-refresh
    autoRefresh,
    setAutoRefresh
  };
  
  return (
    <FilterContext.Provider value={value}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilter() {
  const context = useContext(FilterContext);
  if (context === undefined) {
    throw new Error('useFilter must be used within a FilterProvider');
  }
  return context;
}