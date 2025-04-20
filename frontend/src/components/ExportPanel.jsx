import { useEffect, useState } from "react";
import axios from "axios";

const FIELD_OPTIONS = ["", "teplota", "vlhkost", "tlak"];
const RANGE_OPTIONS = ["24h", "7d", "30d", "365d", "celá databáza"];
const FORMAT_OPTIONS = ["csv", "json", "lp"];

/**
 * ExportPanel component for exporting sensor data
 * @param {Function} t - Translation function from LanguageContext
 */
export default function ExportPanel({ t }) {
  const [field, setField] = useState("");
  const [location, setLocation] = useState("");
  const [range, setRange] = useState("30d");
  const [format, setFormat] = useState("csv");
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/sensors")
      .then((res) => res.json())
      .then((data) => setLocations(data.map((s) => s.name)))
      .catch((err) => console.error("Chyba pri načítaní lokácií:", err));
  }, []);

  // Helper function to check if data is a ZIP file (starts with PK)
  const isZipFile = (data) => {
    if (data instanceof Blob) {
      // Check first bytes for ZIP header (PK signature)
      return data.size >= 2 && data.slice(0, 2).text().then(text => text === 'PK');
    }
    if (typeof data === 'string' && data.length >= 2) {
      return data.startsWith('PK');
    }
    return false;
  };

  const handleExport = async () => {
    setLoading(true);
    try {
      const startParam = range === "celá databáza" ? "0" : `-${range}`;

      // For JSON, we need to avoid ZIP compression, so limit the query
      let modifiedStart = startParam;
      if (format === 'json' && (startParam === '0' || startParam === '-365d')) {
        // Limit large queries to 30 days for JSON to avoid ZIP compression
        modifiedStart = '-30d';
      }

      const response = await axios.get("/api/export", {
        params: {
          field,
          location,
          start: modifiedStart,
          stop: "now()",
          format,
          t: Date.now(),
        },
        responseType: "blob",
        headers: {
          Accept:
            format === "json"
              ? "application/json"
              : format === "lp"
              ? "text/plain"
              : "text/csv",
        },
      });

      const fileType =
        format === "json"
          ? "application/json"
          : format === "lp"
          ? "text/plain"
          : "text/csv";

      const fileExtension = format === "lp" ? "lp" : format;

      // Create the correct blob depending on the format
      let blob;
      
      if (format === "json") {
        // Check if response is a ZIP file (server sends ZIP for large data)
        const isZip = await isZipFile(response.data);
        
        if (isZip) {
          // Handle ZIP file - notify user that we're limiting the data
          alert(t ? t('jsonExportTooLarge') : 
            "Výsledok je príliš veľký pre JSON. Dáta boli limitované na posledných 30 dní. Pre väčšie dátové sady použite CSV alebo LP formát.");
            
          // Retry with a more limited date range
          setLoading(false);
          return;
        }
        
        // Process regular JSON response
        const textContent = await response.data.text();
        
        try {
          // Try to parse it as JSON to ensure it's valid
          const jsonData = JSON.parse(textContent);
          // Create a properly formatted JSON blob with indentation for readability
          blob = new Blob([JSON.stringify(jsonData, null, 2)], {
            type: fileType,
          });
        } catch (jsonError) {
          console.warn("JSON parsing error, using raw text", jsonError);
          blob = new Blob([textContent], { type: fileType });
        }
      } else {
        // For CSV and LP formats, use response data directly
        blob = new Blob([response.data], { type: fileType });
      }

      // Format location name for filename (replace spaces with underscores)
      const formattedLocation = location ? location.replace(/\s+/g, '_') : "vsetky";
      const formattedField = field || "vsetky";

      const filename = `${formattedLocation}_${formattedField}_${range}.${fileExtension}`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert("Chyba pri exporte.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="text-gray-800 dark:text-gray-200">
      <div className="space-y-3">
        <div className="mb-2">
          <label className="block text-sm font-medium mb-1">{t ? t('field') : 'Veličina'}:</label>
          <select
            value={field}
            onChange={(e) => setField(e.target.value)}
            className="w-full border dark:border-gray-600 dark:bg-gray-700 rounded px-2 py-1 text-sm"
          >
            <option value="">{t ? t('allFields') : 'Všetky veličiny'}</option>
            {FIELD_OPTIONS.filter((f) => f).map((f) => (
              <option key={f} value={f}>
                {f === 'teplota' ? (t ? t('temperature') : 'Teplota') :
                 f === 'vlhkost' ? (t ? t('humidity') : 'Vlhkosť') :
                 f === 'tlak' ? (t ? t('pressure') : 'Tlak') : f}
              </option>
            ))}
          </select>
        </div>
        
        <div className="mb-2">
          <label className="block text-sm font-medium mb-1">{t ? t('locationSelector') : 'Lokácia'}:</label>
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full border dark:border-gray-600 dark:bg-gray-700 rounded px-2 py-1 text-sm"
          >
            <option value="">{t ? t('allLocations') : 'Všetky lokácie'}</option>
            {locations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </div>
        
        <div className="mb-2">
          <label className="block text-sm font-medium mb-1">{t ? t('timeRange') : 'Časový rozsah'}:</label>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="w-full border dark:border-gray-600 dark:bg-gray-700 rounded px-2 py-1 text-sm"
          >
            {RANGE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r === 'custom' && t ? t('custom') : r}
              </option>
            ))}
          </select>
          {format === 'json' && (range === 'celá databáza' || range === '365d') && (
            <small className="text-orange-500 mt-1 block text-xs">
              {t ? t('jsonLargeWarning') : 'Pre JSON formát je pre veľké dátové sady odporúčaný kratší časový rozsah (30d alebo menej)'}
            </small>
          )}
        </div>
        
        <div className="mb-2">
          <label className="block text-sm font-medium mb-1">{t ? t('export') + ' ' + t('format') : 'Formát exportu'}:</label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="w-full border dark:border-gray-600 dark:bg-gray-700 rounded px-2 py-1 text-sm"
          >
            {FORMAT_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f.toUpperCase()}
              </option>
            ))}
          </select>
          {format === 'json' && (
            <small className="text-gray-500 mt-1 block text-xs">
              {t ? t('jsonFormatHint') : 'JSON formát je vhodný pre menšie množstvo dát. Pre veľké objemy použite CSV alebo LP.'}
            </small>
          )}
        </div>
      </div>

      <div className="mt-4">
        <button
          onClick={handleExport}
          disabled={loading}
          className={`w-full py-2 rounded text-white text-sm font-semibold ${
            loading ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {loading ? 
            (t ? t('exporting') : "Exportujem...") : 
            (t ? t('exportData') : "Exportovať dáta")
          }
        </button>
        {loading && (
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
            🔄 {t ? t('processingExport') : 'Načítavam a generujem súbor...'}
          </div>
        )}
      </div>
    </div>
  );
}
