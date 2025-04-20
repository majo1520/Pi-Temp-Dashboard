import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_THRESHOLDS } from '../constants';

/**
 * Custom hook for managing user preferences and persistent settings
 * @returns {Object} User preferences and related functions
 */
function useUserPreferences() {
  // UI Theme preferences
  const [darkMode, setDarkMode] = useState(false);
  
  // Chart display preferences
  const [chartMode, setChartMode] = useState("separate");
  const [visibleGraphs, setVisibleGraphs] = useState({
    teplota: true,
    vlhkost: true,
    tlak: true,
    koberec: false,
  });
  
  // Sensor display preferences
  const [userCardPrefs, setUserCardPrefs] = useState({});
  const [userLocationPrefs, setUserLocationPrefs] = useState({});
  
  // Dashboard settings
  const [rangeKey, setRangeKey] = useState("6h");
  const [selectedLocations, setSelectedLocations] = useState(["IT OFFICE"]);
  
  // Thresholds
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [heatmapThresholds, setHeatmapThresholds] = useState({
    min: 10,
    mid: 20,
    high: 30,
    colorMin: "#B3E6FF",
    colorMid: "#FFFF99",
    colorHigh: "#FF9999",
  });
  
  // Heatmap settings
  const [showHeatmapXLabels, setShowHeatmapXLabels] = useState(true);
  const [heatmapType, setHeatmapType] = useState("matrix");
  const [displayThresholds, setDisplayThresholds] = useState(true);
  
  // Custom date range
  const [tempCustomStart, setTempCustomStart] = useState("");
  const [tempCustomEnd, setTempCustomEnd] = useState("");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [customApplied, setCustomApplied] = useState(false);
  
  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(true);
  
  // Aggregation settings
  const [aggregationOptions, setAggregationOptions] = useState({
    min: false,
    avg: false,
    max: false,
  });

  // Load preferences from localStorage on initial mount
  useEffect(() => {
    // Load dark mode preference
    const savedDarkMode = localStorage.getItem('darkMode');
    if (savedDarkMode) {
      setDarkMode(JSON.parse(savedDarkMode));
    }
    
    // Load dashboard settings
    const savedSettings = localStorage.getItem("dashboardSettings");
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      if (settings.rangeKey) setRangeKey(settings.rangeKey);
      if (settings.selectedLocations) setSelectedLocations(settings.selectedLocations);
      if (settings.chartMode) setChartMode(settings.chartMode);
      if (settings.visibleGraphs) setVisibleGraphs(settings.visibleGraphs);
    }
    
    // Load threshold settings
    const storedThresholds = localStorage.getItem("thresholds");
    if (storedThresholds) setThresholds(JSON.parse(storedThresholds));
    
    const storedHeatmapThresholds = localStorage.getItem("heatmapThresholds");
    if (storedHeatmapThresholds) setHeatmapThresholds(JSON.parse(storedHeatmapThresholds));
    
    // Load aggregation settings
    const storedAggregationOptions = localStorage.getItem("aggregationOptions");
    if (storedAggregationOptions) setAggregationOptions(JSON.parse(storedAggregationOptions));
  }, []);
  
  // Save dashboard settings whenever they change
  useEffect(() => {
    localStorage.setItem(
      "dashboardSettings",
      JSON.stringify({ 
        rangeKey, 
        selectedLocations, 
        chartMode,
        visibleGraphs
      })
    );
  }, [rangeKey, selectedLocations, chartMode, visibleGraphs]);
  
  // Save thresholds whenever they change
  useEffect(() => {
    localStorage.setItem("thresholds", JSON.stringify(thresholds));
  }, [thresholds]);
  
  useEffect(() => {
    localStorage.setItem("heatmapThresholds", JSON.stringify(heatmapThresholds));
  }, [heatmapThresholds]);
  
  // Save dark mode preference
  useEffect(() => {
    localStorage.setItem("darkMode", JSON.stringify(darkMode));
  }, [darkMode]);
  
  // Save aggregation options
  useEffect(() => {
    localStorage.setItem("aggregationOptions", JSON.stringify(aggregationOptions));
  }, [aggregationOptions]);
  
  // Save user card preferences
  useEffect(() => {
    localStorage.setItem("userCardPrefs", JSON.stringify(userCardPrefs));
  }, [userCardPrefs]);
  
  // Save user location preferences
  useEffect(() => {
    localStorage.setItem("userLocationPrefs", JSON.stringify(userLocationPrefs));
  }, [userLocationPrefs]);
  
  // Helper functions
  const toggleDarkMode = useCallback(() => {
    setDarkMode(prev => !prev);
  }, []);
  
  const toggleSensorCard = useCallback((name) => {
    setUserCardPrefs(prev => ({
      ...prev,
      [name]: !(prev[name] ?? true)
    }));
  }, []);
  
  const toggleSensorLocation = useCallback((name) => {
    setUserLocationPrefs(prev => ({
      ...prev,
      [name]: !(prev[name] ?? true)
    }));
  }, []);
  
  const toggleLocation = useCallback((loc) => {
    setSelectedLocations(prev => 
      prev.includes(loc) 
      ? prev.filter(l => l !== loc) 
      : [...prev, loc]
    );
  }, []);
  
  const applyCustomRange = useCallback(() => {
    setCustomStart(tempCustomStart);
    setCustomEnd(tempCustomEnd);
    setCustomApplied(true);
  }, [tempCustomStart, tempCustomEnd]);
  
  const toggleGraph = useCallback((graphKey) => {
    setVisibleGraphs(prev => ({
      ...prev,
      [graphKey]: !prev[graphKey]
    }));
  }, []);
  
  const toggleAggregation = useCallback((type) => {
    setAggregationOptions(prev => ({
      ...prev,
      [type]: !prev[type]
    }));
  }, []);
  
  // Update heatmap type based on range
  useEffect(() => {
    if (rangeKey === "custom") {
      setHeatmapType("calendar");
    } else if (rangeKey === "30d" || rangeKey === "365d") {
      setHeatmapType("calendar");
    } else {
      setHeatmapType("matrix");
    }
  }, [rangeKey, customStart, customEnd]);
  
  // Update auto-refresh when range changes
  useEffect(() => {
    setAutoRefresh(rangeKey === "live");
  }, [rangeKey]);
  
  // Initialize user card prefs with data from sensors
  const initUserCardPrefs = useCallback((sensors) => {
    const savedCards = localStorage.getItem("userCardPrefs");
    if (savedCards) {
      setUserCardPrefs(JSON.parse(savedCards));
    } else {
      // Ak nie je v localStorage, použijeme odporúčané defaulty zo servera
      const defaults = {};
      sensors.forEach(sensor => {
        defaults[sensor.name] = sensor.cardVisible !== false;
      });
      localStorage.setItem("userCardPrefs", JSON.stringify(defaults));
      setUserCardPrefs(defaults);
    }
  }, []);
  
  return {
    // Theme settings
    darkMode,
    toggleDarkMode,
    
    // Chart display
    chartMode,
    setChartMode,
    visibleGraphs,
    toggleGraph,
    
    // User preferences
    userCardPrefs,
    userLocationPrefs,
    toggleSensorCard,
    toggleSensorLocation,
    initUserCardPrefs,
    
    // Dashboard settings
    rangeKey,
    setRangeKey,
    selectedLocations,
    setSelectedLocations,
    toggleLocation,
    
    // Thresholds
    thresholds,
    setThresholds,
    heatmapThresholds,
    setHeatmapThresholds,
    displayThresholds,
    setDisplayThresholds,
    
    // Heatmap settings
    showHeatmapXLabels,
    setShowHeatmapXLabels,
    heatmapType,
    setHeatmapType,
    
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
    setAutoRefresh,
    
    // Aggregation
    aggregationOptions,
    toggleAggregation
  };
}

export default useUserPreferences; 