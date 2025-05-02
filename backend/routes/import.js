// import.js - Routes for data import functionality
const express = require('express');
const router = express.Router();
const multer = require('multer');
const logger = require('../utils/logger');
const config = require('../config/config');

// Configure multer for /api/import-lp (store file in RAM)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB size limit (increased from 10MB)
    files: 1 // only 1 file allowed
  },
  fileFilter: (req, file, cb) => {
    // Only allow text files
    if (file.mimetype === 'text/plain' || file.mimetype === 'text/csv') {
      cb(null, true);
    } else {
      cb(new Error('Only text files are allowed'), false);
    }
  }
});

// Import line protocol route
router.post("/lp", upload.single("lpfile"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("Missing file (lpfile).");
    }
    const { location } = req.body;
    if (!location) {
      return res.status(400).send("Missing parameter 'location'.");
    }

    let lpData = req.file.buffer.toString("utf-8").trim();
    if (!lpData) {
      return res.status(400).send("Line-protocol file is empty.");
    }

    // Add or replace location=...
    const lines = lpData.split("\n");
    const newLines = lines.map((line) => {
      if (!line || line.startsWith("#")) return line;
      const hasLoc = /location=[^, ]*/.test(line);
      if (hasLoc) {
        // bme280,location=XYZ ...
        return line.replace(/location=[^, ]*/, `location=${location}`);
      } else {
        // bme280,tag=val => bme280,location=XYZ,tag=val
        const firstComma = line.indexOf(",");
        if (firstComma >= 0) {
          const prefix = line.slice(0, firstComma);
          const suffix = line.slice(firstComma);
          return `${prefix},location=${location}${suffix}`;
        } else {
          // bme280 field=xx
          const firstSpace = line.indexOf(" ");
          if (firstSpace === -1) return line;
          const measurement = line.slice(0, firstSpace);
          const rest = line.slice(firstSpace);
          return `${measurement},location=${location}${rest}`;
        }
      }
    });

    const finalLpData = newLines.join("\n");

    // Write to InfluxDB
    const influxWriteUrl = `${config.INFLUX_URL}/api/v2/write?org=${config.ORG}&bucket=${config.BUCKET}&precision=ns`;
    const influxRes = await fetch(influxWriteUrl, {
      method: "POST",
      headers: {
        "Authorization": `Token ${config.INFLUX_TOKEN}`,
        "Content-Type": "text/plain; charset=utf-8",
      },
      body: finalLpData,
    });

    if (!influxRes.ok) {
      const errText = await influxRes.text();
      return res.status(500).send(
        `Error writing to InfluxDB: ${influxRes.statusText}\n${errText}`
      );
    }

    return res.status(200).send("Line-protocol import successful.");
  } catch (err) {
    logger.error("Error during line-protocol import:", err);
    return res.status(500).send("Error during line-protocol import.");
  }
});

module.exports = router; 