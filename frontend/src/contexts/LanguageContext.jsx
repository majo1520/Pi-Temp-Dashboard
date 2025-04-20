import { createContext, useState, useContext, useEffect } from 'react';
import enTranslations from '../locales/en.json';
import skTranslations from '../locales/sk.json';

const LanguageContext = createContext();

// Dictionary of translations for the application
export const translations = {
  sk: {
    ...skTranslations,
    // Legacy translations not yet moved to JSON files
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
    
    // Thresholds descriptions
    thresholdMin: "Minimálny prah",
    thresholdMid: "Stredný prah",
    thresholdHigh: "Vysoký prah",
    colorMin: "Farba nízkeho prahu",
    colorMid: "Farba stredného prahu",
    colorHigh: "Farba vysokého prahu",
    
    // Display modes
    displayMode: "Zobrazenie grafov",
    chartMode: "Režim grafov",
    
    // Status
    lastSeen: "Naposledy videný",
    
    // Full Screen
    fullscreen: "Na celú obrazovku",
    exitFullscreen: "Zavrieť celú obrazovku",
    
    // Export
    export: "Export",
    exportExcel: "Export Excel",
    exportCSV: "Export CSV",
    exportError: "Chyba pri exporte, skúste znova",
    format: "formát",
    
    // Loading and error states
    error: "Chyba",
    
    // Confirmation
    confirmation: "Potvrdenie",
    confirm: "Potvrdiť",
    cancelAction: "Zrušiť",
    warning: "Upozornenie",
    
    // Help texts
    chartsHelpText: "Výber typov údajov a spôsobu ich zobrazenia.",
    aggregationsHelpText: "Zobrazenie minimálnych, priemerných a maximálnych hodnôt v grafoch.",
    thresholdsHelpText: "Nastavenie farebne označených hraníc pre merané hodnoty.",
    heatmapHelpText: "Zobrazuje historické hodnoty vo formáte matice alebo kalendára.",
    cardStylingHelpText: "Upravte vzhľad kariet senzorov nastavením farieb a priehľadnosti.",
    locationColorsHelpText: "Nastavte farby pre jednotlivé lokality, ktoré sa premietnu do kariet aj grafov.",
    
    // Card styling
    cardStyling: "Štýl kariet",
    backgroundColor: "Farba pozadia",
    borderColor: "Farba okraja",
    opacity: "Priehľadnosť",
    previewCard: "Ukážková karta",
    resetToDefault: "Obnoviť predvolené",
    
    // Location colors
    locationColors: "Farby lokalít",
    defaultColor: "Predvolená farba",
    color: "Farba",
    editLocationColor: "Upraviť farbu pre {{location}}",
    locationColorsDescription: "Prispôsobte si farby pre každú lokalitu v kartách senzorov aj v grafoch.",
    resetToDefaultColors: "Obnoviť predvolené farby",
    save: "Uložiť",
    
    // Other
    noData: "Žiadne dáta",
    settings: "Nastavenia",
    defaultSelection: "Predvolený výber",
    defaultSelectionHelpText: "Nastavte aktuálny výber ako predvolený pri načítaní.",
    setCurrentSelectionAsDefault: "Nastaviť aktuálny výber ako predvolený",
    defaultSelectionSaved: "Aktuálny výber bol nastavený ako predvolený.",
    setAsDefault: "Nastaviť ako predvolené",
    day: "Deň",
    month: "Mesiac",
    year: "Rok",
    
    // Admin Panel
    visible: "Viditeľné",
    hidden: "Skryté",
    uptimeChart: "Graf uptime",
    uptimeTotal: "Celkový uptime",
    selectRange: "Vybrať rozsah",
    noDataForRange: "Žiadne dáta pre tento rozsah",
    generatingFile: "Generujem súbor...",
    hideShowLocations: "Skryť/Zobraziť lokácie",
    hideShowCards: "Skryť/Zobraziť karty",
    noSensorsFound: "Žiadne senzory neboli nájdené",
    moveUp: "Posunúť hore",
    moveDown: "Posunúť dole",
    dragging: "Presúvanie...",
    dropHere: "Pustiť sem",
    dragDropHint: "Lokality môžete presúvať ťahaním alebo pomocou šípok",
    
    // Sensor card tooltips
    temperatureTooltip: "Teplota",
    humidityTooltip: "Vlhkosť",
    pressureTooltip: "Tlak",
    lastRecordTooltip: "Posledný záznam",
    onlineTooltip: "Online",
    offlineTooltip: "Offline",
    sensorInfoTooltip: "Informácie o senzore",
    noDataAvailable: "Žiadne údaje",
    dataAvailableOnlyInLive: "Údaj dostupný iba v LIVE rozsahu",
    
    // Timeline visualization in admin panel
    blankIsOffline: "Prázdne miesta znamenajú offline",
    dataAggregated: "Dáta sú agregované",
    opacityShows: "priehľadnosť zobrazuje percentuálny čas online",
    
    // Uptime information
    uptime: "Uptime",
    offline: "Offline",
    since: "Od",
    totalRuntime: "Celkový beh"
  },
  en: {
    ...enTranslations,
    // Legacy translations not yet moved to JSON files
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
    
    // Thresholds descriptions
    thresholdMin: "Minimum threshold",
    thresholdMid: "Middle threshold",
    thresholdHigh: "High threshold",
    colorMin: "Low threshold color",
    colorMid: "Middle threshold color",
    colorHigh: "High threshold color",
    
    // Display modes
    displayMode: "Chart Display Mode",
    chartMode: "Chart Mode",
    
    // Status
    lastSeen: "Last seen",
    
    // Full Screen
    fullscreen: "Full Screen",
    exitFullscreen: "Exit Full Screen",
    
    // Export
    export: "Export",
    exportExcel: "Export Excel",
    exportCSV: "Export CSV",
    exportError: "Error exporting, please try again",
    format: "format",
    
    // Loading and error states
    error: "Error",
    
    // Confirmation
    confirmation: "Confirmation",
    confirm: "Confirm",
    cancelAction: "Cancel",
    warning: "Warning",
    
    // Help texts
    chartsHelpText: "Select data types and how to display them.",
    aggregationsHelpText: "Display minimum, average, and maximum values in charts.",
    thresholdsHelpText: "Set color-coded boundaries for measured values.",
    heatmapHelpText: "Display historical values in a matrix or calendar format.",
    cardStylingHelpText: "Customize the appearance of sensor cards by setting colors and opacity.",
    locationColorsHelpText: "Set colors for individual locations that will be reflected in cards and charts.",
    
    // Card styling
    cardStyling: "Card Styling",
    backgroundColor: "Background Color",
    borderColor: "Border Color",
    opacity: "Opacity",
    previewCard: "Preview Card",
    resetToDefault: "Reset to Default",
    
    // Location colors
    locationColors: "Location Colors",
    defaultColor: "Default Color",
    color: "Color",
    editLocationColor: "Edit color for {{location}}",
    locationColorsDescription: "Customize colors for each location in sensor cards and charts.",
    resetToDefaultColors: "Reset to Default Colors",
    save: "Save",
    
    // Other
    noData: "No Data",
    settings: "Settings",
    defaultSelection: "Default Selection",
    defaultSelectionHelpText: "Set current selection as default on load.",
    setCurrentSelectionAsDefault: "Set Current Selection as Default",
    defaultSelectionSaved: "Current selection has been set as default.",
    setAsDefault: "Set as Default",
    day: "Day",
    month: "Month",
    year: "Year",
    
    // Admin Panel
    visible: "Visible",
    hidden: "Hidden",
    uptimeChart: "Uptime Chart",
    uptimeTotal: "Total Uptime",
    selectRange: "Select Range",
    noDataForRange: "No data for this range",
    generatingFile: "Generating file...",
    hideShowLocations: "Hide/Show Locations",
    hideShowCards: "Hide/Show Cards",
    noSensorsFound: "No sensors found",
    moveUp: "Move Up",
    moveDown: "Move Down",
    dragging: "Dragging...",
    dropHere: "Drop here",
    dragDropHint: "You can rearrange locations by dragging or using arrows",
    
    // Sensor card tooltips
    temperatureTooltip: "Temperature",
    humidityTooltip: "Humidity",
    pressureTooltip: "Pressure",
    lastRecordTooltip: "Last record",
    onlineTooltip: "Online",
    offlineTooltip: "Offline",
    sensorInfoTooltip: "Sensor Information",
    noDataAvailable: "No data available",
    dataAvailableOnlyInLive: "Data only available in LIVE range",
    
    // Timeline visualization in admin panel
    blankIsOffline: "Blank periods are offline",
    dataAggregated: "Data is aggregated",
    opacityShows: "opacity shows percentage of time online",
    
    // Uptime information
    uptime: "Uptime",
    offline: "Offline",
    since: "Since",
    totalRuntime: "Total runtime"
  }
};

export function LanguageProvider({ children }) {
  // Default language is Slovak (sk)
  const [language, setLanguage] = useState('sk');
  
  // Load language preference from localStorage on initial mount
  useEffect(() => {
    const savedLanguage = localStorage.getItem('language');
    if (savedLanguage && (savedLanguage === 'sk' || savedLanguage === 'en')) {
      setLanguage(savedLanguage);
    }
  }, []);
  
  // Save language preference whenever it changes
  useEffect(() => {
    localStorage.setItem("language", language);
  }, [language]);
  
  // Toggle between Slovak and English
  const toggleLanguage = () => setLanguage(prev => prev === 'sk' ? 'en' : 'sk');
  
  // Get a translation value
  const t = (key) => {
    // First check if the key exists in the current language
    if (translations[language][key]) {
      return translations[language][key];
    }
    
    // If not found in current language, check the other language
    const otherLang = language === 'sk' ? 'en' : 'sk';
    if (translations[otherLang][key]) {
      return translations[otherLang][key];
    }
    
    // If not found in either language, return the key itself
    console.warn(`Translation missing for key: ${key}`);
    return key;
  };
  
  const value = {
    language,
    setLanguage,
    toggleLanguage,
    t
  };
  
  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
} 