const config = {
    // Načítavame hodnoty z .env pomocou import.meta.env (Vite používa prefix VITE_)
    INFLUX_URL: import.meta.env.VITE_INFLUX_URL,
    INFLUX_TOKEN: import.meta.env.VITE_INFLUX_TOKEN,
    ORG: import.meta.env.VITE_ORG,
    BUCKET: import.meta.env.VITE_BUCKET,
  
    // Definujeme pole s názvami polí, ktoré budeme používať
    FIELDS: ["teplota", "vlhkost", "tlak"],
  
    // Môžete pridať aj ďalšie konfiguračné nastavenia
    RANGES: {
      live: { label: "LIVE", flux: "-5m", interval: "10s" },
      "1h": { label: "1h", flux: "-1h", interval: "1m" },
      "6h": { label: "6h", flux: "-6h", interval: "5m" },
      "24h": { label: "24h", flux: "-24h", interval: "10m" },
      "7d": { label: "7d", flux: "-7d", interval: "30m" },
      "30d": { label: "30d", flux: "-30d", interval: "1h" },
      "365d": { label: "365d", flux: "-365d", interval: "6h" },
      custom: { label: "Vlastný interval", flux: null, interval: "1m" },
    },
  
    // Prípadne ďalšie nastavenia, napr. default thresholds, môžete pridať aj tu:
    DEFAULT_THRESHOLDS: {
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
    },
  };
  
  export default config;