import { useState, lazy, Suspense } from "react";
import LoadingIndicator from "./LoadingIndicator";
import { useTranslation } from 'react-i18next';

// Lazy loaded component
const CalendarHeatmapChart = lazy(() => import("../CalendarHeatmapChart"));

// Default thresholds to prevent errors with null values
const DEFAULT_THRESHOLDS = {
  min: 20,
  mid: 25,
  high: 30,
  colorMin: "#B3E6FF",
  colorMid: "#FFFF99",
  colorHigh: "#FF9999"
};

// Component for lazy loading year heatmaps
function LazyYearHeatmap({ year, data, thresholds = DEFAULT_THRESHOLDS, fixedDays }) {
  const { t } = useTranslation();
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
      <summary className="cursor-pointer font-bold mb-2">{t('heatmap.year', { year })}</summary>
      {isExpanded ? (
        isLoaded ? (
          data && data.length > 0 ? (
            <Suspense fallback={<LoadingIndicator text={t('heatmap.loading', { year })} />}>
              <CalendarHeatmapChart data={data} startDate={`${year}-01-01`} thresholds={safeThresholds} fixedDays={fixedDays} />
            </Suspense>
          ) : (
            <div className="p-4 text-center text-gray-500">{t('heatmap.noData')}</div>
          )
        ) : (
          <div className="p-4 text-center text-gray-500">{t('heatmap.loadingData', { year })}</div>
        )
      ) : null}
    </details>
  );
}

export default LazyYearHeatmap;