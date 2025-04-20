import { useEffect, useState, useMemo } from "react";
import mqtt from "mqtt";
import Chart from "react-apexcharts";
import { Responsive, WidthProvider } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import * as XLSX from "xlsx";
import CalendarHeatmapChart from "./CalendarHeatmapChart"; // React.memo export
import config from "../config";
import { useNavigate, Link } from "react-router-dom";

const { BUCKET, INFLUX_URL, INFLUX_TOKEN, ORG, FIELDS } = config;



// Teraz môžete používať FIELDS vo zvyšku kódu:
FIELDS.forEach((field) => {
  console.log("Spracovávam pole:", field);
});
const ResponsiveGridLayout = WidthProvider(Responsive);

// Hook pre sledovanie rozmerov okna
function useWindowDimensions() {
  const [windowDimensions, setWindowDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,

  });
  useEffect(() => {
    function handleResize() {
      setWindowDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return windowDimensions;
}

const RANGES = {
  live: { label: "LIVE", flux: "-5m", interval: "10s" },
  "1h": { label: "1h", flux: "-1h", interval: "1m" },
  "6h": { label: "6h", flux: "-6h", interval: "5m" },
  "24h": { label: "24h", flux: "-24h", interval: "10m" },
  "7d": { label: "7d", flux: "-7d", interval: "30m" },
  "30d": { label: "30d", flux: "-30d", interval: "1h" },
  "365d": { label: "365d", flux: "-365d", interval: "6h" },
  custom: { label: "Vlastný interval", flux: null, interval: "1m" },
};

const HEATMAP_AGGREGATORS = {
  "7d": "1h",
  "30d": "6h",
  "365d": "24h",
  custom: "1h",
};

const DEFAULT_THRESHOLDS = {
  teplota: {
    min: 20,
    mid: 25,
    high: 30,
    colorMin: "#B3E6FF",
    colorMid: "#FFFF99",
    colorHigh: "#FF9999",
  },
  vlhkost: {
    min: 30,
    mid: 50,
    high: 70,
    colorMin: "#C3FFC3",
    colorMid: "#FFFF99",
    colorHigh: "#FF9999",
  },
  tlak: {
    min: 1010,
    mid: 1020,
    high: 1030,
    colorMin: "#C3FFC3",
    colorMid: "#FFFF99",
    colorHigh: "#FF9999",
  },
};

// =============================
// Pomocné funkcie
// =============================
function parseIntervalToMs(intervalStr) {
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

function parseFluxToMs(fluxStr) {
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
function fillDataGaps(dataArray, startTime, endTime, intervalMs) {
  const sorted = [...dataArray].sort((a, b) => a.time - b.time);
  const filled = [];
  for (let t = startTime; t <= endTime; t += intervalMs) {
    const point = sorted.find((p) => Math.abs(p.time - t) < intervalMs / 2);
    filled.push({ time: t, value: point ? point.value : -1 });
  }
  return filled;
}

// =============================
// Prahové anotácie
// =============================
function getTeplotaAnnotations(t) {
  return [
    {
      y: 0,
      y2: t.min,
      label: { text: "Min" },
      borderColor: "transparent",
      fillColor: t.colorMin,
      opacity: 0.1,
    },
    {
      y: t.min,
      y2: t.mid,
      label: { text: "Mid" },
      borderColor: "transparent",
      fillColor: t.colorMid,
      opacity: 0.1,
    },
    {
      y: t.mid,
      y2: 9999,
      label: { text: "High" },
      borderColor: "transparent",
      fillColor: t.colorHigh,
      opacity: 0.1,
    },
  ];
}

function getHumidityAnnotations(h) {
  return [
    {
      y: 0,
      y2: h.min,
      label: { text: "Min" },
      borderColor: "transparent",
      fillColor: h.colorMin,
      opacity: 0.1,
    },
    {
      y: h.min,
      y2: h.mid,
      label: { text: "Mid" },
      borderColor: "transparent",
      fillColor: h.colorMid,
      opacity: 0.1,
    },
    {
      y: h.mid,
      y2: 100,
      label: { text: "High" },
      borderColor: "transparent",
      fillColor: h.colorHigh,
      opacity: 0.1,
    },
  ];
}

function getPressureAnnotations(p) {
  return [
    {
      y: 0,
      y2: p.min,
      label: { text: "Min" },
      borderColor: "transparent",
      fillColor: p.colorMin,
      opacity: 0.1,
    },
    {
      y: p.min,
      y2: p.mid,
      label: { text: "Mid" },
      borderColor: "transparent",
      fillColor: p.colorMid,
      opacity: 0.1,
    },
    {
      y: p.mid,
      y2: 1100,
      label: { text: "High" },
      borderColor: "transparent",
      fillColor: p.colorHigh,
      opacity: 0.1,
    },
  ];
}

// Funkcia vracia ikonu podľa hodnoty a prahov
function getStateIcon(measurement, value, thresholds) {
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

function toIsoOrNull(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function formatExcelDate(timestamp) {
  const date = new Date(timestamp);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

export function exportExcel(field, data) {
  const wb = XLSX.utils.book_new();
  const header = ["Date", ...data.map((d) => d.name)];
  const times = new Set();
  data.forEach((d) => d.data.forEach((p) => times.add(p.x)));
  const sortedTimes = Array.from(times).sort((a, b) => a - b);
  const rows = [header];
  sortedTimes.forEach((timestamp) => {
    const row = [formatExcelDate(timestamp)];
    data.forEach((d) => {
      const match = d.data.find((p) => p.x === timestamp);
      row.push(match ? (match.y === -1 ? "no data" : Number(match.y).toFixed(2)) : "no data");
    });
    rows.push(row);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = header.map((_, idx) => (idx === 0 ? { wch: 20 } : { wch: 15 }));
  XLSX.utils.book_append_sheet(wb, ws, field || "Sheet1");
  XLSX.writeFile(wb, `${field}_data.xlsx`);
}

export function exportCSV(field, data) {
  const BOM = "\uFEFF";
  const header = ["Date", ...data.map((d) => d.name)];
  const times = new Set();
  data.forEach((d) => d.data.forEach((p) => times.add(p.x)));
  const sortedTimes = Array.from(times).sort((a, b) => a - b);
  const rows = [header];
  sortedTimes.forEach((timestamp) => {
    const row = [formatExcelDate(timestamp)];
    data.forEach((d) => {
      const match = d.data.find((p) => p.x === timestamp);
      row.push(match ? Number(match.y).toFixed(2) : "no data");
    });
    rows.push(row);
  });
  const csv = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${field}_data.csv`;
  link.click();
}

// =============================
// NOVÁ FUNKCIA – reálna agregácia min/avg/max za celé dáta
// =============================
function computeOverallAggregations(series) {
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
// Komponent ApexChart
// =============================
function ApexChart({
  title,
  series,
  chartType = "line",
  heatmapRanges,
  fieldName,
  thresholds,
  displayThresholds,
  customHeight,
  customWidth,
  allowFullScreen,
  showXAxisLabels,
}) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [fullScreen, setFullScreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) setFullScreen(false);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  let options = {
    chart: {
      id: "apex-chart",
      type: chartType,
      zoom: { enabled: true, type: "x", autoScaleYaxis: true },
      animations: { enabled: false },
      toolbar: {
        show: true,
        tools: {
          download: true,
          selection: true,
          zoom: true,
          zoomin: true,
          zoomout: true,
          pan: true,
          reset: true,
        },
      },
      fontFamily: "Arial, sans-serif",
    },
    xaxis: {
      type: chartType === "heatmap" ? "category" : "datetime",
      labels: {
        datetimeUTC: false,
        formatter: (val) => (chartType === "heatmap" ? val : new Date(val).toLocaleString()),
        style: { colors: "#b6b6b6", fontSize: "12px" },
        rotate: chartType === "heatmap" ? -45 : 0,
        show: typeof showXAxisLabels === "boolean" ? showXAxisLabels : true,
      },
      crosshairs: { show: true, stroke: { color: "#b6b6b6", width: 1 } },
    },
    yaxis: {
      title: {
        text: title,
        style: { color: "#b6b6b6", fontSize: "14px", fontWeight: 600 },
      },
      labels: {
        style: { colors: "#b6b6b6" },
        formatter: (val) =>
          typeof val === "number" ? (val === -1 ? "No data" : val.toFixed(2)) : "-",
      },
    },
    tooltip: {
      theme: "dark",
      x: {
        formatter: (val) => (chartType === "heatmap" ? val : new Date(val).toLocaleString()),
      },
      y: {
        formatter: (val) =>
          typeof val === "number" ? (val === -1 ? "No data" : val.toFixed(2)) : "-",
      },
    },
    grid: { borderColor: "#e0e0e0", strokeDashArray: 1 },
    stroke: { curve: "straight", width: 1 },
    markers: { size: 4, hover: { sizeOffset: 3 } },
    title: { text: title, style: { color: "#fff", fontSize: "16px" } },
  };

  // Heatmap nastavenia
  if (chartType === "heatmap" && thresholds) {
    options.xaxis.title = {
      text: "Dátum",
      style: { color: "#b6b6b6", fontSize: "14px", fontWeight: 600 },
    };

    options.tooltip = {
      theme: "dark",
      x: {
        formatter: (val, { seriesIndex, dataPointIndex, w }) => {
          const rowName = w.config.series[seriesIndex].name;
          return `${rowName} ${val}`;
        },
      },
      y: {
        formatter: (val) => (val === -1 ? "no data" : val.toString()),
      },
    };

    options.plotOptions = {
      heatmap: {
        shadeIntensity: 0.5,
        dataLabels: {
          enabled: true,
          formatter: function (val) {
            if (val === -1) {
              return "no data";
            }
            return val.toString();
          },
        },
        colorScale: {
          ranges: [
            { from: -1, to: -1, name: "No Data", color: "#808080" },
            { from: 0, to: thresholds.min, name: "Nízka", color: thresholds.colorMin },
            { from: thresholds.min, to: thresholds.mid, name: "Stredná", color: thresholds.colorMid },
            { from: thresholds.mid, to: 999999, name: "Vysoká", color: thresholds.colorHigh },
          ],
        },
      },
    };
  }

  // Threshold anotácie pre line chart
  if (chartType === "line" && fieldName) {
    if (displayThresholds) {
      let globalMin = Infinity;
      let globalMax = -Infinity;
      series.forEach((s) => {
        s.data.forEach((point) => {
          if (point.y !== null && point.y !== -1 && !isNaN(point.y)) {
            globalMin = Math.min(globalMin, point.y);
            globalMax = Math.max(globalMax, point.y);
          }
        });
      });
      if (globalMin === Infinity) {
        globalMin = thresholds[fieldName]?.min || 0;
        globalMax = thresholds[fieldName]?.high || 100;
      }
      if (fieldName === "teplota") {
        options.annotations = { yaxis: getTeplotaAnnotations(thresholds.teplota) };
        options.yaxis.min = Math.min(globalMin, thresholds.teplota.min);
        options.yaxis.max = Math.max(globalMax, thresholds.teplota.high);
      } else if (fieldName === "vlhkost") {
        options.annotations = { yaxis: getHumidityAnnotations(thresholds.vlhkost) };
        options.yaxis.min = Math.min(globalMin, thresholds.vlhkost.min);
        options.yaxis.max = Math.max(globalMax, thresholds.vlhkost.high);
      } else if (fieldName === "tlak") {
        options.annotations = { yaxis: getPressureAnnotations(thresholds.tlak) };
        options.yaxis.min = Math.min(globalMin, thresholds.tlak.min);
        options.yaxis.max = Math.max(globalMax, thresholds.tlak.high);
      }
    } else {
      options.annotations = {};
      delete options.yaxis.min;
      delete options.yaxis.max;
    }
  }

  // Anotácia "Latest" bod
  if (chartType === "line" && series && series.length > 0) {
    const pointAnnotations = [];
    series.forEach((s) => {
      if (s.data && s.data.length > 0) {
        const lastPoint = s.data[s.data.length - 1];
        pointAnnotations.push({
          x: lastPoint.x,
          y: lastPoint.y,
          marker: { size: 8, fillColor: "#fff", strokeColor: "#000", strokeWidth: 2 },
          label: {
            text: "Latest",
            offsetY: -10,
            style: { color: "#000", background: "#fff" },
          },
        });
      }
    });
    options.annotations = { ...options.annotations, points: pointAnnotations };
  }

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.getElementById("apex-chart").requestFullscreen();
      setFullScreen(true);
    } else {
      document.exitFullscreen();
      setFullScreen(false);
    }
  };

  return (
    <div id="apex-chart" className="relative">
      <div className="flex justify-between items-center mb-2 w-full px-4">
        <h2 className="text-2xl font-semibold capitalize text-white">{title}</h2>
        <div className="flex gap-2">
          {(chartType === "line" || allowFullScreen) && (
            <button
              onClick={toggleFullScreen}
              className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700"
              title="Prepnúť zobrazenie grafu na celú obrazovku"
            >
              {fullScreen ? "Exit Full Screen" : "Full Screen"}
            </button>
          )}
          {(chartType === "line" || allowFullScreen) && (
            <button
              onClick={() => exportExcel(title, series)}
              className="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700"
              title="Exportovať do Excelu"
            >
              Export Excel
            </button>
          )}
        </div>
      </div>
      <div style={{ overflowX: chartType === "heatmap" ? "auto" : "visible" }}>
        <Chart
          key={displayThresholds ? "threshold-on" : "threshold-off"}
          options={options}
          series={series}
          type={chartType}
          height={customHeight || 400}
          width={customWidth || "100%"}
        />
      </div>
    </div>
  );
}

// **********************************
// Komponent pre lazy načítanie heatmapy pre jednotlivé roky
// **********************************
function LazyYearHeatmap({ year, data, thresholds, fixedDays }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

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
            <CalendarHeatmapChart data={data} startDate={`${year}-01-01`} thresholds={thresholds} fixedDays={fixedDays} />
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

// **********************************
// Hlavná aplikácia
// **********************************
export function App() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [rangeKey, setRangeKey] = useState("6h");
  const [locations, setLocations] = useState([]);
  const [selectedLocations, setSelectedLocations] = useState(["IT OFFICE"]);
  const [tempCustomStart, setTempCustomStart] = useState("");
  const [tempCustomEnd, setTempCustomEnd] = useState("");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [customApplied, setCustomApplied] = useState(false);
  const [mqttData, setMqttData] = useState({});
  const [lastSeen, setLastSeen] = useState({});
  const [chartData, setChartData] = useState({});
  const [historicalChartData, setHistoricalChartData] = useState({});
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [chartMode, setChartMode] = useState("separate");
  const [darkMode, setDarkMode] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [allSensors, setAllSensors] = useState([]);
  const visibleLocationSensors = allSensors.filter(s => s.locationVisible !== false);
  const [userCardPrefs, setUserCardPrefs] = useState({});
  const [userLocationPrefs, setUserLocationPrefs] = useState({});
 

          const toggleSensorCard = (name) => {
            setUserCardPrefs(prev => ({
              ...prev,
              [name]: !(prev[name] ?? true)
            }));
          };
          
          const toggleSensorLocation = (name) => {
            setUserLocationPrefs(prev => ({
              ...prev,
              [name]: !(prev[name] ?? true)
            }));
          };

          const visibleCardSensors = allSensors.filter(sensor => {
            const userPref = userCardPrefs[sensor.name];
            if (userPref === undefined) return sensor.cardVisible !== false;
            return userPref;
          });

          useEffect(() => {
            const savedCards = localStorage.getItem("userCardPrefs");
            if (savedCards) {
              setUserCardPrefs(JSON.parse(savedCards));
            } else {
              // Ak nie je v localStorage, použijeme odporúčané defaulty zo servera
              const defaults = {};
              allSensors.forEach(sensor => {
                defaults[sensor.name] = sensor.cardVisible !== false;
              });
              localStorage.setItem("userCardPrefs", JSON.stringify(defaults));
              setUserCardPrefs(defaults);
            }
          }, [allSensors]);
      
      useEffect(() => {
        localStorage.setItem("userCardPrefs", JSON.stringify(userCardPrefs));
      }, [userCardPrefs]);
      
      useEffect(() => {
        localStorage.setItem("userLocationPrefs", JSON.stringify(userLocationPrefs));
      }, [userLocationPrefs]);

     

  useEffect(() => {
    const interval = setInterval(() => {
      fetch("/api/sensors")
        .then(res => res.json())
        .then(data => setAllSensors(data))
        .catch(err => console.error("Chyba pri načítaní senzorov:", err));
    }, 5000); // každých 5 sekúnd
  
    return () => clearInterval(interval); // vyčistenie intervalu
  }, []);


  //Nacitavanie sensorov z DB API
  useEffect(() => {
    fetch("/api/sensors")
      .then(res => res.json())
      .then(data => {
        setAllSensors(data);
  
        // nastavíme výber lokácií len ak nie sú preferencie používateľa
        const hasUserPrefs = localStorage.getItem("userLocationPrefs");
        if (!hasUserPrefs) {
          const visible = data.filter(sensor => sensor.locationVisible !== false).map(sensor => sensor.name);
          setSelectedLocations(visible);
        }
      })
      .catch(err => console.error("Chyba pri načítaní senzorov:", err));
  }, []);

  //login API
  const [loggedIn, setLoggedIn] = useState(false);
  useEffect(() => {
  fetch('/api/session')
    .then(res => res.json())
    .then(data => setLoggedIn(data.loggedIn))
    .catch(() => setLoggedIn(false));
    } , []);
      
    const navigate = useNavigate();

      const handleLogout = async () => {
        try {
          await fetch("/api/logout", { method: "POST" });
          setLoggedIn(false);
          navigate("/"); // presmeruj na hlavnú stránku
        } catch (err) {
          console.error("Chyba pri odhlasovaní:", err);
        }
      };

  // Prahy (teplota, vlhkosť, tlak)
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);

  // Prahy pre heatmap
  const [heatmapThresholds, setHeatmapThresholds] = useState({
    min: 10,
    mid: 20,
    high: 30,
    colorMin: "#B3E6FF",
    colorMid: "#FFFF99",
    colorHigh: "#FF9999",
  });

  // Komponent karty pre agregáciu
  function AggregationCard({ type, value, time }) {
    const typeMap = {
      min: { icon: "🌡️", label: "Min", color: "text-blue-500" },
      avg: { icon: "📊", label: "Avg", color: "text-green-500" },
      max: { icon: "🔺", label: "Max", color: "text-red-500" },
    };
    const { icon, label, color } = typeMap[type];
    const isValueNull = value === null || value === "N/A" || isNaN(value);
    return (
      <div className="flex flex-col items-start bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-sm w-full">
        <div className={`text-sm font-semibold ${color}`}>
          {icon} {label}
        </div>
        {isValueNull ? (
          <p className="text-xs text-gray-500 mt-1">Žiadne dáta</p>
        ) : (
          <>
            <p className="text-lg font-bold text-gray-800 dark:text-white">
              {Number(value).toFixed(2)} °C
            </p>
            {time && (
              <p className="text-xs text-gray-500 mt-1">
                {new Date(time).toLocaleString()}
              </p>
            )}
          </>
        )}
      </div>
    );
  }

  // Príprava dát pre heatmapu
  const heatmapSeries = useMemo(() => {
    if (selectedLocations.length === 0 || rangeKey === "live") return [];
    const sensor = selectedLocations[0];
    const data = historicalChartData[sensor]?.["teplota"] || [];
    if (rangeKey === "365d" || rangeKey === "30d" || rangeKey === "custom") {
      return prepareDailyHeatmapData(data);
    }
    const aggregatorWindow = HEATMAP_AGGREGATORS[rangeKey] || "1h";
    return prepareHeatmapData(data, aggregatorWindow);
  }, [selectedLocations, historicalChartData, rangeKey]);

  const MIN_CELL_WIDTH = 30;
  const dynamicHeatmapWidth =
    rangeKey === "365d" && heatmapSeries.length > 0
      ? Math.max(windowWidth, heatmapSeries[0].data.length * MIN_CELL_WIDTH)
      : undefined;
    
  const toggleLocation = (loc) => {
    if (selectedLocations.includes(loc)) {
      setSelectedLocations(selectedLocations.filter((l) => l !== loc));
    } else {
      setSelectedLocations([...selectedLocations, loc]);
    }
  };

  const getStatusColor = (temp) => {
    if (isNaN(temp)) return "transparent";
    if (temp <= thresholds.teplota.mid) return "#34D399";
    else if (temp <= thresholds.teplota.high) return "#F1C40F";
    else return "#E74C3C";
  };

  // Viditeľné grafy
  const [visibleGraphs, setVisibleGraphs] = useState({
    teplota: true,
    vlhkost: true,
    tlak: true,
    koberec: false,
  });

  // Prepínač matrix/calendar
  const [heatmapType, setHeatmapType] = useState("matrix");

  // Stavy pre bočný panel
  const [showHeatmapSettings, setShowHeatmapSettings] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);

  // Stavy pre prahové nastavenia T/V/P
  const [showTempThresholds, setShowTempThresholds] = useState(false);
  const [showHumidityThresholds, setShowHumidityThresholds] = useState(false);
  const [showPressureThresholds, setShowPressureThresholds] = useState(false);

  // Zapnúť / vypnúť zobrazovanie prahov
  const [displayThresholds, setDisplayThresholds] = useState(true);

  // Či zobrazovať menovky dní v heatmape
  const [showHeatmapXLabels, setShowHeatmapXLabels] = useState(true);

  // Agregačné nastavenia
  const [aggregationOptions, setAggregationOptions] = useState({
    min: false,
    avg: false,
    max: false,
  });

  useEffect(() => {
    const savedSettings = localStorage.getItem("dashboardSettings");
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      if (settings.rangeKey) setRangeKey(settings.rangeKey);
      if (settings.selectedLocations) setSelectedLocations(settings.selectedLocations);
      if (settings.chartMode) setChartMode(settings.chartMode);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "dashboardSettings",
      JSON.stringify({ rangeKey, selectedLocations, chartMode })
    );
  }, [rangeKey, selectedLocations, chartMode]);

  useEffect(() => {
    const stored = localStorage.getItem("thresholds");
    if (stored) setThresholds(JSON.parse(stored));
  }, []);
  useEffect(() => {
    localStorage.setItem("thresholds", JSON.stringify(thresholds));
  }, [thresholds]);

  useEffect(() => {
    setAutoRefresh(rangeKey === "live");
  }, [rangeKey]);

  useEffect(() => {
    if (rangeKey === "custom") {
      setHeatmapType("calendar");
    } else if (rangeKey === "30d" || rangeKey === "365d") {
      setHeatmapType("calendar");
    } else {
      setHeatmapType("matrix");
    }
  }, [rangeKey, customStart, customEnd]);

  const isMultiYear =
    rangeKey === "custom" &&
    customStart &&
    customEnd &&
    new Date(customEnd).getFullYear() - new Date(customStart).getFullYear() >= 1;

  // Načítanie lokácií zo InfluxDB
  useEffect(() => {
    const query = `import "influxdata/influxdb/schema"
schema.tagValues(bucket: "${BUCKET}", tag: "location")`;
    fetch(`${INFLUX_URL}/api/v2/query?org=${ORG}`, {
      method: "POST",
      headers: {
        Authorization: `Token ${INFLUX_TOKEN}`,
        "Content-Type": "application/vnd.flux",
        Accept: "application/csv",
      },
      body: query,
    })
      .then((res) => res.text())
      .then((text) => {
        const values = [
          ...new Set(
            text
              .split("\n")
              .filter((l) => l && !l.startsWith("#"))
              .map((l) => {
                const parts = l.split(",");
                return parts[parts.length - 1]?.trim();
              })
          ),
        ].filter((loc) => loc !== "_value" && loc !== "test");
        setLocations(values);
        setLoadingLocations(false);
      });
  }, []);

  // LIVE režim s MQTT dátami
  useEffect(() => {
    if (rangeKey !== "live") return;
    const client = mqtt.connect("ws://192.168.155.206:9001");
    client.on("connect", () => client.subscribe("senzory/bme280"));
    client.on("message", (_, message) => {
      if (!autoRefresh) return;
      try {
        const data = JSON.parse(message.toString());
        if (data.location) {
          setMqttData((prev) => ({ ...prev, [data.location]: data }));
          setLastSeen((prev) => ({ ...prev, [data.location]: Date.now() }));
          setChartData((prev) => {
            const now = new Date();
            const updated = { ...prev };
            updated[data.location] = updated[data.location] || {};
            FIELDS.forEach((field) => {
              const value = parseFloat(data[field]);
              if (!isNaN(value)) {
                const entry = { time: now.getTime(), value };
                const fieldData = (updated[data.location][field] || []).filter(
                  (d) => now.getTime() - d.time < 5 * 60 * 1000
                );
                updated[data.location][field] = [...fieldData, entry];
              }
            });
            return updated;
          });
        }
      } catch (e) {
        console.error("Chyba pri parsovaní MQTT správy:", e);
      }
    });
    return () => client.end();
  }, [autoRefresh, rangeKey]);

  // Načítanie historických dát z InfluxDB s úpravou pre rozsahy 30 dní a viac
  useEffect(() => {
    if (rangeKey === "live") return;
    let startTime = null;
    let endTime = null;
    let interval = "";
    if (rangeKey === "custom") {
      const isoStart = toIsoOrNull(customStart);
      const isoEnd = toIsoOrNull(customEnd);
      if (!isoStart || !isoEnd || !customApplied) return;
      startTime = new Date(isoStart).getTime();
      endTime = new Date(isoEnd).getTime();
      interval = RANGES.custom.interval;
    } else {
      endTime = Date.now();
      startTime = endTime + parseFluxToMs(RANGES[rangeKey].flux);
      interval = RANGES[rangeKey].interval;
    }
    const intervalMs = parseIntervalToMs(interval);

    selectedLocations.forEach((location) => {
      FIELDS.forEach((field) => {
        let query = "";
        // Ak je rozsah "custom", "30d" alebo "365d", použijeme agregáciu na dennej báze
        if (rangeKey === "custom" || rangeKey === "30d" || rangeKey === "365d") {
          query = `
            from(bucket: "${BUCKET}")
              |> range(start: time(v: "${new Date(startTime).toISOString()}"), stop: time(v: "${new Date(endTime).toISOString()}"))
              |> filter(fn: (r) => r._measurement == "bme280" and r["location"] == "${location}")
              |> filter(fn: (r) => r._field == "${field}")
              |> aggregateWindow(every: 1d, fn: mean, createEmpty: false)
              |> yield(name: "daily_mean")
          `;
        } else {
          query = `
            from(bucket: "${BUCKET}")
              |> range(start: ${RANGES[rangeKey].flux})
              |> filter(fn: (r) => r._measurement == "bme280" and r["location"] == "${location}")
              |> filter(fn: (r) => r._field == "${field}")
              |> aggregateWindow(every: ${RANGES[rangeKey].interval}, fn: mean, createEmpty: false)
              |> yield(name: "mean")
          `;
        }

        fetch(`${INFLUX_URL}/api/v2/query?org=${ORG}`, {
          method: "POST",
          headers: {
            Authorization: `Token ${INFLUX_TOKEN}`,
            "Content-Type": "application/vnd.flux",
            Accept: "application/csv",
          },
          body: query,
        })
          .then((res) => res.text())
          .then((text) => {
            const lines = text.split("\n").filter((l) => l && !l.startsWith("#"));
            if (lines.length < 2) {
              const dayMs = 24 * 60 * 60 * 1000;
              const noDataFilled = fillDataGaps([], startTime, endTime, dayMs);
              setHistoricalChartData((prev) => ({
                ...prev,
                [location]: {
                  ...(prev[location] || {}),
                  [field]: noDataFilled,
                },
              }));
              return;
            }
            const headers = lines[0].split(",");
            const timeIndex = headers.indexOf("_time");
            const valueIndex = headers.indexOf("_value");
            if (timeIndex === -1 || valueIndex === -1) return;

            let parsed = lines.slice(1).map((line) => {
              const parts = line.split(",");
              const timestamp = parts[timeIndex]?.trim();
              const t =
                timestamp && !isNaN(Date.parse(timestamp))
                  ? new Date(timestamp).getTime()
                  : null;
              const value = parseFloat(parts[valueIndex]);
              return { time: t, value };
            });
            parsed = parsed.filter((p) => p.time);
            parsed.sort((a, b) => a.time - b.time);

            // Ak ide o 30d, 365d alebo custom, nastavíme gapInterval na 24 hodín
            let gapInterval = intervalMs;
            if (rangeKey === "custom" || rangeKey === "30d" || rangeKey === "365d") {
              gapInterval = 24 * 60 * 60 * 1000;
            }
            const filled = fillDataGaps(parsed, startTime, endTime, gapInterval);
            setHistoricalChartData((prev) => ({
              ...prev,
              [location]: {
                ...(prev[location] || {}),
                [field]: filled,
              },
            }));
          });
      });
    });
  }, [selectedLocations, rangeKey, customStart, customEnd, customApplied]);
  
  const mergedApexSeries = useMemo(() => {
    const seriesList = [];
    selectedLocations.forEach((loc) => {
      FIELDS.forEach((field) => {
        if (rangeKey === "live") {
          const liveData = chartData[loc]?.[field] || [];
          seriesList.push({
            name: `${loc} ${field} (${field === "teplota" ? "°C" : field === "vlhkost" ? "%" : "hPa"})`,
            data: liveData.map((d) => ({ x: d.time, y: d.value })),
          });
        } else {
          const data = historicalChartData[loc]?.[field] || [];
          seriesList.push({
            name: `${loc} ${field} (hist.)`,
            data: data.map((d) => ({ x: d.time, y: d.value })),
          });
        }
      });
    });
    return seriesList;
  }, [selectedLocations, chartData, historicalChartData, rangeKey]);

  const enabledFields = Object.keys(visibleGraphs).filter(
    (key) => key !== "koberec" && visibleGraphs[key]
  );
  const filteredMergedSeries = mergedApexSeries.filter((series) =>
    enabledFields.some((field) => series.name.toLowerCase().includes(field))
  );

  // Funkcia pre senzorové karty – upravená iba pre zmenu timestampu v fallback režime
const sensorCards = selectedLocations.map((loc) => {
  let data = null;
  let isActive = false;
  const fallbackMessage = "Údaj dostupný iba v LIVE rozsahu";

  if (rangeKey === "live") {
    data = mqttData[loc];
    isActive = lastSeen[loc] && Date.now() - lastSeen[loc] < 60_000;

    // Ak nie sú dostupné MQTT dáta, skúsi použiť posledný záznam z DB
    if (!data || Object.keys(data).length <= 1) {
      const fallback = {};
      if (historicalChartData[loc]) {
        FIELDS.forEach((field) => {
          const arr = historicalChartData[loc][field];
          if (arr && arr.length > 0) {
            const last = arr[arr.length - 1];
            fallback[field] = last.value;
            fallback.time = last.time;
          }
        });
      }
      if (Object.keys(fallback).length > 0) {
        data = fallback;
      }
    }
  } else {
    // Pre iné rozsahy použijeme historické údaje (sensorové hodnoty sa zobrazia)
    if (historicalChartData[loc]) {
      FIELDS.forEach((field) => {
        const arr = historicalChartData[loc][field];
        if (arr && arr.length > 0) {
          data = data || {};
          data[field] = arr[arr.length - 1].value;
          data.time = arr[arr.length - 1].time;
        }
      });
    }
    isActive = data && Object.keys(data).length > 0;
  }

  // Ak nie je LIVE, namiesto timestampu sa zobrazí fallback správa
  const lastDateTime =
    rangeKey === "live" && lastSeen[loc]
      ? new Date(lastSeen[loc]).toLocaleString()
      : rangeKey === "live" && data && data.time
      ? new Date(data.time).toLocaleString()
      : fallbackMessage;

  // Výpočet a zobrazenie meraných hodnôt – nemeníme
  const tVal = parseFloat(data?.teplota);
  const tempDisplay =
    isNaN(tVal) || tVal === -1 ? "Žiadne údaje" : `${tVal.toFixed(2)} °C`;

  const hVal = parseFloat(data?.vlhkost);
  const humDisplay =
    isNaN(hVal) || hVal === -1 ? "Žiadne údaje" : `${hVal.toFixed(2)} %`;

  const pVal = parseFloat(data?.tlak);
  const presDisplay =
    isNaN(pVal) || pVal === -1 ? "Žiadne údaje" : `${pVal.toFixed(2)} hPa`;

  const sensorStyle = { overflow: "hidden", border: "2px solid" };
  if (loc.toUpperCase() === "IT OFFICE") sensorStyle.borderColor = "#3498db";
  else if (loc.toUpperCase() === "MARKETING") sensorStyle.borderColor = "#9b59b6";
  else if (loc.toUpperCase() === "IT SERVER ROOM")
    sensorStyle.borderColor = "#f39c12";
  else sensorStyle.borderColor = "#ccc";

  sensorStyle.borderTopWidth = "4px";
  sensorStyle.borderTopColor = isActive ? getStatusColor(tVal) : "#E74C3C";

  const cardBgClass =
    data && Object.keys(data).length > 0 ? "bg-white dark:bg-gray-800" : "bg-gray-300";

  return (
    <div
      key={loc}
      className={`w-64 p-4 rounded-xl shadow-md hover:shadow-xl transition-shadow duration-300 transform hover:scale-[1.02] ${cardBgClass} flex flex-col justify-between h-full`}
      style={sensorStyle}
      aria-label={`Senzor ${loc}`}
    >
      <h2 className="text-xl font-bold mb-2 flex items-center">
        <span
          className={`inline-block w-3 h-3 mr-2 rounded-full ${
            isActive ? "bg-green-600" : "bg-red-600"
          }`}
          title={isActive ? "Online" : "Offline"}
        ></span>
        {loc}
      </h2>
      <div className="space-y-2 text-sm">
        <div className="flex items-center">
          <span title="Teplota" className="mr-1">🌡️</span>
          <span>{tempDisplay}</span>
          <span className="ml-2">{getStateIcon("teplota", tVal, thresholds)}</span>
        </div>
        <div className="flex items-center">
          <span title="Vlhkosť" className="mr-1">💧</span>
          <span>{humDisplay}</span>
          <span className="ml-2">{getStateIcon("vlhkost", hVal, thresholds)}</span>
        </div>
        <div className="flex items-center">
          <span title="Tlak" className="mr-1">🧭</span>
          <span>{presDisplay}</span>
          <span className="ml-2">{getStateIcon("tlak", pVal, thresholds)}</span>
        </div>
        <div className="flex items-center">
          <span title="Posledný záznam" className="mr-1">🕒</span>
          <span>{lastDateTime}</span>
        </div>
      </div>
    </div>
  );
});

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <header className="bg-blue-600 text-white py-6 shadow-md">
          <div className="container mx-auto px-4 flex flex-wrap items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarVisible(!sidebarVisible)}
                className="px-4 py-2 bg-blue-500 rounded hover:bg-blue-700"
                title="Prepnúť bočný panel"
              >
                ☰
              </button>
              <h1 className="text-3xl font-bold">T-Monitor europlac</h1>
            </div>
            <div className="flex gap-4 items-center">
              {loggedIn ? (
                <>
                  <Link to="/admin" className="text-white underline hover:text-gray-200">Admin</Link>
                  <button
                    onClick={handleLogout}
                    className="text-white underline hover:text-gray-200"
                    title="Odhlásiť"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <Link to="/login" className="text-white underline hover:text-gray-200">Login</Link>
              )}
            </div>
          </div>
        </header>

        <div className="flex">
          {sidebarVisible && (
            <aside
              className="w-64 p-4 bg-gray-100 dark:bg-gray-800"
              style={{ position: "sticky", top: 0, maxHeight: "100vh", overflowY: "auto" }}
            >
              <h2 className="text-lg font-semibold mb-4">Zobrazenie grafov</h2>
              {Object.entries(visibleGraphs).map(([key, value]) => (
                <div key={key} className="flex items-center mb-2">
                  <input
                    type="checkbox"
                    id={key}
                    checked={value}
                    onChange={(e) => {
                      if (key === "koberec") {
                        if (e.target.checked) {
                          setVisibleGraphs({ teplota: false, vlhkost: false, tlak: false, koberec: true });
                          setChartMode("separate");
                          setSelectedLocations([]);
                          alert("Kobercový graf je zapnutý. Prosím, vyberte si lokáciu a rozsah.");
                        } else {
                          setVisibleGraphs({ teplota: true, vlhkost: true, tlak: true, koberec: false });
                        }
                      } else {
                        if (visibleGraphs.koberec) {
                          alert("Pre úpravu ostatných grafov vypnite najskôr kobercový graf.");
                        } else {
                          setVisibleGraphs((prev) => ({ ...prev, [key]: e.target.checked }));
                        }
                      }
                    }}
                    className="form-checkbox"
                  />
                  <label htmlFor={key} className="ml-2 capitalize">
                    {key === "teplota"
                      ? "🌡️ Teplota"
                      : key === "vlhkost"
                      ? "💧 Vlhkosť"
                      : key === "tlak"
                      ? "🧭 Tlak"
                      : "📊 Kobercový graf"}
                  </label>
                </div>
              ))}

              <div className="mt-4">
                <h2 className="text-lg font-semibold mb-2">Agregácie</h2>
                <div className="flex items-center mb-2">
                  <input
                    type="checkbox"
                    id="agg-min"
                    checked={aggregationOptions.min}
                    onChange={(e) => setAggregationOptions({ ...aggregationOptions, min: e.target.checked })}
                    className="form-checkbox"
                  />
                  <label htmlFor="agg-min" className="ml-2 flex items-center">
                    <span>Min</span>
                    <span className="ml-1">📉</span>
                  </label>
                </div>
                <div className="flex items-center mb-2">
                  <input
                    type="checkbox"
                    id="agg-avg"
                    checked={aggregationOptions.avg}
                    onChange={(e) => setAggregationOptions({ ...aggregationOptions, avg: e.target.checked })}
                    className="form-checkbox"
                  />
                  <label htmlFor="agg-avg" className="ml-2 flex items-center">
                    <span>Avg</span>
                    <span className="ml-1">📊</span>
                  </label>
                </div>
                <div className="flex items-center mb-2">
                  <input
                    type="checkbox"
                    id="agg-max"
                    checked={aggregationOptions.max}
                    onChange={(e) => setAggregationOptions({ ...aggregationOptions, max: e.target.checked })}
                    className="form-checkbox"
                  />
                  <label htmlFor="agg-max" className="ml-2 flex items-center">
                    <span>Max</span>
                    <span className="ml-1">📈</span>
                  </label>
                </div>
              </div>

              <div className="mt-4">
                <button
                  onClick={() => setShowHeatmapSettings((prev) => !prev)}
                  className="px-4 py-2 rounded bg-green-500 text-white shadow"
                >
                  Zobraziť nastavenia kobercového grafu
                </button>
                {showHeatmapSettings && (
                  <div className="mt-2">
                    <h3 className="font-semibold mb-2">Nastavenia kobercového grafu (3 pásma)</h3>
                    <div className="flex items-center gap-2 mb-2">
                      <label>Min:</label>
                      <input
                        type="number"
                        value={heatmapThresholds.min}
                        onChange={(e) =>
                          setHeatmapThresholds({ ...heatmapThresholds, min: parseFloat(e.target.value) })
                        }
                        className="border rounded px-2 py-1 w-16"
                      />
                      <input
                        type="color"
                        value={heatmapThresholds.colorMin}
                        onChange={(e) =>
                          setHeatmapThresholds({ ...heatmapThresholds, colorMin: e.target.value })
                        }
                        className="border rounded px-2 py-1"
                      />
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <label>Mid:</label>
                      <input
                        type="number"
                        value={heatmapThresholds.mid}
                        onChange={(e) =>
                          setHeatmapThresholds({ ...heatmapThresholds, mid: parseFloat(e.target.value) })
                        }
                        className="border rounded px-2 py-1 w-16"
                      />
                      <input
                        type="color"
                        value={heatmapThresholds.colorMid}
                        onChange={(e) =>
                          setHeatmapThresholds({ ...heatmapThresholds, colorMid: e.target.value })
                        }
                        className="border rounded px-2 py-1"
                      />
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <label>High:</label>
                      <input
                        type="number"
                        value={heatmapThresholds.high}
                        onChange={(e) =>
                          setHeatmapThresholds({ ...heatmapThresholds, high: parseFloat(e.target.value) })
                        }
                        className="border rounded px-2 py-1 w-16"
                      />
                      <input
                        type="color"
                        value={heatmapThresholds.colorHigh}
                        onChange={(e) =>
                          setHeatmapThresholds({ ...heatmapThresholds, colorHigh: e.target.value })
                        }
                        className="border rounded px-2 py-1"
                      />
                    </div>
                    <div className="mt-4">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={showHeatmapXLabels}
                          onChange={(e) => setShowHeatmapXLabels(e.target.checked)}
                        />
                        <span>Zobraziť popisky dní</span>
                      </label>
                    </div>
                    <div className="mt-4">
                      <button
                        onClick={() => setHeatmapType((prev) => (prev === "matrix" ? "calendar" : "matrix"))}
                        className="px-4 py-2 rounded bg-indigo-500 text-white shadow"
                        title="Prepnúť typ heatmapy"
                      >
                        {heatmapType === "matrix" ? "Prepnúť na Calendar Heatmap" : "Prepnúť na Matrix Heatmap"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4">
                <button
                  onClick={() => setShowTempThresholds((prev) => !prev)}
                  className="px-4 py-2 rounded bg-purple-500 text-white shadow"
                >
                  {showTempThresholds ? "Skryť nastavenia prahov pre teplotu" : "Zobraziť nastavenia prahov pre teplotu"}
                </button>
                {showTempThresholds && (
                  <div className="mt-2 space-y-2">
                    <h3 className="font-semibold">Teplota – 3 pásma</h3>
                    <div className="flex items-center gap-2">
                      <label>Min:</label>
                      <input
                        type="number"
                        value={thresholds.teplota.min}
                        onChange={(e) =>
                          setThresholds((prev) => ({
                            ...prev,
                            teplota: { ...prev.teplota, min: parseFloat(e.target.value) },
                          }))
                        }
                        className="border rounded px-2 py-1 w-16"
                      />
                      <input
                        type="color"
                        value={thresholds.teplota.colorMin}
                        onChange={(e) =>
                          setThresholds((prev) => ({
                            ...prev,
                            teplota: { ...prev.teplota, colorMin: e.target.value },
                          }))
                        }
                        className="border rounded px-1 py-1"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label>Mid:</label>
                      <input
                        type="number"
                        value={thresholds.teplota.mid}
                        onChange={(e) =>
                          setThresholds((prev) => ({
                            ...prev,
                            teplota: { ...prev.teplota, mid: parseFloat(e.target.value) },
                          }))
                        }
                        className="border rounded px-2 py-1 w-16"
                      />
                      <input
                        type="color"
                        value={thresholds.teplota.colorMid}
                        onChange={(e) =>
                          setThresholds((prev) => ({
                            ...prev,
                            teplota: { ...prev.teplota, colorMid: e.target.value },
                          }))
                        }
                        className="border rounded px-1 py-1"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label>High:</label>
                      <input
                        type="number"
                        value={thresholds.teplota.high}
                        onChange={(e) =>
                          setThresholds((prev) => ({
                            ...prev,
                            teplota: { ...prev.teplota, high: parseFloat(e.target.value) },
                          }))
                        }
                        className="border rounded px-2 py-1 w-16"
                      />
                      <input
                        type="color"
                        value={thresholds.teplota.colorHigh}
                        onChange={(e) =>
                          setThresholds((prev) => ({
                            ...prev,
                            teplota: { ...prev.teplota, colorHigh: e.target.value },
                          }))
                        }
                        className="border rounded px-1 py-1"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4">
                <button
                  onClick={() => setShowHumidityThresholds((prev) => !prev)}
                  className="px-4 py-2 rounded bg-purple-500 text-white shadow"
                >
                  {showHumidityThresholds ? "Skryť nastavenia prahov pre vlhkosť" : "Zobraziť nastavenia prahov pre vlhkosť"}
                </button>
                {showHumidityThresholds && (
                  <div className="mt-2 space-y-2">
                    <h3 className="font-semibold">Vlhkosť – 3 pásma</h3>
                    <div className="flex items-center gap-2">
                      <label>Min:</label>
                      <input
                        type="number"
                        value={thresholds.vlhkost.min}
                        onChange={(e) =>
                          setThresholds((prev) => ({
                            ...prev,
                            vlhkost: { ...prev.vlhkost, min: parseFloat(e.target.value) },
                          }))
                        }
                        className="border rounded px-2 py-1 w-16"
                      />
                      <input
                        type="color"
                        value={thresholds.vlhkost.colorMin}
                        onChange={(e) =>
                          setThresholds((prev) => ({
                            ...prev,
                            vlhkost: { ...prev.vlhkost, colorMin: e.target.value },
                          }))
                        }
                        className="border rounded px-1 py-1"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label>Mid:</label>
                      <input
                        type="number"
                        value={thresholds.vlhkost.mid}
                        onChange={(e) =>
                          setThresholds((prev) => ({
                            ...prev,
                            vlhkost: { ...prev.vlhkost, mid: parseFloat(e.target.value) },
                          }))
                        }
                        className="border rounded px-2 py-1 w-16"
                      />
                      <input
                        type="color"
                        value={thresholds.vlhkost.colorMid}
                        onChange={(e) =>
                          setThresholds((prev) => ({
                            ...prev,
                            vlhkost: { ...prev.vlhkost, colorMid: e.target.value },
                          }))
                        }
                        className="border rounded px-1 py-1"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label>High:</label>
                      <input
                        type="number"
                        value={thresholds.vlhkost.high}
                        onChange={(e) =>
                          setThresholds((prev) => ({
                            ...prev,
                            vlhkost: { ...prev.vlhkost, high: parseFloat(e.target.value) },
                          }))
                        }
                        className="border rounded px-2 py-1 w-16"
                      />
                      <input
                        type="color"
                        value={thresholds.vlhkost.colorHigh}
                        onChange={(e) =>
                          setThresholds((prev) => ({
                            ...prev,
                            vlhkost: { ...prev.vlhkost, colorHigh: e.target.value },
                          }))
                        }
                        className="border rounded px-1 py-1"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4">
                <button
                  onClick={() => setShowPressureThresholds((prev) => !prev)}
                  className="px-4 py-2 rounded bg-purple-500 text-white shadow"
                >
                  {showPressureThresholds ? "Skryť nastavenia prahov pre tlak" : "Zobraziť nastavenia prahov pre tlak"}
                </button>
                {showPressureThresholds && (
                  <div className="mt-2 space-y-2">
                    <h3 className="font-semibold">Tlak – 3 pásma</h3>
                    <div className="flex items-center gap-2">
                      <label>Min:</label>
                      <input
                        type="number"
                        value={thresholds.tlak.min}
                        onChange={(e) =>
                          setThresholds((prev) => ({
                            ...prev,
                            tlak: { ...prev.tlak, min: parseFloat(e.target.value) },
                          }))
                        }
                        className="border rounded px-2 py-1 w-16"
                      />
                      <input
                        type="color"
                        value={thresholds.tlak.colorMin}
                        onChange={(e) =>
                          setThresholds((prev) => ({
                            ...prev,
                            tlak: { ...prev.tlak, colorMin: e.target.value },
                          }))
                        }
                        className="border rounded px-1 py-1"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label>Mid:</label>
                      <input
                        type="number"
                        value={thresholds.tlak.mid}
                        onChange={(e) =>
                          setThresholds((prev) => ({
                            ...prev,
                            tlak: { ...prev.tlak, mid: parseFloat(e.target.value) },
                          }))
                        }
                        className="border rounded px-2 py-1 w-16"
                      />
                      <input
                        type="color"
                        value={thresholds.tlak.colorMid}
                        onChange={(e) =>
                          setThresholds((prev) => ({
                            ...prev,
                            tlak: { ...prev.tlak, colorMid: e.target.value },
                          }))
                        }
                        className="border rounded px-1 py-1"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label>High:</label>
                      <input
                        type="number"
                        value={thresholds.tlak.high}
                        onChange={(e) =>
                          setThresholds((prev) => ({
                            ...prev,
                            tlak: { ...prev.tlak, high: parseFloat(e.target.value) },
                          }))
                        }
                        className="border rounded px-2 py-1 w-16"
                      />
                      <input
                        type="color"
                        value={thresholds.tlak.colorHigh}
                        onChange={(e) =>
                          setThresholds((prev) => ({
                            ...prev,
                            tlak: { ...prev.tlak, colorHigh: e.target.value },
                          }))
                        }
                        className="border rounded px-1 py-1"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4">
                <button
                  onClick={() => setDisplayThresholds((prev) => !prev)}
                  className="px-4 py-2 rounded bg-indigo-500 text-white shadow"
                  title="Zobraziť alebo skryť prahové hodnoty v grafe"
                >
                  {displayThresholds ? "Skryť prahové hodnoty v grafe" : "Zobraziť prahové hodnoty v grafe"}
                </button>
              </div>
            </aside>
          )}

          <main className="flex-1">
            <div className="bg-gray-200 dark:bg-gray-800 py-2 shadow-inner">
              <div className="container mx-auto px-4 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setDarkMode((prev) => !prev)}
                  className="inline-flex items-center bg-gray-300 dark:bg-gray-700 rounded-full px-3 py-1 text-sm text-blue-600 shadow"
                  title="Prepnúť medzi tmavým a svetlým režimom"
                >
                  <span className="mr-1">🌙</span>
                  {darkMode ? "Svetlý režim" : "Tmavý režim"}
                </button>
                <button
                  onClick={() => setAutoRefresh((prev) => !prev)}
                  disabled={rangeKey !== "live"}
                  className="inline-flex items-center bg-gray-300 dark:bg-gray-700 rounded-full px-3 py-1 text-sm text-blue-600 shadow"
                  title="Zapnúť alebo vypnúť automatické načítavanie dát"
                >
                  <span className="mr-1">🔁</span>
                  {autoRefresh ? "Auto-refresh: Zapnutý" : "Auto-refresh: Vypnutý"}
                </button>
              </div>
            </div>

            <section className="container mx-auto px-4 py-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 bg-white dark:bg-gray-900 p-4 rounded shadow">
                  <h2 className="text-lg font-medium mb-2">Vyberte lokácie:</h2>
                  <div className="flex gap-2 mb-3 flex-wrap">
                    <button
                      onClick={() => setSelectedLocations(locations)}
                      className="px-4 py-2 rounded bg-white text-blue-600 shadow"
                      title="Vyberie všetky lokácie"
                    >
                      Vybrať všetky
                    </button>
                    <button
                      onClick={() => setSelectedLocations([])}
                      className="px-4 py-2 rounded bg-white text-blue-600 shadow"
                      title="Zruší výber všetkých lokácií"
                    >
                      Zrušiť výber všetkých
                    </button>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                  {visibleLocationSensors.map(({ name }) => (
                    <button
                      key={name}
                      onClick={() => toggleLocation(name)}
                      className={`px-4 py-2 rounded shadow ${
                        selectedLocations.includes(name)
                          ? "bg-blue-600 text-white"
                          : "bg-white text-blue-600 border"
                      }`}
                      title={name}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                </div>

                <div className="flex-1 bg-white dark:bg-gray-900 p-4 rounded shadow">
                  <h2 className="text-lg font-medium mb-2">Rozsahy</h2>
                  <div className="flex gap-2 flex-wrap">
                    {["live", "1h", "6h", "24h", "7d", "30d", "365d", "custom"].map((range) => (
                      <button
                        key={range}
                        onClick={() => {
                          setRangeKey(range);
                          if (range === "custom") setCustomApplied(false);
                        }}
                        className={`inline-flex items-center ${
                          rangeKey === range ? "bg-blue-600 text-white" : "bg-white text-blue-600 border"
                        } rounded-full px-4 py-2 text-sm shadow`}
                        title={
                          range === "custom"
                            ? "Zadajte vlastný časový interval"
                            : `Nastaviť rozsah ${range.toUpperCase()}`
                        }
                      >
                        {range === "live" ? "🟢 " : "🕒 "}
                        {range.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  {rangeKey === "custom" && (
                    <div className="mt-4 flex flex-wrap gap-2 items-center">
                      <label className="text-sm">Od:</label>
                      <input
                        type="datetime-local"
                        className="border rounded px-2 py-1 text-sm"
                        value={tempCustomStart}
                        onChange={(e) => setTempCustomStart(e.target.value)}
                      />
                      <label className="text-sm">Do:</label>
                      <input
                        type="datetime-local"
                        className="border rounded px-2 py-1 text-sm"
                        value={tempCustomEnd}
                        onChange={(e) => setTempCustomEnd(e.target.value)}
                      />
                      <button
                        onClick={() => {
                          setCustomStart(tempCustomStart);
                          setCustomEnd(tempCustomEnd);
                          setCustomApplied(true);
                        }}
                        className="px-4 py-2 rounded bg-green-500 text-white shadow text-sm"
                        title="Aplikovať vlastný časový interval"
                      >
                        Aplikovať
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex-1 bg-white dark:bg-gray-900 p-4 rounded shadow">
                  <h2 className="text-lg font-medium mb-2">Zobrazenie grafov</h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setChartMode("merged")}
                      className={`inline-flex items-center ${
                        chartMode === "merged" ? "bg-blue-600 text-white" : "bg-white text-blue-600 border"
                      } rounded-full px-4 py-2 text-sm shadow`}
                      title="Zlúčiť všetky dáta do jedného grafu"
                    >
                      📊 Zlúčený graf
                    </button>
                    <button
                      onClick={() => setChartMode("separate")}
                      className={`inline-flex items-center ${
                        chartMode === "separate" ? "bg-blue-600 text-white" : "bg-white text-blue-600 border"
                      } rounded-full px-4 py-2 text-sm shadow`}
                      title="Zobraziť každý senzor zvlášť"
                    >
                      📈 Separátne grafy
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section className="container mx-auto px-4 mb-8 flex flex-wrap gap-4">
              {sensorCards}
            </section>

            <section className="container mx-auto px-4 py-4">
              {chartMode === "separate" ? (
                FIELDS.filter((field) => visibleGraphs[field]).map((field) => {
                  const sensorSeries = selectedLocations.map((loc) => {
                    if (rangeKey === "live") {
                      const data = chartData[loc]?.[field] || [];
                      return { name: loc, data: data.map((d) => ({ x: d.time, y: d.value })) };
                    } else {
                      const data = historicalChartData[loc]?.[field] || [];
                      return { name: `${loc}-historical`, data: data.map((d) => ({ x: d.time, y: d.value })) };
                    }
                  });
                  let minVal = null;
                  let avgVal = null;
                  let maxVal = null;
                  let minTime = null;
                  let maxTime = null;
                  if (aggregationOptions.min || aggregationOptions.avg || aggregationOptions.max) {
                    const { min, avg, max, minTime: mT, maxTime: MxT } = computeOverallAggregations(sensorSeries);
                    minVal = min;
                    avgVal = avg;
                    maxVal = max;
                    minTime = mT;
                    maxTime = MxT;
                  }
                  return (
                    <div key={field} className="mb-8 bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                      <ApexChart
                        title={field}
                        series={sensorSeries}
                        chartType="line"
                        fieldName={field}
                        thresholds={thresholds}
                        displayThresholds={displayThresholds}
                      />
                      {(aggregationOptions.min || aggregationOptions.avg || aggregationOptions.max) && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                          {aggregationOptions.min && (
                            <AggregationCard type="min" value={minVal} time={minTime} />
                          )}
                          {aggregationOptions.avg && (
                            <AggregationCard type="avg" value={avgVal} time={null} />
                          )}
                          {aggregationOptions.max && (
                            <AggregationCard type="max" value={maxVal} time={maxTime} />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                (() => {
                  const mergedChartSeries = filteredMergedSeries;
                  const aggregatedCards = FIELDS.filter((field) => visibleGraphs[field]).map((field) => {
                    const seriesForField = mergedChartSeries.filter((s) =>
                      s.name.toLowerCase().includes(field)
                    );
                    if (seriesForField.length === 0) return null;
                    let minVal = null;
                    let avgVal = null;
                    let maxVal = null;
                    let minTime = null;
                    let maxTime = null;
                    if (aggregationOptions.min || aggregationOptions.avg || aggregationOptions.max) {
                      const { min, avg, max, minTime: mT, maxTime: MxT } = computeOverallAggregations(seriesForField);
                      minVal = min;
                      avgVal = avg;
                      maxVal = max;
                      minTime = mT;
                      maxTime = MxT;
                    }
                    return (
                      <div key={field} className="mb-4">
                        <h3 className="text-lg font-semibold mb-2 capitalize">{field}</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          {aggregationOptions.min && (
                            <AggregationCard type="min" value={minVal} time={minTime} />
                          )}
                          {aggregationOptions.avg && (
                            <AggregationCard type="avg" value={avgVal} time={null} />
                          )}
                          {aggregationOptions.max && (
                            <AggregationCard type="max" value={maxVal} time={maxTime} />
                          )}
                        </div>
                      </div>
                    );
                  });
                  return (
                    <div className="mb-8 bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                      <ApexChart
                        title="Zlúčený graf"
                        series={mergedChartSeries}
                        chartType="line"
                        fieldName={null}
                        thresholds={thresholds}
                        displayThresholds={displayThresholds}
                      />
                      {(aggregationOptions.min || aggregationOptions.avg || aggregationOptions.max) && (
                        <div className="mt-4">{aggregatedCards}</div>
                      )}
                    </div>
                  );
                })()
              )}

              {visibleGraphs.koberec && (
                <div className="mb-8 bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  {heatmapType === "matrix" ? (
                    <ApexChart
                      title="Kobercový graf - Matrix Heatmap"
                      series={heatmapSeries}
                      chartType="heatmap"
                      thresholds={heatmapThresholds}
                      customHeight={rangeKey === "365d" ? windowHeight * 0.95 : 400}
                      customWidth={rangeKey === "365d" ? dynamicHeatmapWidth : undefined}
                      allowFullScreen={rangeKey === "365d"}
                      showXAxisLabels={showHeatmapXLabels}
                    />
                  ) : (
                    <>
                      {isMultiYear ? (
                        Object.entries(splitDataByYear(prepareCalendarData(heatmapSeries), customStart, customEnd)).map(
                          ([year, yearData]) => (
                            <LazyYearHeatmap
                              key={year}
                              year={year}
                              data={yearData && yearData.length > 0 ? yearData : []}
                              thresholds={heatmapThresholds}
                              fixedDays={365}
                            />
                          )
                        )
                      ) : (
                        (() => {
                          const calendarData = prepareCalendarData(heatmapSeries);
                          return calendarData && calendarData.length > 0 ? (
                            <CalendarHeatmapChart
                              data={calendarData}
                              startDate={getCalendarStart(rangeKey)}
                              thresholds={heatmapThresholds}
                              fixedDays={365}
                            />
                          ) : (
                            <div className="p-4 text-center text-gray-500">No data</div>
                          );
                        })()
                      )}
                    </>
                  )}
                </div>
              )}
            </section>
          </main>
        </div>
      </div>
      <footer className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">
        Powered by <strong>IT europlac</strong>
      </footer>
    </div>
  );
}

export default App;

// =============================
// Funkcie pre heatmap data
// =============================

function prepareDailyHeatmapData(historicalData) {
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

function prepareHeatmapData(historicalData, aggregatorWindow = "1h") {
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

function prepareCalendarData(heatmapSeries) {
  if (!heatmapSeries || heatmapSeries.length === 0) return [];
  return heatmapSeries[0].data.map((pt) => ({ x: pt.x, y: pt.y === 0 ? -1 : pt.y }));
}

function getCalendarStart(rangeKey) {
  const d = new Date();
  d.setDate(d.getDate() - (rangeKey === "365d" ? 365 : 30));
  return d;
}

function splitDataByYear(data, startDate, endDate) {
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


