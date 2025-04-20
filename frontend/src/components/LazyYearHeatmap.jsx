import { useState } from "react";
import CalendarHeatmapChart from "../CalendarHeatmapChart";

// Default thresholds to prevent errors with null values
const DEFAULT_THRESHOLDS = {
  min: 20,
  mid: 25,
  high: 30,
  colorMin: "#B3E6FF",
  colorMid: "#FFFF99",
  colorHigh: "#FF9999"
};

// Komponent pre lazy načítanie heatmapy pre jednotlivé roky
function LazyYearHeatmap({ year, data, thresholds = DEFAULT_THRESHOLDS, fixedDays }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Use provided thresholds or fallback to defaults
  const safeThresholds = thresholds || DEFAULT_THRESHOLDS;

  const handleToggle = (e) => {
    const open = e.target.open;
    setIsExpanded(open);
    if (open && !isLoaded) {
      setTimeout(() => {
        setIsLoaded(true);
      }, 500);
    }
  };

  return (
    <details onToggle={handleToggle} open={year === new Date().getFullYear().toString()} className="mb-8">
      <summary className="cursor-pointer font-bold mb-2">Rok {year}</summary>
      {isExpanded ? (
        isLoaded ? (
          data && data.length > 0 ? (
            <CalendarHeatmapChart data={data} startDate={`${year}-01-01`} thresholds={safeThresholds} fixedDays={fixedDays} />
          ) : (
            <div className="p-4 text-center text-gray-500">No data</div>
          )
        ) : (
          <div className="p-4 text-center text-gray-500">Načítavam dáta pre rok {year}...</div>
        )
      ) : null}
    </details>
  );
}

export default LazyYearHeatmap; 