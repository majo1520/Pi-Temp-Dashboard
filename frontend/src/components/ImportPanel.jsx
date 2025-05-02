import React, { useState } from "react";
import * as api from "../services/api";

/**
 * Komponent pre nahratie (import) line-protocol súboru (.lp) a
 * doplnenie (alebo prepísanie) location tagu na strane servera.
 *
 * @param {Array} sensors - Pole senzorov (napr. [{ name: 'kuchyna' }, { name: 'garaz' }]).
 * @param {Function} onImportDone - Callback po úspešnom importe (napr. refresh).
 * @param {Function} t - Translation function from LanguageContext.
 * @param {string} className - Additional CSS classes to add to the component.
 */
export default function ImportPanel({ sensors = [], onImportDone, t, className = "" }) {
  const [lpFile, setLpFile] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  
  // Max file size in bytes (100MB)
  const MAX_FILE_SIZE = 100 * 1024 * 1024;

  const handleImport = async () => {
    if (!lpFile || !selectedLocation) {
      setError(t ? t('selectFile') + ' ' + t('selectLocation') : "Vyberte line-protocol súbor a lokáciu!");
      return;
    }
    
    // Check file size before uploading
    if (lpFile.size > MAX_FILE_SIZE) {
      setError(t ? 
        t('fileTooLarge', { maxSize: '100MB' }) : 
        `File is too large. Maximum allowed size is 100MB. Your file is ${(lpFile.size / (1024 * 1024)).toFixed(2)}MB.`
      );
      return;
    }
    
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      // Create a new File object with explicit text/plain MIME type to prevent server rejections
      const textFile = new File(
        [await lpFile.text()], // Get the file content as text
        lpFile.name,
        { type: 'text/plain' } // Force text/plain MIME type
      );
      
      const result = await api.importLineProtocol(textFile, selectedLocation);
      setMessage(result);
      setLpFile(null);
      if (typeof onImportDone === "function") {
        onImportDone();
      }
    } catch (err) {
      console.error("Import error:", err);
      // Specific error handling for file size
      if (err.message && err.message.includes("File too large")) {
        setError(t ? 
          t('fileTooLarge', { maxSize: '100MB' }) : 
          "File is too large. Maximum allowed size is 100MB."
        );
      } else {
        setError(err.message || (t ? t('error') : "Import failed. Please check the file format and try again."));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ textAlign: 'left' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <label style={{ display: 'block', textAlign: 'left', marginBottom: '4px', fontSize: '14px', fontWeight: 500 }}>
            {t ? t('selectLocation') : 'Vyber lokáciu'}:
          </label>
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            disabled={loading}
            style={{ 
              width: '100%', 
              padding: '4px 8px', 
              borderRadius: '4px',
              border: '1px solid #d1d5db',
              backgroundColor: loading ? '#f3f4f6' : 'transparent',
              opacity: loading ? 0.7 : 1,
              textAlign: 'left',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            <option value="">-- {t ? t('selectLocation') : 'Vyber lokáciu'} --</option>
            {sensors.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        
        <div>
          <label style={{ display: 'block', textAlign: 'left', marginBottom: '4px', fontSize: '14px', fontWeight: 500 }}>
            {t ? t('selectFile') : 'Vyber súbor'}:
          </label>
          <input
            type="file"
            accept=".lp,.txt,text/plain,text/csv"
            onChange={(e) => setLpFile(e.target.files[0])}
            disabled={loading}
            style={{ 
              width: '100%', 
              textAlign: 'left',
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          />
          <small style={{ color: '#6B7280', marginTop: '2px', display: 'block' }}>
            {t ? t('selectFileHint') : 'Podporované formáty: .lp, .txt (text/plain)'}
          </small>
        </div>
        
        <button
          onClick={handleImport}
          disabled={loading || !lpFile || !selectedLocation}
          style={{
            width: '100%',
            padding: '8px',
            marginTop: '8px',
            backgroundColor: loading || !lpFile || !selectedLocation ? '#93c5fd' : '#2563eb',
            color: 'white',
            borderRadius: '4px',
            fontWeight: 500,
            textAlign: 'center',
            cursor: loading || !lpFile || !selectedLocation ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          {loading && (
            <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-r-transparent align-[-0.125em]"></div>
          )}
          {loading ? (t ? t('loading') : "Importujem...") : (t ? t('importData') : "Importovať")}
        </button>
      </div>
      
      {loading && (
        <div style={{ marginTop: '16px', textAlign: 'center', padding: '10px', backgroundColor: '#f0f9ff', borderRadius: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-3 border-solid border-blue-600 border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]">
              <span className="sr-only">{t ? t('loading') : "Loading..."}</span>
            </div>
            <span style={{ color: '#0369a1', fontWeight: 500 }}>
              {t ? t('processing') : "Spracovávam"} {t ? t('data') : "dáta"} {t ? t('for') : "pre"} {selectedLocation}...
            </span>
          </div>
        </div>
      )}
      
      {message && (
        <div style={{ 
          marginTop: '16px', 
          textAlign: 'left', 
          color: '#10b981', 
          fontSize: '14px',
          padding: '10px',
          backgroundColor: '#ecfdf5',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{ fontWeight: 'bold' }}>✓</span>
          {message}
        </div>
      )}
      
      {error && (
        <div style={{ 
          marginTop: '16px', 
          textAlign: 'left', 
          color: '#ef4444', 
          fontSize: '14px',
          padding: '10px',
          backgroundColor: '#fef2f2',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{ fontWeight: 'bold' }}>⚠️</span>
          {error}
        </div>
      )}
    </div>
  );
}
