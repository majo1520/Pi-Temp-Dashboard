// Utility functions for chart data processing and transformations
import { useTranslation } from 'react-i18next';
import i18next from 'i18next';

// =============================
// Pomocné funkcie
// =============================
export function parseIntervalToMs(intervalStr) {
  if (!intervalStr) return 0;
  const num = parseFloat(intervalStr);
  const unit = intervalStr.slice(-1);
  let multiplier = 1000;
  if (unit === "s") multiplier = 1000;
  else if (unit === "m") multiplier = 60000;
  else if (unit === "h") multiplier = 3600000;
  else if (unit === "d") multiplier = 86400000;
  return num * multiplier;
}

export function parseFluxToMs(fluxStr) {
  if (!fluxStr) return 0;
  const sign = fluxStr[0] === "-" ? -1 : 1;
  const num = parseFloat(fluxStr.slice(1));
  const unit = fluxStr.slice(-1);
  let multiplier = 1000;
  if (unit === "s") multiplier = 1000;
  else if (unit === "m") multiplier = 60000;
  else if (unit === "h") multiplier = 3600000;
  else if (unit === "d") multiplier = 86400000;
  return sign * num * multiplier;
}

// Ak nie sú dáta, nastaví sa hodnota -1
export function fillDataGaps(dataArray, startTime, endTime, intervalMs) {
  const sorted = [...dataArray].sort((a, b) => a.time - b.time);
  const filled = [];
  for (let t = startTime; t <= endTime; t += intervalMs) {
    const point = sorted.find((p) => Math.abs(p.time - t) < intervalMs / 2);
    filled.push({ time: t, value: point ? point.value : -1 });
  }
  return filled;
}

// Funkcia vracia ikonu podľa hodnoty a prahov
export function getStateIcon(measurement, value, thresholds) {
  if (value === null || isNaN(value) || value === -1) {
    return <span title="Žiadne údaje alebo chyba prenosu">ℹ️</span>;
  }
  if (measurement === "teplota") {
    if (value <= thresholds.teplota.mid) return <span title="Teplota v norme">✅</span>;
    else if (value <= thresholds.teplota.high) return <span title="Teplota zvýšená">⚠️</span>;
    else return <span title="Teplota kritická!">🔴</span>;
  }
  if (measurement === "vlhkost") {
    if (value <= thresholds.vlhkost.mid) return <span title="Vlhkosť v norme">✅</span>;
    else if (value <= thresholds.vlhkost.high) return <span title="Vlhkosť zvýšená">⚠️</span>;
    else return <span title="Vlhkosť kritická!">🔴</span>;
  }
  if (measurement === "tlak") {
    if (value <= thresholds.tlak.mid) return <span title="Tlak v norme">✅</span>;
    else if (value <= thresholds.tlak.high) return <span title="Tlak zvýšený">⚠️</span>;
    else return <span title="Tlak kritický!">🔴</span>;
  }
  return null;
}

export function toIsoOrNull(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function formatExcelDate(timestamp) {
  const date = new Date(timestamp);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

// =============================
// NOVÁ FUNKCIA – reálna agregácia min/avg/max za celé dáta
// =============================
export function computeOverallAggregations(series) {
  let minVal = Infinity;
  let maxVal = -Infinity;
  let sum = 0;
  let count = 0;
  let minTime = null;
  let maxTime = null;

  series.forEach((s) => {
    s.data.forEach((pt) => {
      if (pt.y !== -1 && !isNaN(pt.y)) {
        count++;
        sum += pt.y;
        if (pt.y < minVal) {
          minVal = pt.y;
          minTime = pt.x;
        }
        if (pt.y > maxVal) {
          maxVal = pt.y;
          maxTime = pt.x;
        }
      }
    });
  });

  if (count === 0) {
    return { min: null, avg: null, max: null, minTime: null, maxTime: null };
  }

  const avgVal = sum / count;
  return { min: minVal, avg: avgVal, max: maxVal, minTime, maxTime };
}

// =============================
// Prahové anotácie
// =============================
export function getTeplotaAnnotations(t) {
  // Return empty array if thresholds are not defined
  if (!t || typeof t !== 'object') {
    return [];
  }
  
  // Use default values if specific thresholds are missing
  const min = t.min ?? 18;
  const mid = t.mid ?? 22;
  const colorMin = t.colorMin ?? '#B3E6FF';
  const colorMid = t.colorMid ?? '#FFFF99';
  const colorHigh = t.colorHigh ?? '#FF9999';
  
  // Get translations from i18next
  const thresholdMin = i18next.t('thresholdMin', 'Min');
  const thresholdMid = i18next.t('thresholdMid', 'Mid');
  const thresholdHigh = i18next.t('thresholdHigh', 'High');
  
  return [
    {
      y: 0,
      y2: min,
      label: { 
        text: thresholdMin,
        position: 'right',
        offsetX: 5,
        style: {
          background: 'transparent'
        }
      },
      borderColor: "transparent",
      fillColor: colorMin,
      opacity: 0.1,
    },
    {
      y: min,
      y2: mid,
      label: { 
        text: thresholdMid,
        position: 'right',
        offsetX: 5,
        style: {
          background: 'transparent'
        }
      },
      borderColor: "transparent",
      fillColor: colorMid,
      opacity: 0.1,
    },
    {
      y: mid,
      y2: 9999,
      label: { 
        text: thresholdHigh,
        position: 'right',
        offsetX: 5,
        offsetY: 13,  // Increased from 12 to 13 pixels
        style: {
          background: 'transparent'
        }
      },
      borderColor: "transparent",
      fillColor: colorHigh,
      opacity: 0.1,
    },
  ];
}

export function getHumidityAnnotations(h) {
  // Return empty array if thresholds are not defined
  if (!h || typeof h !== 'object') {
    return [];
  }
  
  // Use default values if specific thresholds are missing
  const min = h.min ?? 40;
  const mid = h.mid ?? 60;
  const colorMin = h.colorMin ?? '#B3E6FF';
  const colorMid = h.colorMid ?? '#FFFF99';
  const colorHigh = h.colorHigh ?? '#FF9999';
  
  // Get translations from i18next
  const thresholdMin = i18next.t('thresholdMin', 'Min');
  const thresholdMid = i18next.t('thresholdMid', 'Mid');
  const thresholdHigh = i18next.t('thresholdHigh', 'High');
  
  return [
    {
      y: 0,
      y2: min,
      label: { 
        text: thresholdMin,
        position: 'right',
        offsetX: 5,
        style: {
          background: 'transparent'
        }
      },
      borderColor: "transparent",
      fillColor: colorMin,
      opacity: 0.1,
    },
    {
      y: min,
      y2: mid,
      label: { 
        text: thresholdMid,
        position: 'right',
        offsetX: 5,
        style: {
          background: 'transparent'
        }
      },
      borderColor: "transparent",
      fillColor: colorMid,
      opacity: 0.1,
    },
    {
      y: mid,
      y2: 100,
      label: { 
        text: thresholdHigh,
        position: 'right',
        offsetX: 5,
        offsetY: 13,  // Increased from 12 to 13 pixels
        style: {
          background: 'transparent'
        }
      },
      borderColor: "transparent",
      fillColor: colorHigh,
      opacity: 0.1,
    },
  ];
}

export function getPressureAnnotations(p) {
  // Return empty array if thresholds are not defined
  if (!p || typeof p !== 'object') {
    return [];
  }
  
  // Use default values if specific thresholds are missing
  const min = p.min ?? 990;
  const mid = p.mid ?? 1013;
  const colorMin = p.colorMin ?? '#B3E6FF';
  const colorMid = p.colorMid ?? '#FFFF99';
  const colorHigh = p.colorHigh ?? '#FF9999';
  
  // Get translations from i18next
  const thresholdMin = i18next.t('thresholdMin', 'Min');
  const thresholdMid = i18next.t('thresholdMid', 'Mid');
  const thresholdHigh = i18next.t('thresholdHigh', 'High');
  
  return [
    {
      y: 0,
      y2: min,
      label: { 
        text: thresholdMin,
        position: 'right',
        offsetX: 5,
        style: {
          background: 'transparent'
        }
      },
      borderColor: "transparent",
      fillColor: colorMin,
      opacity: 0.1,
    },
    {
      y: min,
      y2: mid,
      label: { 
        text: thresholdMid,
        position: 'right',
        offsetX: 5,
        style: {
          background: 'transparent'
        }
      },
      borderColor: "transparent",
      fillColor: colorMid,
      opacity: 0.1,
    },
    {
      y: mid,
      y2: 1100,
      label: { 
        text: thresholdHigh,
        position: 'right',
        offsetX: 5,
        offsetY: 13,  // Increased from 12 to 13 pixels
        style: {
          background: 'transparent'
        }
      },
      borderColor: "transparent",
      fillColor: colorHigh,
      opacity: 0.1,
    },
  ];
}

export function getStatusColor(temp, thresholds) {
  if (isNaN(temp)) return "transparent";
  if (!thresholds || !thresholds.teplota || 
      typeof thresholds.teplota.mid === 'undefined' || 
      typeof thresholds.teplota.high === 'undefined') {
    // Return a default color if thresholds are not properly defined
    return "#3498db";
  }
  if (temp <= thresholds.teplota.mid) return "#34D399";
  else if (temp <= thresholds.teplota.high) return "#F1C40F";
  else return "#E74C3C";
}

// =============================
// Funkcie pre heatmap data
// =============================
export function prepareDailyHeatmapData(historicalData) {
  const grouped = {};
  historicalData.forEach(({ time, value }) => {
    const dayKey = new Date(time).toISOString().slice(0, 10);
    if (!grouped[dayKey]) grouped[dayKey] = [];
    grouped[dayKey].push(value);
  });

  const seriesData = Object.keys(grouped)
    .sort()
    .map((dayKey) => {
      const arr = grouped[dayKey];
      const avg = arr.length > 0 ? arr.reduce((sum, v) => sum + v, 0) / arr.length : 0;
      const yVal = arr.length > 0 ? parseFloat(avg.toFixed(2)) : -1;
      return { x: dayKey, y: yVal };
    });

  return [
    {
      name: "Denný priemer",
      data: seriesData,
    },
  ];
}

export function prepareHeatmapData(historicalData, aggregatorWindow = "1h") {
  if (aggregatorWindow === "24h") return prepareDailyHeatmapData(historicalData);
  const grouped = {};
  const aggregatorHours = parseFloat(aggregatorWindow);
  const slotCount = Math.floor(24 / aggregatorHours);
  const hourLabels = [];
  for (let i = 0; i < slotCount; i++) {
    const hour = i * aggregatorHours;
    hourLabels.push((hour < 10 ? "0" + hour : hour) + ":00");
  }
  historicalData.forEach(({ time, value }) => {
    const dateObj = new Date(time);
    const localDate = dateObj.toLocaleDateString("sk-SK", { timeZone: "Europe/Bratislava" });
    const hourValue = dateObj.getHours();
    const slotHour = Math.floor(hourValue / aggregatorHours) * aggregatorHours;
    const slotLabel = (slotHour < 10 ? "0" + slotHour : slotHour) + ":00";
    if (!grouped[localDate]) {
      grouped[localDate] = {};
      hourLabels.forEach((label) => {
        grouped[localDate][label] = [];
      });
    }
    if (grouped[localDate][slotLabel] !== undefined) {
      grouped[localDate][slotLabel].push(value);
    }
  });
  const series = [];
  Object.keys(grouped)
    .sort()
    .forEach((dateKey) => {
      const dataArr = hourLabels.map((label) => {
        const values = grouped[dateKey][label];
        if (!values) return { x: label, y: -1 };
        const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
        return { x: label, y: avg !== null ? parseFloat(avg.toFixed(2)) : -1 };
      });
      series.push({ name: dateKey, data: dataArr });
    });
  return series;
}

export function prepareCalendarData(heatmapSeries) {
  if (!heatmapSeries || heatmapSeries.length === 0) return [];
  return heatmapSeries[0].data.map((pt) => ({ x: pt.x, y: pt.y === 0 ? -1 : pt.y }));
}

export function getCalendarStart(rangeKey) {
  const d = new Date();
  if (rangeKey === "365d") {
    d.setDate(d.getDate() - 365);
  } else if (rangeKey === "180d") {
    d.setDate(d.getDate() - 180);
  } else {
    // Default to 30d for other ranges
    d.setDate(d.getDate() - 30);
  }
  return d;
}

export function splitDataByYear(data, startDate, endDate) {
  const startYear = new Date(startDate).getFullYear();
  const endYear = new Date(endDate).getFullYear();
  const yearlyData = {};
  for (let year = startYear; year <= endYear; year++) {
    yearlyData[year] = [];
  }
  data.forEach((pt) => {
    const year = new Date(pt.x).getFullYear();
    if (yearlyData[year]) {
      yearlyData[year].push(pt);
    }
  });
  return yearlyData;
}