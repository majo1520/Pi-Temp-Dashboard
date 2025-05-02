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
 * @param {string} type - Data type (temperature, humidity, pressure, uptime)
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
  let measurement = "bme280";
  
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
    case 'uptime':
    case 'status':
      field = '_value'; // For uptime/status, we'll use a different approach
      measurement = "bme280"; // Back to using bme280 for uptime status
      break;
    default:
      throw new Error(`Invalid data type: ${type}`);
  }
  
  // Calculate a reasonable window size to avoid too many data points
  // Aim for about 60 data points (one per minute for an hour)
  const aggregateWindow = Math.max(1, Math.floor(timeRangeMinutes / 60));
  
  // Build query based on data type
  let query;
  
  if (type === 'uptime' || type === 'status') {
    // For uptime/status, check the presence of data points in the measurement
    query = `from(bucket: "${BUCKET}")
      |> range(start: -${timeRangeMinutes}m)
      |> filter(fn: (r) => r["_measurement"] == "${measurement}" and r["location"] == "${location}")
      |> aggregateWindow(every: ${aggregateWindow}m, fn: count, createEmpty: true)
      |> map(fn: (r) => ({ r with _value: r._value > 0 ? 1.0 : 0.0 })) // Map to 1 (online) if any points, 0 (offline) otherwise
      |> sort(columns: ["_time"], desc: false)`;
  } else {
    // Standard query for temperature, humidity, pressure
    query = `from(bucket: "${BUCKET}")
      |> range(start: -${timeRangeMinutes}m)
      |> filter(fn: (r) => r["_measurement"] == "${measurement}" and r["location"] == "${location}")
      |> filter(fn: (r) => r["_field"] == "${field}")
      |> aggregateWindow(every: ${aggregateWindow}m, fn: mean, createEmpty: false)
      |> sort(columns: ["_time"], desc: false)`;
  }
  
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
    if (type === 'uptime' || type === 'status') {
      // For uptime, return a single "offline" data point if no data is found
      return [{
        time: Date.now(),
        value: 0 // 0 = offline
      }];
    } else {
      throw new Error(`No data available for ${location} ${type}`);
    }
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
      const value = parseFloat(row[valueIndex]);
      
      // For uptime charts, consider any non-zero value as "online"
      const adjustedValue = (type === 'uptime' || type === 'status') 
                           ? (value > 0 ? 1 : 0) 
                           : value;
      
      chartData.push({
        time: new Date(row[timeIndex]).getTime(),
        value: adjustedValue
      });
    }
  }
  
  // For uptime/status charts, ensure we have a proper timeline where presence of data = online
  if (type === 'uptime' || type === 'status') {
    // Create a continuous timeline with status values
    const interval = aggregateWindow * 60 * 1000; // convert minutes to milliseconds
    const timelineData = [];
    
    // Start from the first data point time
    if (chartData.length > 0) {
      const startTime = chartData[0].time;
      const endTime = Date.now();
      
      // Create timeline points
      for (let t = startTime; t <= endTime; t += interval) {
        // Find the closest existing data point
        const closestPoint = chartData.find(point => 
          Math.abs(point.time - t) < interval/2
        );
        
        timelineData.push({
          time: t,
          value: closestPoint ? closestPoint.value : 0 // Use closest point value or 0 if no data
        });
      }
      
      // Ensure we have the latest status correct
      // If the last few points are online, then the device is online
      const recentPoints = timelineData.slice(-5);
      const isCurrentlyOnline = recentPoints.some(point => point.value > 0);
      
      if (isCurrentlyOnline && timelineData.length > 0) {
        // Ensure the last point shows online
        timelineData[timelineData.length - 1].value = 1;
      }
      
      chartData = timelineData;
    }
  }
  
  // If we still have too many data points, subsample them
  const MAX_DATA_POINTS = 60;
  if (chartData.length > MAX_DATA_POINTS && type !== 'uptime' && type !== 'status') {
    // Only subsample for non-uptime data types
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
 * @param {string} type - Data type (temperature, humidity, pressure, uptime)
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
    
    // Round all values to 2 decimal places for numeric types
    if (type !== 'uptime' && type !== 'status') {
      chartData.forEach(point => {
        point.value = parseFloat(point.value.toFixed(2));
      });
    }
    
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
      case 'uptime':
      case 'status':
        title = `${lang === 'sk' ? 'Graf času prevádzy' : 'Uptime Chart'} - ${location} (${translations.lastMinutes.replace('{minutes}', timeRangeMinutes)})`;
        yAxisLabel = `${lang === 'sk' ? 'Stav' : 'Status'}`;
        break;
    }
    
    // Determine the current status for uptime charts
    let currentStatus = '';
    if (type === 'uptime' || type === 'status') {
      // For uptime, check the most recent few data points to determine status
      // This gives a more reliable indication than just using the last point
      const recentPoints = chartData.slice(-5);
      const isOnline = recentPoints.some(point => point.value > 0);
      currentStatus = isOnline ? translations.online : translations.offline;
    }
    
    // Generate SVG chart
    const svgContent = await generateChartSvg(chartData, title, yAxisLabel, type, translations, currentStatus);
    
    // Convert SVG to PNG and save to file
    const pngFilePath = await convertSvgToPng(svgContent);
    
    // Prepare caption
    let caption;
    if (type === 'uptime' || type === 'status') {
      caption = `${title}\n${translations.currentStatus}: ${currentStatus}`;
    } else {
      const latestValue = chartData[chartData.length - 1].value;
      let units = type === 'temperature' ? '°C' : type === 'humidity' ? '%' : 'hPa';
      caption = `${title}\n${translations.currentValue}: ${latestValue} ${units}`;
    }
    
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
      currentStatus: 'Aktuálny stav',
      lastMinutes: 'posledných {minutes} minút',
      online: 'Online',
      offline: 'Offline'
    };
  } else {
    return {
      time: 'Time',
      value: 'Value',
      currentValue: 'Current value',
      currentStatus: 'Current status',
      lastMinutes: 'last {minutes} minutes',
      online: 'Online',
      offline: 'Offline'
    };
  }
}

/**
 * Generate a chart image using simple SVG generation
 * 
 * @param {Object} data - Chart data containing timestamps and values
 * @param {string} title - Chart title
 * @param {string} yAxis - Y-axis label
 * @param {string} type - Data type (temperature, humidity, pressure, uptime)
 * @param {Object} translations - Translation strings
 * @param {string} currentStatus - Current status for uptime charts (online/offline)
 * @returns {Promise<Buffer>} - Chart image as a buffer
 */
async function generateChartSvg(data, title, yAxis, type, translations, currentStatus = '') {
  if (!data || !data.length) {
    throw new Error('No data provided for chart generation');
  }
  
  // Special handling for uptime/status chart
  const isUptimeChart = type === 'uptime' || type === 'status';
  
  // Set online color to green, offline to red
  const onlineColor = '#4BC0C0';  // Green - device is online
  const offlineColor = '#FF6384'; // Red - device is offline
  
  // Ensure we don't exceed a reasonable number of data points
  // Increase for better resolution when data is sparse
  const MAX_CHART_POINTS = isUptimeChart ? 200 : 100; // Higher resolution for uptime charts
  
  let chartData = [...data];
  if (chartData.length > MAX_CHART_POINTS && !isUptimeChart) {
    // Only apply this sampling for non-uptime charts
    // Use a more intelligent sampling method to preserve important features
    const sampledData = [];
    const step = Math.ceil(chartData.length / MAX_CHART_POINTS);
    
    // For longer ranges, we need to ensure we don't miss key points
    // This is a simple version of the Largest-Triangle-Three-Buckets algorithm
    for (let i = 0; i < chartData.length - step; i += step) {
      // Add the first point in the bucket
      sampledData.push(chartData[i]);
      
      // Find the maximum and minimum in this bucket and add them if they're significantly different
      const bucket = chartData.slice(i, i + step);
      if (bucket.length > 2) {
        const maxPoint = bucket.reduce((max, p) => p.value > max.value ? p : max, bucket[0]);
        const minPoint = bucket.reduce((min, p) => p.value < min.value ? p : min, bucket[0]);
        
        // If max and min are different points and different from the first point, add them
        if (maxPoint !== bucket[0] && 
            minPoint !== bucket[0] && 
            maxPoint !== minPoint && 
            Math.abs(maxPoint.value - minPoint.value) > 0.1) {
          sampledData.push(maxPoint);
          sampledData.push(minPoint);
        }
      }
    }
    
    // Always include the last data point to show the most recent value
    if (sampledData[sampledData.length - 1] !== chartData[chartData.length - 1]) {
      sampledData.push(chartData[chartData.length - 1]);
    }
    
    // Sort by time to ensure proper order
    chartData = sampledData.sort((a, b) => a.time - b.time);
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
    case 'uptime':
    case 'status':
      // For uptime charts, use green color
      lineColor = onlineColor;
      break;
    default:
      lineColor = '#4BC0C0';
  }
  
  // SVG dimensions
  const width = 800;
  const height = 400;
  const padding = 60;
  
  // Special handling for uptime/status charts - fixed y-axis scale between 0 and 1
  let minValue, maxValue, valueRange;
  
  if (isUptimeChart) {
    minValue = -0.1; // Slightly below 0 for visual clarity
    maxValue = 1.1;  // Slightly above 1 for visual clarity
    valueRange = maxValue - minValue;
  } else {
    // For other charts, calculate based on actual data
    minValue = Math.min(...values) * 0.98; // Add 2% padding below
    maxValue = Math.max(...values) * 1.02; // Add 2% padding above
    valueRange = Math.max(maxValue - minValue, 1); // Prevent division by zero
  }
  
  // Calculate coordinates for the line with better scaling
  const pointsPerAxis = Math.max(chartData.length - 1, 1);
  const xStep = (width - 2 * padding) / pointsPerAxis;
  
  // For uptime charts, we'll use a specialized visualization
  let points = '';
  let segmentPaths = [];
  
  if (isUptimeChart) {
    // Create a more advanced visualization for uptime data
    // Generate segments with different colors based on status
    let currentSegment = { 
      status: values[0] > 0, 
      points: [] 
    };
    
    for (let i = 0; i < values.length; i++) {
      const x = padding + i * xStep;
      const normalizedValue = ((values[i] > 0 ? 1 : 0) - minValue) / valueRange;
      const y = height - padding - normalizedValue * (height - 2 * padding);
      
      const isOnline = values[i] > 0;
      
      // If status changed, start a new segment
      if (isOnline !== currentSegment.status) {
        segmentPaths.push({
          points: currentSegment.points.join(' '),
          color: currentSegment.status ? onlineColor : offlineColor
        });
        
        currentSegment = { 
          status: isOnline,
          points: []
        };
        
        // Add connecting vertical line for step-like appearance
        const prevX = padding + (i - 1) * xStep;
        currentSegment.points.push(`${prevX},${y}`);
      }
      
      currentSegment.points.push(`${x},${y}`);
    }
    
    // Add the last segment
    if (currentSegment.points.length > 0) {
      segmentPaths.push({
        points: currentSegment.points.join(' '),
        color: currentSegment.status ? onlineColor : offlineColor
      });
    }
    
    // Also create the combined points for the grid
    points = chartData.map((point, index) => {
      const x = padding + index * xStep;
      // For uptime data, map to either 0 or 1 (binary status)
      const status = point.value > 0 ? 1 : 0;
      const normalizedValue = (status - minValue) / valueRange;
      const y = height - padding - normalizedValue * (height - 2 * padding);
      return `${x},${y}`;
    }).join(' ');
  } else {
    // Regular line chart for other data types
    points = values.map((value, index) => {
      const x = padding + index * xStep;
      const normalizedValue = (value - minValue) / valueRange;
      const y = height - padding - normalizedValue * (height - 2 * padding);
      return `${x},${y}`;
    }).join(' ');
  }
  
  // Generate X-axis labels with improved time formatting
  const xLabels = [];
  // Dynamically adjust the number of labels based on chart width
  const numXLabels = Math.min(12, times.length); // Show more labels for better time context
  const xLabelStep = Math.max(1, Math.floor(times.length / numXLabels));
  
  for (let i = 0; i < times.length; i += xLabelStep) {
    // Format date for better readability
    const date = new Date(chartData[i].time);
    const formattedTime = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    xLabels.push({
      text: formattedTime,
      x: padding + i * xStep,
      y: height - padding + 20
    });
  }
  
  // Add the last time label if it's not already included
  if (xLabels.length > 0 && xLabels[xLabels.length - 1].text !== times[times.length - 1]) {
    const lastDate = new Date(chartData[chartData.length - 1].time);
    const lastFormattedTime = lastDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    xLabels.push({
      text: lastFormattedTime,
      x: padding + (times.length - 1) * xStep,
      y: height - padding + 20
    });
  }
  
  // Generate Y-axis labels with better value distribution
  const yLabels = [];
  
  if (isUptimeChart) {
    // For uptime charts, just show "Online" and "Offline" labels
    yLabels.push({
      text: translations.offline,
      x: padding - 10,
      y: height - padding - 0.1 * (height - 2 * padding)
    });
    
    yLabels.push({
      text: translations.online,
      x: padding - 10,
      y: padding + 0.1 * (height - 2 * padding)
    });
  } else {
    // For other charts, use numeric labels
    const numYLabels = 5; // Use 5 labels for better distribution
    
    for (let i = 0; i < numYLabels; i++) {
      const value = minValue + (i / (numYLabels - 1)) * valueRange;
      yLabels.push({
        // Format with appropriate decimal places based on value range
        text: valueRange < 10 ? value.toFixed(2) : value.toFixed(1),
        x: padding - 10,
        y: height - padding - (i / (numYLabels - 1)) * (height - 2 * padding)
      });
    }
  }
  
  // Add date to the chart title for better context
  const firstDate = new Date(chartData[0].time);
  const lastDate = new Date(chartData[chartData.length - 1].time);
  const dateStr = firstDate.toLocaleDateString();
  const enhancedTitle = `${title} (${dateStr})`;
  
  // Create the SVG with improved styling and responsiveness
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="background-color: white; font-family: Arial, sans-serif;">
      <text x="${width / 2}" y="30" text-anchor="middle" font-size="16" font-weight="bold">${enhancedTitle}</text>
      
      <!-- Y-axis -->
      <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="black" stroke-width="1" />
      <text x="${padding - 30}" y="${height / 2}" transform="rotate(-90 ${padding - 30} ${height / 2})" text-anchor="middle" font-size="12">${yAxis}</text>
      ${yLabels.map(label => `<text x="${label.x}" y="${label.y}" text-anchor="end" font-size="10">${label.text}</text>`).join('\n')}
      
      <!-- X-axis -->
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="black" stroke-width="1" />
      <text x="${width / 2}" y="${height - 10}" text-anchor="middle" font-size="12">${translations.time}</text>
      ${xLabels.map(label => `<text x="${label.x}" y="${label.y}" text-anchor="middle" font-size="10" transform="rotate(45 ${label.x} ${label.y})">${label.text}</text>`).join('\n')}
      
      <!-- Grid lines for better readability -->
      ${yLabels.map(label => `<line x1="${padding}" y1="${label.y}" x2="${width - padding}" y2="${label.y}" stroke="#EEEEEE" stroke-width="1" />`).join('\n')}
      
      <!-- Data area background for better visibility -->
      <rect x="${padding}" y="${padding}" width="${width - 2 * padding}" height="${height - 2 * padding}" fill="#F8F8F8" opacity="0.5" />
      
      <!-- Data points and line with enhanced styling -->
      ${isUptimeChart 
        ? segmentPaths.map(segment => 
            `<polyline points="${segment.points}" fill="none" stroke="${segment.color}" stroke-width="3" />`
          ).join('\n')
        : `<polyline points="${points}" fill="none" stroke="${lineColor}" stroke-width="2" />`
      }
      
      ${isUptimeChart 
        ? values.map((value, index) => {
            const x = padding + index * xStep;
            const status = value > 0 ? 1 : 0;
            const normalizedValue = (status - minValue) / valueRange;
            const y = height - padding - normalizedValue * (height - 2 * padding);
            const pointColor = value > 0 ? onlineColor : offlineColor;
            
            return `<circle cx="${x}" cy="${y}" r="2" fill="${pointColor}" />`;
          }).join('\n')
        : values.map((value, index) => {
            const x = padding + index * xStep;
            const normalizedValue = (value - minValue) / valueRange;
            const y = height - padding - normalizedValue * (height - 2 * padding);
            
            return `<circle cx="${x}" cy="${y}" r="3" fill="${lineColor}" />`;
          }).join('\n')
      }
      
      <!-- Highlight the most recent status with better visibility -->
      ${(() => {
        const lastIndex = values.length - 1;
        const lastX = padding + lastIndex * xStep;
        
        if (isUptimeChart) {
          // Make sure we use the correct status, with fallback to current status param
          const isLastPointOnline = currentStatus 
            ? currentStatus === translations.online 
            : values[lastIndex] > 0;
          
          const lastY = isLastPointOnline
            ? padding + 0.1 * (height - 2 * padding) // Online position
            : height - padding - 0.1 * (height - 2 * padding); // Offline position
            
          const statusColor = isLastPointOnline ? onlineColor : offlineColor;
          const statusText = isLastPointOnline ? translations.online : translations.offline;
          
          return `
            <circle cx="${lastX}" cy="${lastY}" r="6" fill="${statusColor}" stroke="white" stroke-width="2" />
            <text x="${lastX + 10}" y="${lastY - 10}" font-size="14" font-weight="bold" fill="${statusColor}">${statusText}</text>
          `;
        } else {
          const normalizedValue = (values[lastIndex] - minValue) / valueRange;
          const lastY = height - padding - normalizedValue * (height - 2 * padding);
          
          return `
            <circle cx="${lastX}" cy="${lastY}" r="5" fill="${lineColor}" stroke="white" stroke-width="2" />
            <text x="${lastX + 10}" y="${lastY - 10}" font-size="12" fill="${lineColor}" font-weight="bold">${values[lastIndex].toFixed(2)}</text>
          `;
        }
      })()}
      
      <!-- Status indicator -->
      ${isUptimeChart && currentStatus ? `
        <text x="${width - padding - 10}" y="${padding + 20}" font-size="14" font-weight="bold" text-anchor="end" 
              fill="${currentStatus === translations.online ? onlineColor : offlineColor}">
          ${currentStatus}
        </text>
      ` : ''}
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