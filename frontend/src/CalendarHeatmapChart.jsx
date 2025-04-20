import React, { useState, useEffect } from 'react';
import CalendarHeatmap from "react-calendar-heatmap";
import { Tooltip } from "react-tooltip";
import "react-calendar-heatmap/dist/styles.css";

/**
 * Hlavný komponent, ktorý podľa zadaného intervalu vykreslí buď jednu heatmapu
 * s fixnou dĺžkou (fixedDays, predvolene 365 dní) alebo, ak interval pokrýva viac rokov,
 * rozdelí dáta do samostatných heatmap, každú pre jeden rok.
 */
function CalendarHeatmapChart({
  data,
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
  fixedDays = 365
}) {
  // Ak je zadaný endDate a rozdiel rokov je aspoň jeden, rozdelíme dáta podľa rokov
  if (endDate && new Date(endDate).getFullYear() > new Date(startDate).getFullYear()) {
    const startYear = new Date(startDate).getFullYear();
    const endYear = new Date(endDate).getFullYear();
    const charts = [];
    for (let year = startYear; year <= endYear; year++) {
      const yearStart = new Date(`${year}-01-01`);
      const yearEnd = new Date(`${year}-12-31`);
      charts.push(
        <div key={year} style={{ marginBottom: "2rem" }}>
          <h3 style={{ textAlign: "center", marginBottom: "0.5rem" }}>{year}</h3>
          <CalendarHeatmapChartSingle
            data={data.filter((item) => new Date(item.x).getFullYear() === year)}
            startDate={yearStart}
            endDate={yearEnd}
            thresholds={thresholds}
            fixedDays={isLeapYear(year) ? 366 : 365}
          />
        </div>
      );
    }
    return <div>{charts}</div>;
  } else {
    // Režim pre jeden rok – použijeme fixedDays (predvolene 365 dní)
    const alignedStart = new Date(startDate);
    const alignedEnd = new Date(alignedStart.getTime() + (fixedDays - 1) * 86400000);
    return <CalendarHeatmapChartSingle data={data} startDate={alignedStart} endDate={alignedEnd} thresholds={thresholds} fixedDays={fixedDays} />;
  }
}

/**
 * Podkomponent, ktorý vykresľuje jednu heatmapu podľa zadaného intervalu.
 * Používa fixedDays na výpočet endDate.
 */
function CalendarHeatmapChartSingle({ data, startDate, endDate, thresholds, fixedDays }) {
  // V režime single year ignorujeme pôvodný endDate a počítame ho zo startDate a fixedDays
  const alignedStart = new Date(startDate);
  const alignedEnd = new Date(alignedStart.getTime() + (fixedDays - 1) * 86400000);

  // Transformácia dát do formátu požadovaného komponentom react-calendar-heatmap
  const transformedData = data.map((item) => {
    const d = new Date(item.x);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return {
      date: `${yyyy}-${mm}-${dd}`,
      count: item.y
    };
  });

  // Funkcia, ktorá podľa hodnoty určí farbu bunky
  function getFillColor(count) {
    if (count == null || count < 0) {
      return "#ccc"; // Sivá pre chýbajúce dáta
    }
    
    // Ensure threshold values are defined
    const safeThresholds = thresholds || {
      min: 20,
      mid: 25,
      high: 30,
      colorMin: "#B3E6FF",
      colorMid: "#FFFF99",
      colorHigh: "#FF9999"
    };
    
    if (count < safeThresholds.min) {
      return safeThresholds.colorMin;
    } else if (count < safeThresholds.mid) {
      return safeThresholds.colorMid;
    } else {
      return safeThresholds.colorHigh;
    }
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <CalendarHeatmap
        startDate={alignedStart}
        endDate={alignedEnd}
        values={transformedData}
        horizontal={true}
        showWeekdayLabels={true}
        showMonthLabels={true}
        weekdayLabels={["Po", "Ut", "St", "Št", "Pi", "So", "Ne"]}
        tooltipDataAttrs={(value) => {
          if (!value || !value.date) {
            return { "data-tooltip-id": "calendar-tooltip", "data-tooltip-content": "no data" };
          }
          const tooltipText =
            value.count != null && value.count >= 0
              ? `${value.date}: ${value.count.toFixed(1)} °C`
              : "no data";
          return { 
            "data-tooltip-id": "calendar-tooltip", 
            "data-tooltip-content": tooltipText 
          };
        }}
        transformDayElement={(element, value) => {
          const fill = value ? getFillColor(value.count) : "#ccc";
          return React.cloneElement(element, {
            style: {
              fill,
              stroke: "#fff",
              strokeWidth: 1
            },
            width: 15,
            height: 15
          });
        }}
      />
      <Tooltip id="calendar-tooltip" />
    </div>
  );
}

/**
 * Pomocná funkcia, ktorá zistí, či je daný rok priestupný.
 */
function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

export default React.memo(CalendarHeatmapChart);
