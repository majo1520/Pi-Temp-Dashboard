import React, { useState, useEffect } from "react";
import { getStateIcon } from "../utils/chartUtils.jsx";
import { useChart } from "../contexts/ChartContext";
import { useTranslation } from 'react-i18next';

// Komponent pre zobrazenie senzorových kariet
function SensorCard({ 
  location, 
  data, 
  isActive, 
  lastSeen, 
  rangeKey,
  thresholds,
  getStatusColor
}) {
  // Get card styling from context
  const { cardStyling, locationColors } = useChart();
  // Get translations
  const { t } = useTranslation();
  
  let fallbackMessage = t('dataAvailableOnlyInLive') || "Údaj dostupný iba v LIVE rozsahu";

  // Always display the actual last database write time, regardless of range
  const lastDateTime = lastSeen[location]
    ? new Date(lastSeen[location]).toLocaleString()
    : data && data.time
    ? new Date(data.time).toLocaleString()
    : t('noDataAvailable') || "Žiadne údaje";

  // Výpočet a zobrazenie meraných hodnôt
  const tVal = parseFloat(data?.teplota);
  const tempDisplay =
    isNaN(tVal) || tVal === -1 ? (t('noDataAvailable') || "Žiadne údaje") : `${tVal.toFixed(2)} °C`;

  const hVal = parseFloat(data?.vlhkost);
  const humDisplay =
    isNaN(hVal) || hVal === -1 ? (t('noDataAvailable') || "Žiadne údaje") : `${hVal.toFixed(2)} %`;

  const pVal = parseFloat(data?.tlak);
  const presDisplay =
    isNaN(pVal) || pVal === -1 ? (t('noDataAvailable') || "Žiadne údaje") : `${pVal.toFixed(2)} hPa`;

  // Get location color from context or use default
  const getLocationColor = (loc) => locationColors[loc] || locationColors.default;

  const sensorStyle = { 
    overflow: "hidden", 
    borderLeft: `2px solid ${getLocationColor(location)}`,
    borderRight: `2px solid ${getLocationColor(location)}`,
    borderBottom: `2px solid ${getLocationColor(location)}`,
    backgroundColor: 'var(--card-bg-color, cardStyling.backgroundColor)',
    opacity: cardStyling.opacity / 100
  };
  
  // Top border indicates status - keep separate from location color
  sensorStyle.borderTop = `4px solid ${isActive ? getStatusColor(tVal, thresholds) : "#E74C3C"}`;

  const cardBgClass =
    data && Object.keys(data).length > 0 ? "dark:bg-gray-800" : "bg-gray-300 dark:bg-gray-700";

  // Add custom CSS for dark mode detection
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      :root {
        --card-bg-color: ${cardStyling.backgroundColor};
      }
      .dark {
        --card-bg-color: #1e293b;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, [cardStyling.backgroundColor]);

  return (
    <div
      className={`w-64 p-4 rounded-xl shadow-md hover:shadow-xl transition-shadow duration-300 transform hover:scale-[1.02] ${cardBgClass} flex flex-col justify-between h-full`}
      style={sensorStyle}
      aria-label={`${t('sensorInfoTooltip') || 'Informácie o senzore'} ${location}`}
    >
      <h2 className="text-xl font-bold mb-2 flex items-center">
        <span
          className={`inline-block w-3 h-3 mr-2 rounded-full ${
            isActive ? "bg-green-600" : "bg-red-600"
          }`}
          title={isActive ? (t('onlineTooltip') || "Online") : (t('offlineTooltip') || "Offline")}
        ></span>
        {location}
      </h2>
      <div className="space-y-2 text-sm">
        <div className="flex items-center">
          <span title={t('temperatureTooltip') || "Teplota"} className="mr-1">🌡️</span>
          <span>{tempDisplay}</span>
          <span className="ml-2">{getStateIcon("teplota", tVal, thresholds)}</span>
        </div>
        <div className="flex items-center">
          <span title={t('humidityTooltip') || "Vlhkosť"} className="mr-1">💧</span>
          <span>{humDisplay}</span>
          <span className="ml-2">{getStateIcon("vlhkost", hVal, thresholds)}</span>
        </div>
        <div className="flex items-center">
          <span title={t('pressureTooltip') || "Tlak"} className="mr-1">🧭</span>
          <span>{presDisplay}</span>
          <span className="ml-2">{getStateIcon("tlak", pVal, thresholds)}</span>
        </div>
        <div className="flex items-center">
          <span title={t('lastRecordTooltip') || "Posledný záznam"} className="mr-1">🕒</span>
          <span>{lastDateTime}</span>
        </div>
      </div>
    </div>
  );
}

export default SensorCard; 