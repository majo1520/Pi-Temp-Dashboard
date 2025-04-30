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

// Add cache-busting for translations
// This helps ensure that any newly added translations are picked up
const clearTranslationCache = () => {
  try {
    // Clear i18next cache in localStorage
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('i18next_res_')) {
        localStorage.removeItem(key);
      }
    });
    
    // Log cache clearing (if logging is enabled)
    if (isLoggingEnabled()) {
      console.log('Translation cache cleared');
    }
  } catch (e) {
    console.error('Error clearing translation cache:', e);
  }
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
    temperature: "Teplota",
    humidity: "Vlhkosť",
    pressure: "Tlak",
    heatmap: "Kobercový graf",
    minValues: "Minimálne hodnoty",
    avgValues: "Priemerné hodnoty",
    maxValues: "Maximálne hodnoty",
    merged: "Zlúčený",
    separate: "Separátne",
    mergedTitle: "Zlúčiť všetky dáta do jedného grafu",
    separateTitle: "Zobraziť každý senzor zvlášť",
    
    // Scales for different measurement types
    temperatureScale: "Teplotná stupnica",
    humidityScale: "Stupnica vlhkosti",
    pressureScale: "Stupnica tlaku",
    
    // Heatmap specific translations
    heatmapStyle: "Štýl grafu",
    matrix: "Matica",
    calendar: "Kalendár",
    day: "Deň",
    noData: "Žiadne údaje",
    
    // Calendar heatmap translations
    heatmapDetails: {
      temperatureMatrix: "Teplotná matica",
      year: "Rok {{year}}",
      tooltip: "{{date}}: {{temp}}°C",
      noData: "Žiadne údaje",
      loading: "Načítavam údaje pre rok {{year}}",
      loadingData: "Načítavam údaje pre rok {{year}}",
      months: {
        jan: "Jan",
        feb: "Feb",
        mar: "Mar",
        apr: "Apr",
        may: "Máj",
        jun: "Jún",
        jul: "Júl",
        aug: "Aug",
        sep: "Sep",
        oct: "Okt",
        nov: "Nov",
        dec: "Dec"
      },
      weekdays: {
        mon: "Po",
        tue: "Ut",
        wed: "St",
        thu: "Št",
        fri: "Pi",
        sat: "So",
        sun: "Ne"
      },
      hourFormat: "{{hour}}:00",
      hourFormatAMPM: "{{hour}} {{ampm}}",
      AM: "AM",
      PM: "PM",
      days: "dní",
      hours: "hodiny",
      hoursOfDay: "Hodiny dňa",
      calendarDays: "Kalendárne dni",
      temperatureScale: "Teplotná škála"
    },
    
    // Threshold descriptions
    thresholdMin: "Minimálny prah",
    thresholdMid: "Stredný prah",
    thresholdHigh: "Vysoký prah",
    colorMin: "Farba nízkeho prahu",
    colorMid: "Farba stredného prahu",
    colorHigh: "Farba vysokého prahu",
    
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
    temperature: "Temperature",
    humidity: "Humidity",
    pressure: "Pressure",
    heatmap: "Heatmap",
    minValues: "Minimum Values",
    avgValues: "Average Values",
    maxValues: "Maximum Values",
    merged: "Merged",
    separate: "Separate",
    mergedTitle: "Merge all data into one chart",
    separateTitle: "Show each sensor separately",
    
    // Scales for different measurement types
    temperatureScale: "Temperature Scale",
    humidityScale: "Humidity Scale",
    pressureScale: "Pressure Scale",
    
    // Heatmap specific translations
    heatmapStyle: "Heatmap Style",
    matrix: "Matrix",
    calendar: "Calendar",
    day: "Day",
    noData: "No Data",
    
    // Calendar heatmap translations
    heatmapDetails: {
      temperatureMatrix: "Temperature Matrix",
      year: "Year {{year}}",
      tooltip: "{{date}}: {{temp}}°C",
      noData: "No data available",
      loading: "Loading data for year {{year}}",
      loadingData: "Loading data for year {{year}}",
      months: {
        jan: "Jan",
        feb: "Feb",
        mar: "Mar",
        apr: "Apr",
        may: "May",
        jun: "Jun",
        jul: "Jul",
        aug: "Aug",
        sep: "Sep",
        oct: "Oct",
        nov: "Nov",
        dec: "Dec"
      },
      weekdays: {
        mon: "Mon",
        tue: "Tue",
        wed: "Wed",
        thu: "Thu",
        fri: "Fri",
        sat: "Sat",
        sun: "Sun"
      },
      hourFormat: "{{hour}}:00",
      hourFormatAMPM: "{{hour}} {{ampm}}",
      AM: "AM",
      PM: "PM",
      days: "days",
      hours: "hours",
      hoursOfDay: "Hours of Day",
      calendarDays: "Calendar Days",
      temperatureScale: "Temperature Scale"
    },
    
    // Threshold descriptions
    thresholdMin: "Minimum threshold",
    thresholdMid: "Middle threshold",
    thresholdHigh: "High threshold",
    colorMin: "Low threshold color",
    colorMid: "Middle threshold color",
    colorHigh: "High threshold color",
    
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

// Preprocess the JSON format to ensure valid objects
const processTranslations = (translations) => {
  if (typeof translations === 'string') {
    try {
      return JSON.parse(translations);
    } catch (e) {
      console.error('Failed to parse translation JSON:', e);
      return {};
    }
  }
  return translations;
};

// Process the translation files
const processedEnTranslations = processTranslations(enTranslations);
const processedSkTranslations = processTranslations(skTranslations);

// Clear the translation cache before initialization
clearTranslationCache();

// Initialize i18next
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: {
          ...processedEnTranslations,
          ...legacyTranslations.en,
          // Add missing translations for error messages
          dataNotAvailable: "No data available. Please select a location and time range.",
          trySelectingAnother: "Try selecting another location or time range",
          refreshPage: "Refresh Page"
        }
      },
      sk: {
        translation: {
          ...processedSkTranslations,
          ...legacyTranslations.sk,
          // Add missing translations for error messages
          dataNotAvailable: "Žiadne dostupné údaje. Vyberte lokalitu a časový rozsah.",
          trySelectingAnother: "Skúste vybrať inú lokalitu alebo časový rozsah",
          refreshPage: "Obnoviť stránku"
        }
      }
    },
    fallbackLng: {
      'sk-SK': ['sk'],
      'en-US': ['en'],
      'en-GB': ['en'],
      default: ['sk'] // Changed from 'en' to 'sk' to make Slovak the default
    },
    lng: 'sk', // Force Slovak as the initial language
    debug: isLoggingEnabled(),
    
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    
    detection: {
      order: ['querystring', 'localStorage', 'navigator', 'htmlTag'],
      lookupQuerystring: 'lng',
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage'],
      cookieMinutes: 160
    },
    
    // Silence initialization logs
    log: isLoggingEnabled() ? console : {
      type: '',
      log: () => {},
      warn: () => {},
      error: console.error // still log errors
    }
  });

// Set the default language to Slovak after initialization
window.addEventListener('DOMContentLoaded', () => {
  // This will ensure Slovak is set as default even after page refresh
  if (i18n.language !== 'sk') {
    i18n.changeLanguage('sk');
  }
});

// Export a reload function to force refresh translations
export const reloadTranslations = () => {
  const currentLang = i18n.language;
  clearTranslationCache();
  i18n.reloadResources().then(() => {
    i18n.changeLanguage(currentLang);
  });
};

export default i18n;