import { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { DEFAULT_THRESHOLDS } from '../constants';
import * as api from '../services/api';
import logger from '../utils/logger';

const ChartContext = createContext();

export function ChartProvider({ children }) {
  // Chart display preferences
  const [chartMode, setChartMode] = useState("separate");
  const [visibleGraphs, setVisibleGraphs] = useState({
    teplota: true,
    vlhkost: true,
    tlak: true,
    koberec: false,
  });
  
  // Thresholds - initialize with null for better loading logic
  const [thresholds, setThresholds] = useState(null);
  const [heatmapThresholds, setHeatmapThresholds] = useState(null);
  const [displayThresholds, setDisplayThresholds] = useState(true);
  
  // Heatmap settings
  const [showHeatmapXLabels, setShowHeatmapXLabels] = useState(true);
  const [heatmapType, setHeatmapType] = useState("matrix");
  const [preferMatrixHeatmap, setPreferMatrixHeatmap] = useState(true);
  const [heatmapField, setHeatmapField] = useState("teplota"); // Default to temperature
  
  // Custom setHeatmapType function that also updates preferMatrixHeatmap
  const updateHeatmapType = useCallback((type) => {
    setHeatmapType(type);
    if (type === "matrix" || type === "calendar") {
      const isMatrix = type === "matrix";
      setPreferMatrixHeatmap(isMatrix);
      // Save preference to localStorage
      try {
        localStorage.setItem("preferMatrixHeatmap", JSON.stringify(isMatrix));
        
        // Also update dashboard settings
        localStorage.setItem(
          "dashboardSettings",
          JSON.stringify({ 
            chartMode,
            visibleGraphs,
            displayThresholds,
            preferMatrixHeatmap: isMatrix
          })
        );
      } catch (error) {
        logger.error("Error saving heatmap preference:", error);
      }
    }
  }, [chartMode, visibleGraphs, displayThresholds]);
  
  // Aggregation settings
  const [aggregationOptions, setAggregationOptions] = useState({
    min: false,
    avg: false,
    max: false,
  });
  
  // Card styling options
  const [cardStyling, setCardStyling] = useState({
    backgroundColor: "#FFFFFF",
    opacity: 100,
    borderColor: "#E5E7EB"
  });
  
  // Location colors for charts and cards
  const [locationColors, setLocationColors] = useState({
    "IT OFFICE": "#3498db",
    "MARKETING": "#9b59b6",
    "IT SERVER ROOM": "#f39c12",
    "default": "#cccccc"
  });
  
  // UI state for settings panels
  const [showHeatmapSettings, setShowHeatmapSettings] = useState(false);
  const [showTempThresholds, setShowTempThresholds] = useState(false);
  const [showHumidityThresholds, setShowHumidityThresholds] = useState(false);
  const [showPressureThresholds, setShowPressureThresholds] = useState(false);
  const [showCardStylingSettings, setShowCardStylingSettings] = useState(false);
  const [showKobercovyConfirmation, setShowKobercovyConfirmation] = useState(false);
  
  // Function to ensure colors are in 6-digit hex format
  const ensureFullHexFormat = (color) => {
    if (!color || typeof color !== 'string') return "#cccccc";
    
    // If it's already a 6-digit hex, return it
    if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return color;
    }
    
    // If it's a 3-digit hex, convert to 6-digit
    if (/^#[0-9A-Fa-f]{3}$/.test(color)) {
      return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
    }
    
    // Default fallback if invalid format
    return "#cccccc";
  };
  
  // Apply default thresholds if needed
  useEffect(() => {
    // Apply defaults if thresholds are still null after the settings load
    if (thresholds === null) {
      logger.log("Applying default thresholds");
      setThresholds(DEFAULT_THRESHOLDS);
    }
    
    // Apply default heatmap thresholds if still null
    if (heatmapThresholds === null) {
      logger.log("Applying default heatmap thresholds");
      setHeatmapThresholds({
        min: 10,
        mid: 20,
        high: 30,
        colorMin: "#B3E6FF",
        colorMid: "#FFFF99",
        colorHigh: "#FF9999",
      });
    }
  }, [thresholds, heatmapThresholds]);
  
  // Load settings from localStorage on initial mount
  useEffect(() => {
    // Flag to track if we've loaded settings from any source
    let settingsLoaded = false;
    
    // Load dashboard settings
    const savedSettings = localStorage.getItem("dashboardSettings");
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings);
        if (settings.chartMode) setChartMode(settings.chartMode);
        if (settings.visibleGraphs) setVisibleGraphs(settings.visibleGraphs);
        if (settings.displayThresholds !== undefined) setDisplayThresholds(settings.displayThresholds);
        if (settings.preferMatrixHeatmap !== undefined) setPreferMatrixHeatmap(settings.preferMatrixHeatmap);
      } catch (error) {
        logger.error("Error loading dashboard settings:", error);
      }
    }
    
    // Create a global check for if user is logged in
    const checkLoginStatus = async () => {
      try {
        const sessionResponse = await api.checkSession();
        logger.log("Login status check:", sessionResponse);
        return sessionResponse.loggedIn;
      } catch (error) {
        logger.error("Error checking login status:", error);
        return false;
      }
    };
    
    // Main function to load all user settings and apply them
    const loadAllSettings = async () => {
      const isLoggedIn = await checkLoginStatus();
      logger.log("User is logged in:", isLoggedIn);
      
      if (isLoggedIn) {
        // If user is logged in, try to load all settings at once from server
        try {
          const allSettings = await api.getUserSettings();
          logger.log("All user settings from server:", allSettings);
          
          if (allSettings) {
            // Apply each setting if it exists
            if (allSettings.thresholds) {
              logger.log("Applying thresholds from server:", allSettings.thresholds);
              setThresholds(allSettings.thresholds);
              settingsLoaded = true;
            }
            
            if (allSettings.heatmapThresholds) {
              logger.log("Applying heatmap thresholds from server:", allSettings.heatmapThresholds);
              setHeatmapThresholds(allSettings.heatmapThresholds);
            }
            
            if (allSettings.cardStyling) {
              logger.log("Applying card styling from server:", allSettings.cardStyling);
              setCardStyling(allSettings.cardStyling);
            }
            
            if (allSettings.locationColors) {
              logger.log("Applying location colors from server:", allSettings.locationColors);
              setLocationColors(allSettings.locationColors);
            }
            
            // Don't fall back to localStorage as the server is the source of truth
            return;
          }
        } catch (error) {
          logger.error("Error loading all settings from server:", error);
        }
      }
      
      // If user is not logged in or server request failed, load from localStorage
      logger.log("Loading settings from localStorage as fallback");
      loadFromLocalStorage();
    };
    
    const loadFromLocalStorage = () => {
      // Load thresholds from localStorage
      const storedThresholds = localStorage.getItem("thresholds");
      if (storedThresholds) {
        try {
          setThresholds(JSON.parse(storedThresholds));
        } catch (error) {
          logger.error("Error loading thresholds from localStorage:", error);
        }
      }
      
      // Load heatmap thresholds from localStorage
      const storedHeatmapThresholds = localStorage.getItem("heatmapThresholds");
      if (storedHeatmapThresholds) {
        try {
          setHeatmapThresholds(JSON.parse(storedHeatmapThresholds));
        } catch (error) {
          logger.error("Error loading heatmap thresholds from localStorage:", error);
        }
      }
      
      // Load card styling from localStorage
      const storedCardStyling = localStorage.getItem("cardStyling");
      if (storedCardStyling) {
        try {
          setCardStyling(JSON.parse(storedCardStyling));
        } catch (error) {
          logger.error("Error loading card styling settings from localStorage:", error);
        }
      }
      
      // Load location colors from localStorage
      const storedLocationColors = localStorage.getItem("locationColors");
      if (storedLocationColors) {
        try {
          const parsedColors = JSON.parse(storedLocationColors);
          
          // Ensure all colors are in 6-digit hex format
          const formattedColors = Object.entries(parsedColors).reduce((acc, [key, value]) => {
            acc[key] = ensureFullHexFormat(value);
            return acc;
          }, {});
          
          setLocationColors(formattedColors);
        } catch (error) {
          logger.error("Error loading location colors from localStorage:", error);
        }
      }
    };
    
    // Execute the main function to load all settings
    loadAllSettings();
    
    // Load aggregation settings
    const storedAggregationOptions = localStorage.getItem("aggregationOptions");
    if (storedAggregationOptions) {
      try {
        setAggregationOptions(JSON.parse(storedAggregationOptions));
      } catch (error) {
        logger.error("Error loading aggregation options:", error);
      }
    }
  }, []);
  
  // Save settings whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(
        "dashboardSettings",
        JSON.stringify({ 
          chartMode,
          visibleGraphs,
          displayThresholds,
          preferMatrixHeatmap
        })
      );
    } catch (error) {
      logger.error("Error saving dashboard settings:", error);
    }
  }, [chartMode, visibleGraphs, displayThresholds, preferMatrixHeatmap]);
  
  // Save thresholds whenever they change
  useEffect(() => {
    // Skip if thresholds are null (initial state)
    if (!thresholds) return;
    
    try {
      // Always save to localStorage for offline use
      localStorage.setItem("thresholds", JSON.stringify(thresholds));
      
      // Also save to server if user is logged in
      api.checkSession().then(sessionData => {
        if (sessionData.loggedIn) {
          logger.log('User is logged in, saving thresholds to server');
          api.updateUserSetting('thresholds', thresholds)
            .then(result => {
              if (result) {
                logger.log('Thresholds saved to server:', result);
              }
            })
            .catch(error => {
              logger.error('Error saving thresholds to server:', error);
            });
        }
      }).catch(err => {
        logger.warn('Error checking session for threshold save:', err);
      });
    } catch (error) {
      logger.error("Error saving thresholds:", error);
    }
  }, [thresholds]);
  
  useEffect(() => {
    // Skip if heatmapThresholds are null (initial state)
    if (!heatmapThresholds) return;
    
    try {
      // Always save to localStorage for offline use
      localStorage.setItem("heatmapThresholds", JSON.stringify(heatmapThresholds));
      
      // Also save to server if user is logged in
      api.checkSession().then(sessionData => {
        if (sessionData.loggedIn) {
          logger.log('User is logged in, saving heatmap thresholds to server');
          api.updateUserSetting('heatmapThresholds', heatmapThresholds)
            .then(result => {
              if (result) {
                logger.log('Heatmap thresholds saved to server:', result);
              }
            })
            .catch(error => {
              logger.error('Error saving heatmap thresholds to server:', error);
            });
        }
      }).catch(err => {
        logger.warn('Error checking session for heatmap threshold save:', err);
      });
    } catch (error) {
      logger.error("Error saving heatmap thresholds:", error);
    }
  }, [heatmapThresholds]);
  
  useEffect(() => {
    try {
      localStorage.setItem("aggregationOptions", JSON.stringify(aggregationOptions));
    } catch (error) {
      logger.error("Error saving aggregation options:", error);
    }
  }, [aggregationOptions]);
  
  // Save card styling settings
  useEffect(() => {
    try {
      // Always save to localStorage for offline use
      localStorage.setItem("cardStyling", JSON.stringify(cardStyling));
      
      // Also save to server if user is logged in
      api.updateUserSetting('cardStyling', cardStyling)
        .then(result => {
          if (result) {
            logger.log('Card styling saved to server:', result);
          }
        })
        .catch(error => {
          logger.error('Error saving card styling to server:', error);
        });
    } catch (error) {
      logger.error("Error saving card styling settings:", error);
    }
  }, [cardStyling]);
  
  // We no longer need this effect as updateLocationColor handles saving
  // This would cause conflicts with server data on page reload
  // Save location colors only to localStorage for fallback
  useEffect(() => {
    try {
      localStorage.setItem("locationColors", JSON.stringify(locationColors));
    } catch (error) {
      logger.error("Error saving location colors to localStorage:", error);
    }
  }, [locationColors]);
  
  // Function to toggle a graph visibility - optimized for performance
  const toggleGraph = useCallback((graphKey) => {
    setVisibleGraphs(prev => {
      // Only update if the value is actually changing
      if (prev[graphKey] === undefined) return prev;
      const newState = { ...prev, [graphKey]: !prev[graphKey] };
      // Immediately save to localStorage to prevent loss on refresh
      try {
        localStorage.setItem(
          "dashboardSettings",
          JSON.stringify({ 
            chartMode,
            visibleGraphs: newState,
            displayThresholds,
            preferMatrixHeatmap
          })
        );
      } catch (error) {
        logger.error("Error saving graph toggle:", error);
      }
      return newState;
    });
  }, [chartMode, displayThresholds, preferMatrixHeatmap]);
  
  // Function to toggle aggregation options - optimized for performance
  const toggleAggregation = useCallback((type) => {
    setAggregationOptions(prev => {
      // Only update if the value is actually changing
      if (prev[type] === undefined) return prev;
      const newState = { ...prev, [type]: !prev[type] };
      // Immediately save to localStorage to prevent loss on refresh
      try {
        localStorage.setItem("aggregationOptions", JSON.stringify(newState));
      } catch (error) {
        logger.error("Error saving aggregation toggle:", error);
      }
      return newState;
    });
  }, []);
  
  // Function to toggle threshold display - optimized for performance
  const toggleDisplayThresholds = useCallback(() => {
    setDisplayThresholds(prev => {
      const newValue = !prev;
      // Immediately save to localStorage to prevent loss on refresh
      try {
        localStorage.setItem(
          "dashboardSettings",
          JSON.stringify({ 
            chartMode,
            visibleGraphs,
            displayThresholds: newValue,
            preferMatrixHeatmap
          })
        );
      } catch (error) {
        logger.error("Error saving threshold display toggle:", error);
      }
      return newValue;
    });
  }, [chartMode, visibleGraphs, preferMatrixHeatmap]);
  
  // Update card styling settings
  const updateCardStyling = useCallback((newStyling) => {
    setCardStyling(prevStyling => {
      const updatedStyling = { ...prevStyling, ...newStyling };
      
      // Immediately save to localStorage
      try {
        localStorage.setItem("cardStyling", JSON.stringify(updatedStyling));
        
        // Also save to server
        api.updateUserSetting('cardStyling', updatedStyling)
          .then(result => {
            if (result) {
              logger.log('Card styling updated and saved to server');
            }
          })
          .catch(error => {
            logger.error('Error saving card styling to server:', error);
          });
      } catch (error) {
        logger.error("Error saving card styling:", error);
      }
      
      return updatedStyling;
    });
  }, []);
  
  // Update location color
  const updateLocationColor = useCallback((location, color) => {
    // Ensure the color is in 6-digit hex format
    const formattedColor = ensureFullHexFormat(color);
    
    setLocationColors(prevColors => {
      const updatedColors = { ...prevColors, [location]: formattedColor };
      
      // Immediately save to localStorage
      try {
        localStorage.setItem("locationColors", JSON.stringify(updatedColors));
        
        // Save to location-colors API for backwards compatibility
        fetch('/api/location-colors', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(updatedColors),
        })
        .then(response => {
          if (!response.ok) {
            if (response.status === 401) {
              logger.warn("Authentication required to save colors. Please log in.");
              // We'll keep the colors in localStorage for now
              return null;
            }
            logger.error(`Server returned ${response.status}: ${response.statusText}`);
            throw new Error('Failed to save colors to server');
          }
          return response.json();
        })
        .then(result => {
          if (result) {
            logger.log(`Color for '${location}' updated to ${formattedColor} and saved to server`);
            
            // Also save to user settings API for persistence across devices
            api.updateUserSetting('locationColors', updatedColors)
              .then(settingResult => {
                if (settingResult) {
                  logger.log("Location colors saved to user settings:", settingResult);
                }
              })
              .catch(error => {
                logger.error("Error saving location colors to user settings:", error);
              });
          }
        })
        .catch(error => {
          logger.error(`Error saving color for '${location}':`, error);
        });
      } catch (error) {
        logger.error("Error saving location colors:", error);
      }
      
      return updatedColors;
    });
  }, []);
  
  // Handle koberec graph toggle with confirmation
  const handleKobercovyToggle = useCallback(() => {
    if (!visibleGraphs.koberec) {
      // If turning on koberec, show confirmation popup
      setShowKobercovyConfirmation(true);
    } else {
      // If turning off, just toggle normally
      toggleGraph('koberec');
    }
  }, [visibleGraphs.koberec, toggleGraph]);

  // Function to handle other graph toggles
  const handleOtherGraphToggle = useCallback((key) => {
    // If kobercový graf is active and user is enabling another graph, turn off kobercový graf
    if (visibleGraphs.koberec && !visibleGraphs[key]) {
      toggleGraph('koberec');
    }
    toggleGraph(key);
  }, [visibleGraphs, toggleGraph]);
  
  // Function to confirm koberec selection and apply changes
  const confirmKobercovySelection = useCallback((setSelectedLocations, setRangeKey) => {
    // Turn on koberec
    const updatedVisibleGraphs = {
      teplota: false,
      vlhkost: false,
      tlak: false,
      koberec: true
    };
    
    // Update visibleGraphs state with all fields at once
    setVisibleGraphs(updatedVisibleGraphs);
    
    // Force separate chart mode when using kobercovy graf
    setChartMode("separate");
    
    // Disable live mode if it's active (live mode doesn't work well with heatmap)
    if (setRangeKey) {
      setRangeKey(prevRange => prevRange === "live" ? "24h" : prevRange);
    }
    
    // Default to matrix heatmap type
    updateHeatmapType("matrix");
    
    // Clear selected locations
    if (setSelectedLocations) {
      setSelectedLocations([]);
    }
    setShowKobercovyConfirmation(false);
  }, [displayThresholds, updateHeatmapType]);
  
  // Provide all values and functions to consumers
  const value = {
    // Chart display
    chartMode,
    setChartMode,
    visibleGraphs,
    setVisibleGraphs,
    
    // Thresholds
    thresholds,
    setThresholds,
    heatmapThresholds,
    setHeatmapThresholds,
    displayThresholds,
    toggleDisplayThresholds,
    
    // Heatmap settings
    heatmapType,
    setHeatmapType,
    updateHeatmapType,
    heatmapField,
    setHeatmapField,
    preferMatrixHeatmap,
    setPreferMatrixHeatmap,
    
    // Aggregation
    aggregationOptions,
    toggleAggregation,
    
    // Card styling
    cardStyling,
    setCardStyling,
    
    // Location colors
    locationColors,
    setLocationColors,
    
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
    showKobercovyConfirmation,
    setShowKobercovyConfirmation,
    
    // Helper functions
    handleKobercovyToggle,
    handleOtherGraphToggle,
    confirmKobercovySelection,
    updateLocationColor
  };
  
  return (
    <ChartContext.Provider value={value}>
      {children}
    </ChartContext.Provider>
  );
}

export function useChart() {
  const context = useContext(ChartContext);
  if (context === undefined) {
    throw new Error('useChart must be used within a ChartProvider');
  }
  return context;
}