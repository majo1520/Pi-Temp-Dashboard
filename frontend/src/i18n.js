import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enTranslations from './locales/en.json';
import skTranslations from './locales/sk.json';

// Check if logging is enabled from environment variables
const isLoggingEnabled = () => {
  // If explicitly disabled, return false
  if (import.meta.env.VITE_DISABLE_LOGS === 'true') return false;
  
  // In development, logs are enabled by default unless explicitly disabled
  if (process.env.NODE_ENV === 'development') {
    return import.meta.env.VITE_ENABLE_LOGS !== 'false';
  }
  
  // In production, disable logs by default
  return false;
};

// Legacy translations not yet moved to JSON files
const legacyTranslations = {
  sk: {
    // Header
    lightMode: "Svetlý režim",
    darkMode: "Tmavý režim",
    autoRefreshOn: "Auto-refresh: Zap",
    autoRefreshOff: "Auto-refresh: Vyp",
    
    // Sidebar
    sidebarTitle: "Ovládací Panel",
    chartsAndVisualizations: "Grafy a vizualizácie",
    dataAggregations: "Agregácie dát",
    thresholdSettings: "Nastavenia prahov",
    heatmapSettings: "Kobercový graf",
    
    // Settings categories
    navigation: "Navigácia",
    actions: "Akcie",
    account: "Účet",
    
    // Chart types and fields
    temperature: "🌡️ Teplota",
    humidity: "💧 Vlhkosť",
    pressure: "🧭 Tlak",
    heatmap: "📊 Kobercový graf",
    minValues: "Minimálne hodnoty",
    avgValues: "Priemerné hodnoty",
    maxValues: "Maximálne hodnoty",
    merged: "Zlúčený",
    separate: "Separátne",
    mergedTitle: "Zlúčiť všetky dáta do jedného grafu",
    separateTitle: "Zobraziť každý senzor zvlášť",
    
    // Locations
    locationSelector: "Výber lokácie",
    allLocations: "Všetky lokácie",
    selectLocations: "Vybrať lokácie",
    noLocationsSelected: "Zrušiť výber všetkých",
    selectedLocations: "Vybrané lokácie",
    clearSelection: "Zrušiť výber všetkých lokácií",
    
    // Time ranges
    timeRange: "Časový rozsah",
    live: "LIVE",
    custom: "Vlastný interval",
    customRange: "Vlastný časový rozsah",
    from: "Od",
    to: "Do",
    apply: "Použiť",
    cancelTimeRange: "Zrušiť",
    
    // Buttons
    hide: "Skryť",
    edit: "Upraviť",
    show: "Zobraziť",
    hideThresholds: "Skryť prahy v grafoch",
    showThresholds: "Zobraziť prahy v grafoch",
    showDayLabels: "Zobraziť popisky dní",
    switchToCalendar: "Prepnúť na Calendar Heatmap",
    switchToMatrix: "Prepnúť na Matrix Heatmap",
  },
  en: {
    // Header
    lightMode: "Light Mode",
    darkMode: "Dark Mode",
    autoRefreshOn: "Auto-refresh: On",
    autoRefreshOff: "Auto-refresh: Off",
    
    // Sidebar
    sidebarTitle: "Dashboard Controls",
    chartsAndVisualizations: "Charts & Visualizations",
    dataAggregations: "Data Aggregations",
    thresholdSettings: "Threshold Settings",
    heatmapSettings: "Heatmap Settings",
    
    // Settings categories
    navigation: "Navigation",
    actions: "Actions",
    account: "Account",
    
    // Chart types and fields
    temperature: "🌡️ Temperature",
    humidity: "💧 Humidity",
    pressure: "🧭 Pressure",
    heatmap: "📊 Heatmap",
    minValues: "Minimum Values",
    avgValues: "Average Values",
    maxValues: "Maximum Values",
    merged: "Merged",
    separate: "Separate",
    mergedTitle: "Merge all data into one chart",
    separateTitle: "Show each sensor separately",
    
    // Locations
    locationSelector: "Location Selector",
    allLocations: "All Locations",
    selectLocations: "Select Locations",
    noLocationsSelected: "Clear All Selections",
    selectedLocations: "Selected locations",
    clearSelection: "Clear all location selections",
    
    // Time ranges
    timeRange: "Time Range",
    live: "LIVE",
    custom: "Custom Range",
    customRange: "Custom Time Range",
    from: "From",
    to: "To",
    apply: "Apply",
    cancelTimeRange: "Cancel",
    
    // Buttons
    hide: "Hide",
    edit: "Edit",
    show: "Show",
    hideThresholds: "Hide thresholds in charts",
    showThresholds: "Show thresholds in charts",
    showDayLabels: "Show day labels",
    switchToCalendar: "Switch to Calendar Heatmap",
    switchToMatrix: "Switch to Matrix Heatmap",
  }
};

// Initialize i18next
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: {
          ...enTranslations,
          ...legacyTranslations.en
        }
      },
      sk: {
        translation: {
          ...skTranslations,
          ...legacyTranslations.sk
        }
      }
    },
    fallbackLng: 'sk',
    debug: isLoggingEnabled(),
    
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'language',
      caches: ['localStorage'],
    },
    
    // Silence initialization logs
    log: isLoggingEnabled() ? console : {
      type: '',
      log: () => {},
      warn: () => {},
      error: console.error // still log errors
    }
  });

export default i18n; 