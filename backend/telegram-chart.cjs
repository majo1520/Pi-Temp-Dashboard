/**
 * Telegram Chart Utility
 * 
 * This module provides functionality to generate and send charts via Telegram.
 * It utilizes SVG generation for chart creation and the Telegram Bot API
 * for sending the chart images.
 */

const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Configurable logging utility
const logger = {
  // Possible values: 'ALL', 'ERROR', 'NONE'
  level: process.env.NODE_ENV === 'production' ? 'ERROR' : (process.env.LOGGING_LEVEL || 'ALL').toUpperCase(),
  
  log: function(...args) {
    if (this.level === 'ALL') {
      console.log(...args);
    }
  },
  
  error: function(...args) {
    if (this.level === 'ALL' || this.level === 'ERROR') {
      console.error(...args);
    }
  },
  
  // Always log regardless of configuration (for critical messages)
  always: function(...args) {
    console.log(...args);
  }
};

/**
 * Generate a chart image URL using QuickChart.io
 * 
 * @param {Object} data - Chart data containing timestamps and values
 * @param {string} title - Chart title
 * @param {string} yAxis - Y-axis label
 * @param {string} type - Data type (temperature, humidity, pressure)
 * @returns {Promise<string>} - URL to the generated chart image
 */
async function generateChartUrl(data, title, yAxis, type) {
  if (!data || !data.length) {
    throw new Error('No data provided for chart generation');
  }
  
  // Extract x (time) and y (values) from data
  // Ensure we don't exceed a reasonable number of data points
  const MAX_CHART_POINTS = 48; // One point per half hour is enough for readability
  
  let chartData = [...data];
  if (chartData.length > MAX_CHART_POINTS) {
    const samplingRate = Math.ceil(chartData.length / MAX_CHART_POINTS);
    logger.log(`Reducing chart data points from ${chartData.length} to ~${MAX_CHART_POINTS} (sampling every ${samplingRate} points)`);
    
    const sampledData = [];
    for (let i = 0; i < chartData.length; i += samplingRate) {
      sampledData.push(chartData[i]);
    }
    
    // Always include the last data point to show the most recent value
    if (sampledData[sampledData.length - 1] !== chartData[chartData.length - 1]) {
      sampledData.push(chartData[chartData.length - 1]);
    }
    
    chartData = sampledData;
    logger.log(`Final chart data points: ${chartData.length}`);
  }
  
  const times = chartData.map(point => {
    const date = new Date(point.time);
    return date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  });
  const values = chartData.map(point => point.value);
  
  // Define colors based on data type
  let lineColor = 'rgb(75, 192, 192)';
  switch (type) {
    case 'temperature':
      lineColor = 'rgb(255, 99, 132)';
      break;
    case 'humidity':
      lineColor = 'rgb(54, 162, 235)';
      break;
    case 'pressure':
      lineColor = 'rgb(153, 102, 255)';
      break;
  }
  
  // Create chart configuration for QuickChart.io
  // Keep the configuration minimal to avoid URL length issues
  const chartConfig = {
    type: 'line',
    data: {
      labels: times,
      datasets: [{
        label: type,
        data: values,
        fill: false,
        borderColor: lineColor,
        tension: 0.4,
        pointRadius: 1
      }]
    },
    options: {
      title: {
        display: true,
        text: title
      },
      scales: {
        xAxes: [{
          scaleLabel: {
            display: true,
            labelString: 'Time'
          },
          ticks: {
            maxTicksLimit: 8
          }
        }],
        yAxes: [{
          scaleLabel: {
            display: true,
            labelString: yAxis
          }
        }]
      }
    }
  };

  // Always use the dedicated API endpoint rather than query parameters to avoid URL length issues
  try {
    const chartRequest = {
      chart: chartConfig,
      width: 800,
      height: 400,
      format: 'png',
      backgroundColor: 'white'
    };
    
    logger.log(`Sending request to QuickChart API with ${values.length} data points`);
    
    const response = await fetch('https://quickchart.io/chart/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(chartRequest)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`QuickChart API error (${response.status}): ${errorText}`);
      throw new Error(`QuickChart API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 100)}`);
    }
    
    const data = await response.json();
    logger.log(`Successfully generated chart at: ${data.url}`);
    return data.url;
  } catch (error) {
    logger.error(`Error generating chart via QuickChart API: ${error.message}`);
    throw error;
  }
}

/**
 * Send a chart image to a Telegram chat
 * 
 * @param {string} chatId - Telegram chat ID
 * @param {string} pngFilePath - Path to the PNG file
 * @param {string} caption - Caption for the image
 */
async function sendPngChartToTelegram(chatId, pngFilePath, caption) {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error('Telegram bot token not configured');
  }
  
  if (!chatId) {
    throw new Error('Telegram chat ID not provided');
  }
  
  try {
    logger.log(`Sending PNG chart from ${pngFilePath} to Telegram`);
    
    // Create form data with the PNG file and caption
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('photo', fs.createReadStream(pngFilePath));
    
    if (caption) {
      formData.append('caption', caption);
    }
    
    // Send the request to Telegram
    const telegramUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`;
    logger.log(`Sending image to Telegram chat ID: ${chatId}`);
    
    const telegramResponse = await fetch(telegramUrl, {
      method: 'POST',
      body: formData
    });
    
    let telegramData;
    try {
      telegramData = await telegramResponse.json();
    } catch (error) {
      logger.error(`Error parsing Telegram response: ${error.message}`);
      const responseText = await telegramResponse.text();
      logger.error(`Raw response: ${responseText.substring(0, 200)}`);
      throw new Error(`Failed to parse Telegram response: ${error.message}`);
    }
    
    if (!telegramData.ok) {
      logger.error(`Telegram API error: ${JSON.stringify(telegramData)}`);
      throw new Error(`Telegram API error: ${telegramData.description}`);
    }
    
    logger.log(`PNG chart sent successfully to chat ID: ${chatId}`);
    
    // Clean up - delete the temporary file
    fs.unlink(pngFilePath, (err) => {
      if (err) {
        logger.error(`Error deleting temporary file ${pngFilePath}: ${err.message}`);
      } else {
        logger.log(`Temporary file ${pngFilePath} deleted successfully`);
      }
    });
    
    return telegramData;
  } catch (error) {
    logger.error(`Error sending PNG chart to Telegram: ${error.message}`);
    throw error;
  }
}

/**
 * Fetch sensor data from InfluxDB for chart generation
 * 
 * @param {string} location - Sensor location
 * @param {string} type - Data type (temperature, humidity, pressure)
 * @param {number} timeRangeMinutes - Time range in minutes (default: 60)
 * @returns {Promise<Array>} - Array of data points with time and value
 */
async function fetchSensorDataForChart(location, type, timeRangeMinutes = 60) {
  // Get InfluxDB configuration from environment variables
  // Note: These match the variables in server.cjs
  const INFLUX_URL = process.env.VITE_INFLUX_URL || process.env.INFLUX_URL || 'http://localhost:8086';
  const INFLUX_TOKEN = process.env.VITE_INFLUX_TOKEN || process.env.INFLUX_TOKEN || 'testtoken';
  const ORG = process.env.VITE_ORG || process.env.ORG || 'testorg';
  const BUCKET = process.env.VITE_BUCKET || process.env.BUCKET || 'testbucket';
  
  if (!INFLUX_URL || !INFLUX_TOKEN || !ORG || !BUCKET) {
    throw new Error('InfluxDB configuration missing');
  }
  
  // Log InfluxDB configuration for debugging
  logger.log(`Using InfluxDB configuration:
    - URL: ${INFLUX_URL}
    - Org: ${ORG}
    - Bucket: ${BUCKET}
    - Token: ${INFLUX_TOKEN.substring(0, 5)}...
  `);
  
  let field;
  switch (type) {
    case 'temperature':
      field = 'teplota';
      break;
    case 'humidity':
      field = 'vlhkost';
      break;
    case 'pressure':
      field = 'tlak';
      break;
    default:
      throw new Error(`Invalid data type: ${type}`);
  }
  
  // Calculate a reasonable window size to avoid too many data points
  // Aim for about 60 data points (one per minute for an hour)
  const aggregateWindow = Math.max(1, Math.floor(timeRangeMinutes / 60));
  
  // Query InfluxDB for the data with aggregation
  const query = `from(bucket: "${BUCKET}")
    |> range(start: -${timeRangeMinutes}m)
    |> filter(fn: (r) => r["_measurement"] == "bme280" and r["location"] == "${location}")
    |> filter(fn: (r) => r["_field"] == "${field}")
    |> aggregateWindow(every: ${aggregateWindow}m, fn: mean, createEmpty: false)
    |> sort(columns: ["_time"], desc: false)`;
  
  logger.log(`Executing InfluxDB query for ${type} data from ${location} for the last ${timeRangeMinutes} minutes with ${aggregateWindow}m aggregation window`);
  
  const response = await fetch(`${INFLUX_URL}/api/v2/query?org=${ORG}`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${INFLUX_TOKEN}`,
      'Content-Type': 'application/vnd.flux',
      'Accept': 'application/csv'
    },
    body: query,
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch data from InfluxDB: ${await response.text()}`);
  }
  
  const csvText = await response.text();
  const lines = csvText.split("\n").filter(line => line && !line.startsWith("#"));
  
  if (lines.length <= 1) {
    throw new Error(`No data available for ${location} ${type}`);
  }
  
  // Parse the CSV data
  const headers = lines[0].split(",").map(h => h.trim());
  const timeIndex = headers.indexOf("_time");
  const valueIndex = headers.indexOf("_value");
  
  if (timeIndex === -1 || valueIndex === -1) {
    throw new Error('Invalid CSV response from InfluxDB');
  }
  
  // Extract time and value pairs
  let chartData = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",");
    if (row.length > valueIndex && row.length > timeIndex) {
      chartData.push({
        time: new Date(row[timeIndex]).getTime(),
        value: parseFloat(row[valueIndex])
      });
    }
  }
  
  // If we still have too many data points, subsample them
  const MAX_DATA_POINTS = 60;
  if (chartData.length > MAX_DATA_POINTS) {
    logger.log(`Subsampling ${chartData.length} data points to ${MAX_DATA_POINTS} points`);
    const step = Math.floor(chartData.length / MAX_DATA_POINTS);
    const sampledData = [];
    
    for (let i = 0; i < chartData.length; i += step) {
      sampledData.push(chartData[i]);
    }
    
    // Always include the last data point to show the most recent value
    if (sampledData[sampledData.length - 1] !== chartData[chartData.length - 1]) {
      sampledData.push(chartData[chartData.length - 1]);
    }
    
    chartData = sampledData;
  }
  
  logger.log(`Retrieved ${chartData.length} data points for ${type} from ${location}`);
  return chartData;
}

/**
 * Generate and send a chart to Telegram
 * 
 * @param {string} chatId - Telegram chat ID
 * @param {string} location - Sensor location
 * @param {string} type - Data type (temperature, humidity, pressure)
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} - Telegram API response
 */
async function sendSensorChart(chatId, location, type, options = {}) {
  try {
    const timeRangeMinutes = options.timeRangeMinutes || 60;
    const lang = options.language || 'en';
    
    // Get translation strings based on language
    const translations = getTranslations(lang);
    
    // Get the sensor data
    const chartData = await fetchSensorDataForChart(location, type, timeRangeMinutes);
    
    // Round all values to 2 decimal places
    chartData.forEach(point => {
      point.value = parseFloat(point.value.toFixed(2));
    });
    
    // Prepare chart title and y-axis label
    let title, yAxisLabel;
    
    switch (type) {
      case 'temperature':
        title = `${lang === 'sk' ? 'Teplota' : 'Temperature'} - ${location} (${translations.lastMinutes.replace('{minutes}', timeRangeMinutes)})`;
        yAxisLabel = `${lang === 'sk' ? 'Teplota' : 'Temperature'} (°C)`;
        break;
      case 'humidity':
        title = `${lang === 'sk' ? 'Vlhkosť' : 'Humidity'} - ${location} (${translations.lastMinutes.replace('{minutes}', timeRangeMinutes)})`;
        yAxisLabel = `${lang === 'sk' ? 'Vlhkosť' : 'Humidity'} (%)`;
        break;
      case 'pressure':
        title = `${lang === 'sk' ? 'Tlak' : 'Pressure'} - ${location} (${translations.lastMinutes.replace('{minutes}', timeRangeMinutes)})`;
        yAxisLabel = `${lang === 'sk' ? 'Tlak' : 'Pressure'} (hPa)`;
        break;
    }
    
    // Generate SVG chart
    const svgContent = await generateChartSvg(chartData, title, yAxisLabel, type, translations);
    
    // Convert SVG to PNG and save to file
    const pngFilePath = await convertSvgToPng(svgContent);
    
    // Prepare caption
    const latestValue = chartData[chartData.length - 1].value;
    let units = type === 'temperature' ? '°C' : type === 'humidity' ? '%' : 'hPa';
    let caption = `${title}\n${translations.currentValue}: ${latestValue} ${units}`;
    
    // Send PNG chart to Telegram
    return await sendPngChartToTelegram(chatId, pngFilePath, caption);
  } catch (error) {
    logger.error(`Error sending sensor chart: ${error.message}`);
    throw error;
  }
}

/**
 * Get translations for chart elements based on language
 * @param {string} lang - Language code ('en' or 'sk')
 * @returns {Object} - Translations object
 */
function getTranslations(lang) {
  if (lang === 'sk') {
    return {
      time: 'Čas',
      value: 'Hodnota',
      currentValue: 'Aktuálna hodnota',
      lastMinutes: 'posledných {minutes} minút'
    };
  } else {
    return {
      time: 'Time',
      value: 'Value',
      currentValue: 'Current value',
      lastMinutes: 'last {minutes} minutes'
    };
  }
}

/**
 * Generate a chart image using simple SVG generation
 * 
 * @param {Object} data - Chart data containing timestamps and values
 * @param {string} title - Chart title
 * @param {string} yAxis - Y-axis label
 * @param {string} type - Data type (temperature, humidity, pressure)
 * @param {Object} translations - Translation strings
 * @returns {Promise<Buffer>} - Chart image as a buffer
 */
async function generateChartSvg(data, title, yAxis, type, translations) {
  if (!data || !data.length) {
    throw new Error('No data provided for chart generation');
  }
  
  // Ensure we don't exceed a reasonable number of data points
  const MAX_CHART_POINTS = 48; // One point per half hour is enough for readability
  
  let chartData = [...data];
  if (chartData.length > MAX_CHART_POINTS) {
    const samplingRate = Math.ceil(chartData.length / MAX_CHART_POINTS);
    logger.log(`Reducing chart data points from ${chartData.length} to ~${MAX_CHART_POINTS} (sampling every ${samplingRate} points)`);
    
    const sampledData = [];
    for (let i = 0; i < chartData.length; i += samplingRate) {
      sampledData.push(chartData[i]);
    }
    
    // Always include the last data point to show the most recent value
    if (sampledData[sampledData.length - 1] !== chartData[chartData.length - 1]) {
      sampledData.push(chartData[chartData.length - 1]);
    }
    
    chartData = sampledData;
    logger.log(`Final chart data points: ${chartData.length}`);
  }
  
  // Prepare times and values
  const times = chartData.map(point => {
    const date = new Date(point.time);
    return date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  });
  const values = chartData.map(point => point.value);
  
  // Define colors based on data type
  let lineColor;
  switch (type) {
    case 'temperature':
      lineColor = '#FF6384';
      break;
    case 'humidity':
      lineColor = '#36A2EB';
      break;
    case 'pressure':
      lineColor = '#9966FF';
      break;
    default:
      lineColor = '#4BC0C0';
  }
  
  // SVG dimensions
  const width = 800;
  const height = 400;
  const padding = 60;
  
  // Find min and max values for scaling
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = Math.max(maxValue - minValue, 1); // Prevent division by zero
  
  // Calculate coordinates for the line
  const pointsPerAxis = chartData.length - 1;
  const xStep = (width - 2 * padding) / Math.max(pointsPerAxis, 1);
  
  const points = values.map((value, index) => {
    const x = padding + index * xStep;
    const normalizedValue = (value - minValue) / valueRange;
    const y = height - padding - normalizedValue * (height - 2 * padding);
    return `${x},${y}`;
  }).join(' ');
  
  // Generate X-axis labels
  const xLabels = [];
  const numXLabels = Math.min(times.length, 8); // Limit number of x-axis labels
  const xLabelStep = Math.max(1, Math.floor(times.length / numXLabels));
  
  for (let i = 0; i < times.length; i += xLabelStep) {
    xLabels.push({
      text: times[i],
      x: padding + i * xStep,
      y: height - padding + 20
    });
  }
  
  // Add the last time label if it's not already included
  if (xLabels.length > 0 && xLabels[xLabels.length - 1].text !== times[times.length - 1]) {
    xLabels.push({
      text: times[times.length - 1],
      x: padding + (times.length - 1) * xStep,
      y: height - padding + 20
    });
  }
  
  // Generate Y-axis labels
  const yLabels = [];
  const numYLabels = 5;
  const yStep = valueRange / (numYLabels - 1);
  
  for (let i = 0; i < numYLabels; i++) {
    const value = minValue + i * yStep;
    yLabels.push({
      text: value.toFixed(2), // Round to 2 decimal places
      x: padding - 10,
      y: height - padding - (i / (numYLabels - 1)) * (height - 2 * padding)
    });
  }
  
  // Create the SVG
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="background-color: white;">
      <text x="${width / 2}" y="30" text-anchor="middle" font-family="Arial" font-size="16" font-weight="bold">${title}</text>
      
      <!-- Y-axis -->
      <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="black" stroke-width="1" />
      <text x="${padding - 30}" y="${height / 2}" transform="rotate(-90 ${padding - 30} ${height / 2})" text-anchor="middle" font-family="Arial" font-size="12">${yAxis}</text>
      ${yLabels.map(label => `<text x="${label.x}" y="${label.y}" text-anchor="end" font-family="Arial" font-size="10">${label.text}</text>`).join('\n')}
      
      <!-- X-axis -->
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="black" stroke-width="1" />
      <text x="${width / 2}" y="${height - 10}" text-anchor="middle" font-family="Arial" font-size="12">${translations.time}</text>
      ${xLabels.map(label => `<text x="${label.x}" y="${label.y}" text-anchor="middle" font-family="Arial" font-size="10" transform="rotate(45 ${label.x} ${label.y})">${label.text}</text>`).join('\n')}
      
      <!-- Grid lines -->
      ${yLabels.map(label => `<line x1="${padding}" y1="${label.y}" x2="${width - padding}" y2="${label.y}" stroke="#EEEEEE" stroke-width="1" />`).join('\n')}
      
      <!-- Data points and line -->
      <polyline points="${points}" fill="none" stroke="${lineColor}" stroke-width="2" />
      ${values.map((value, index) => {
        const x = padding + index * xStep;
        const normalizedValue = (value - minValue) / valueRange;
        const y = height - padding - normalizedValue * (height - 2 * padding);
        return `<circle cx="${x}" cy="${y}" r="3" fill="${lineColor}" />`;
      }).join('\n')}
    </svg>
  `;
  
  return svg;
}

/**
 * Convert SVG to PNG and save it to a file
 * 
 * @param {string} svgContent - SVG content as a string
 * @returns {Promise<string>} - Path to the generated PNG file
 */
async function convertSvgToPng(svgContent) {
  const tempDir = path.join(__dirname, 'temp');
  const fileName = `chart_${Date.now()}.png`;
  const filePath = path.join(tempDir, fileName);
  
  // Ensure the temp directory exists
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  try {
    // Convert SVG to PNG using sharp
    await sharp(Buffer.from(svgContent))
      .png()
      .toFile(filePath);
    
    logger.log(`SVG converted to PNG and saved to: ${filePath}`);
    return filePath;
  } catch (error) {
    logger.error(`Error converting SVG to PNG: ${error.message}`);
    throw error;
  }
}

module.exports = {
  sendSensorChart,
  fetchSensorDataForChart,
  generateChartSvg,
  convertSvgToPng,
  sendPngChartToTelegram
}; 