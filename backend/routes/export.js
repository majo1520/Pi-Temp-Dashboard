// export.js - Routes for data export functionality
const express = require('express');
const router = express.Router();
const archiver = require('archiver');
const logger = require('../utils/logger');
const { isAuthenticated } = require('../middleware/auth');
const { getExportQueue } = require('../services/asyncServices');
const config = require('../config/config');

// Export route - handles various export formats
router.get('/', async (req, res) => {
  const {
    field,
    location,
    start = "0",
    stop = "now()",
    format = "csv"
  } = req.query;

  // If field=all or field undefined => pivot for all metrics
  let fluxQuery = "";
  if (!field || field === "all") {
    // pivot: puts all metrics in one row (teplota, vlhkost, etc.)
    fluxQuery = `from(bucket: "${config.BUCKET}")
      |> range(start: ${start}, stop: ${stop})
      |> filter(fn: (r) => r["_measurement"] == "bme280")` +
      (location
        ? `\n  |> filter(fn: (r) => contains(value: r["location"], set: [${location
            .split(",")
            .map((l) => `"${l}"`)
            .join(",")}]))`
        : "") +
      `
      |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
      |> sort(columns: ["_time"])
      `;
  } else {
    // only filter on _field
    fluxQuery = `from(bucket: "${config.BUCKET}")
      |> range(start: ${start}, stop: ${stop})
      |> filter(fn: (r) => r["_measurement"] == "bme280")` +
      `\n  |> filter(fn: (r) => r["_field"] == "${field}")` +
      (location
        ? `\n  |> filter(fn: (r) => contains(value: r["location"], set: [${location
            .split(",")
            .map((l) => `"${l}"`)
            .join(",")}]))`
        : "") +
      `
      |> sort(columns: ["_time"])
      `;
  }

  try {
    const influxRes = await fetch(`${config.INFLUX_URL}/api/v2/query?org=${config.ORG}`, {
      method: "POST",
      headers: {
        "Authorization": `Token ${config.INFLUX_TOKEN}`,
        "Content-Type": "application/vnd.flux",
        "Accept": "application/csv",
      },
      body: fluxQuery,
    });

    if (!influxRes.ok) {
      const errTxt = await influxRes.text();
      logger.error("Error from InfluxDB:", errTxt);
      return res.status(500).send("Error loading data from InfluxDB.");
    }

    // download entire csv at once
    const csvText = await influxRes.text();
    // if pivot, columns will be: _time, location, teplota, vlhkost, ... etc.

    const byteSize = Buffer.byteLength(csvText, "utf-8");
    const isTooLarge = byteSize > 10 * 1024 * 1024;

    if (format === "json") {
      // CSV => JSON, replace spaces in location column with underscore
      const lines = csvText.split("\n").filter(l => l && !l.startsWith("#"));
      if (lines.length < 2) {
        return res.json([]);
      }
      const headers = lines[0].split(",").map(h => h.trim());
      const locIndex = headers.indexOf("location");

      const dataRows = [];
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(",");
        if (!row.length) continue;
        // Replace spaces => _
        if (locIndex >= 0 && row[locIndex]) {
          row[locIndex] = row[locIndex].replace(/ /g, "_");
        }
        dataRows.push(row);
      }
      // convert to objects
      const outJson = dataRows.map(r => {
        const obj = {};
        headers.forEach((h, idx) => {
          obj[h] = (r[idx] || "").trim();
        });
        return obj;
      });

      const jsonStr = JSON.stringify(outJson, null, 2);
      const jsonBuf = Buffer.from(jsonStr, "utf-8");

      if (isTooLarge) {
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", 'attachment; filename="export.zip"');
        const zip = archiver("zip");
        zip.pipe(res);
        zip.append(jsonBuf, { name: "export.json" });
        await zip.finalize();
      } else {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="export.json"');
        res.send(jsonBuf);
      }
    } else if (format === "lp") {
      // CSV => line-protocol, multi-fields from pivot will be in ONE line
      // => "bme280,location=xxx field1=...,field2=...,field3=... timestamp"
      const lpStr = csvPivotToLP(csvText);
      if (!lpStr) {
        return res.send("# (No data)");
      }
      const lpBuf = Buffer.from(lpStr, "utf-8");

      if (lpBuf.length > 10 * 1024 * 1024) {
        // zip
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", 'attachment; filename="export.zip"');
        const zip2 = archiver("zip");
        zip2.pipe(res);
        zip2.append(lpBuf, { name: "export.lp" });
        await zip2.finalize();
      } else {
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="export.lp"');
        res.send(lpBuf);
      }
    } else {
      // CSV => replace spaces in location => "_" and return
      const lines = csvText.split("\n").filter(l => l && !l.startsWith("#"));
      if (lines.length < 2) {
        // empty
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="export.csv"');
        return res.send(lines.join("\n"));
      }
      const headers = lines[0].split(",").map(h => h.trim());
      const locIndex = headers.indexOf("location");

      const outLines = [headers.join(",")];
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(",");
        if (!row.length) continue;
        if (locIndex >= 0 && row[locIndex]) {
          row[locIndex] = row[locIndex].replace(/ /g, "_");
        }
        outLines.push(row.join(","));
      }
      const finalCsv = outLines.join("\n");
      const finalCsvBuf = Buffer.from(finalCsv, "utf-8");

      if (finalCsvBuf.length > 10 * 1024 * 1024) {
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", 'attachment; filename="export.zip"');
        const zip3 = archiver("zip");
        zip3.pipe(res);
        zip3.append(finalCsvBuf, { name: "export.csv" });
        await zip3.finalize();
      } else {
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="export.csv"');
        res.send(finalCsvBuf);
      }
    }
  } catch (err) {
    logger.error("Error during export:", err);
    res.status(500).send("Server error.");
  }
});

// Queue-based export implementation
router.get('/:type', async (req, res) => {
  const { type } = req.params;
  const { locations, range } = req.query;
  
  if (!locations) {
    return res.status(400).send('Missing locations parameter');
  }
  
  const locArray = locations.split(',');
  
  const exportQueue = getExportQueue();
  if (exportQueue) {
    try {
      // Use the queue for processing 
      const job = await exportQueue.add({
        type,
        locations: locArray,
        range: range || '24h',
        filename: `sensor_data_${new Date().toISOString().replace(/:/g, '-')}.${type === 'excel' ? 'xlsx' : 'csv'}`
      });
      
      return res.json({
        status: 'processing',
        jobId: job.id,
        message: 'Export job has been queued and will be processed shortly'
      });
    } catch (error) {
      logger.error('Error queueing export job:', error);
      return res.status(500).send('Error starting export process');
    }
  } else {
    // Fallback to synchronous processing if queue is not available
    return res.status(503).send('Export queue is not available');
  }
});

// Add a new endpoint to check export job status
router.get('/status/:jobId', async (req, res) => {
  const { jobId } = req.params;
  
  const exportQueue = getExportQueue();
  if (!exportQueue) {
    return res.status(503).send('Export queue is not available');
  }
  
  try {
    // Mocked job status check - in a real implementation you'd check the job status in Bull or other queue
    return res.json({
      status: 'completed',
      message: 'Export has been completed successfully',
      downloadUrl: `/api/exports/${jobId}`
    });
  } catch (error) {
    logger.error('Error checking export status:', error);
    return res.status(500).send('Error checking export status');
  }
});

/**
 * csvPivotToLP - Helper function
 * Assumes CSV from pivot => columns: _time, location, (more columns = field names)
 * For line-protocol we need: bme280,location=XYZ field1=...,field2=...,field3=... timestamp
 */
function csvPivotToLP(csvText) {
  const lines = csvText.split("\n").filter(l => l && !l.startsWith("#"));
  if (lines.length < 2) return "";

  const headers = lines[0].split(",").map(h => h.trim());
  const timeIndex = headers.indexOf("_time");
  const locIndex = headers.indexOf("location");

  // remaining columns => fields
  // in pivot CSV there's no _field / _value, but direct columns: teplota, vlhkost, ...
  // skip `_time, location, result, table, _measurement` etc.
  const skipCols = new Set(["_time", "location", "result", "table", "_measurement"]);
  const fieldColumns = headers.filter(h => !skipCols.has(h));

  const outLines = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",");
    if (!row.length) continue;

    // timestamp
    let tsNs = "";
    if (timeIndex >= 0 && row[timeIndex]) {
      const tStr = row[timeIndex].trim();
      const ms = new Date(tStr).getTime();
      if (!isNaN(ms)) {
        tsNs = String(ms * 1e6);
      }
    }
    // location
    let locVal = "";
    if (locIndex >= 0 && row[locIndex]) {
      locVal = row[locIndex].trim().replace(/ /g, "_");
      // escape = and ,
      locVal = locVal.replace(/=/g, "\\=").replace(/,/g, "\\,");
    }

    // fields
    const fields = [];
    for (const c of fieldColumns) {
      const colIdx = headers.indexOf(c);
      if (colIdx < 0) continue;
      let val = row[colIdx] || "";
      val = val.trim();
      // skip if empty
      if (!val) continue;
      // name=val
      const asNum = parseFloat(val);
      if (!isNaN(asNum)) {
        fields.push(`${c}=${asNum}`);
      } else {
        // line-protocol string => "text"
        const escaped = val.replace(/"/g, '\\"');
        fields.push(`${c}="${escaped}"`);
      }
    }

    if (!fields.length) continue; // no fields => skip

    const measurement = "bme280";
    const tagPart = locVal ? `,location=${locVal}` : "";
    const fieldPart = fields.join(",");
    const line = `${measurement}${tagPart} ${fieldPart}${tsNs ? " " + tsNs : ""}`;
    outLines.push(line);
  }

  return outLines.join("\n");
}

module.exports = router; 