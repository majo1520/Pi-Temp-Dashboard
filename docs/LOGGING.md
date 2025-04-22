# Logging System Documentation

This document describes the comprehensive logging system used throughout the application, covering both frontend and backend components.

## Table of Contents

- [Frontend Console Logging](#frontend-console-logging)
  - [Configuration Options](#frontend-configuration-options)
  - [Runtime Control](#runtime-control)
  - [Implementation Details](#frontend-implementation-details)
- [Backend Logging](#backend-logging)
  - [Configuration Options](#backend-configuration-options)
  - [Log Formats](#log-formats)
  - [Log Rotation](#log-rotation)
  - [Performance Monitoring](#performance-monitoring)
- [BME280 Publisher Logging](#bme280-publisher-logging)
  - [Configuration Options](#bme280-configuration-options)
  - [Log Files](#bme280-log-files)
  - [Service Logs](#service-logs)
- [Troubleshooting](#troubleshooting)

## Frontend Console Logging

The frontend application includes a sophisticated console logging system that can be configured to show different levels of detail in the browser console, helping with debugging while keeping production environments clean.

### Frontend Configuration Options

You can configure logging behavior using the following environment variables in the `.env` file:

#### VITE_CONSOLE_LOG_LEVEL

Controls which types of logs are shown in the browser console.

Available options:
- `ALL` - Shows all console messages (logs, warnings, errors)
- `ERRORS_ONLY` - Only shows warnings and errors
- `NONE` - Silences all console logs

Example:
```
VITE_CONSOLE_LOG_LEVEL=ERRORS_ONLY
```

#### VITE_SUPPRESS_AUTH_ERRORS

Controls whether authentication errors (HTTP 401 Unauthorized) are shown in the console.

- `true` - Hides all 401 Unauthorized errors
- `false` - Shows 401 errors normally

Example:
```
VITE_SUPPRESS_AUTH_ERRORS=true
```

#### VITE_DISABLE_LOGS (Legacy)

A legacy setting that can be used to disable all logs except errors.

- `true` - Disables all logs except errors
- `false` - Allows logs based on other settings

Example:
```
VITE_DISABLE_LOGS=true
```

### Runtime Control

You can control logging at runtime through the browser console:

- Enable all logs: `window.enableLogs()`
- Disable all logs: `window.disableLogs()`
- Check if logs are enabled: `window.isLogsEnabled()`
- Check if a specific log type should be shown: `window.shouldShowLogType('log')`
- Check if auth errors are suppressed: `window.shouldSuppressAuthErrors()`

Note: Runtime settings are stored in localStorage and will persist until changed. Environment variables take precedence over runtime settings.

### Frontend Implementation Details

The logging system is implemented through these key components:

1. **Console Interceptor** (`consoleInterceptor.js`): Intercepts and filters all console methods based on configuration.
2. **Toggle Logs Utility** (`toggleLogs.js`): Provides functions to enable/disable logs and check current settings.
3. **Fetch Interceptor** (`fetchInterceptor.js`): Suppresses 401 auth errors in network requests.
4. **Logger** (`logger.js`): Enhanced logging with aggregation, rotation, and performance metrics.

The system is initialized in `main.jsx` during application startup.

## Backend Logging

The backend includes a comprehensive logging system with support for multiple log levels, formats, rotation, and performance monitoring.

### Backend Configuration Options

Configure backend logging using these environment variables:

#### LOG_LEVEL

Sets the minimum level of logs to record.

Options:
- `debug` - All logs, including detailed debug information
- `info` - Informational messages, warnings, and errors
- `warn` - Only warnings and errors
- `error` - Only errors

Example:
```
LOG_LEVEL=info
```

#### LOG_FORMAT

Determines the format of log output.

Options:
- `simple` - Basic, human-readable format
- `json` - Structured JSON format for machine processing
- `dev` - Colorized, detailed format for development

Example:
```
LOG_FORMAT=json
```

#### ENABLE_ADVANCED_LOGGING

Enables enhanced logging features.

- `true` - Enables detailed logging with metrics
- `false` - Basic logging only

Example:
```
ENABLE_ADVANCED_LOGGING=true
```

#### LOG_TO_FILE

Controls whether logs are written to files or just to console.

- `true` - Write logs to files
- `false` - Output logs to console only

Example:
```
LOG_TO_FILE=true
LOG_FILE_PATH=logs/server.log
```

### Log Formats

When using JSON format, logs include these fields:
- `timestamp` - ISO 8601 timestamp
- `level` - Log level (debug, info, warn, error)
- `message` - Main log message
- `context` - Additional structured data
- `service` - Service or module name
- `requestId` - Unique ID for request tracing (when available)

### Log Rotation

Logs are automatically rotated based on these settings:
- `LOG_RETENTION_DAYS` - Days to keep logs before deletion
- `LOG_MAX_SIZE` - Maximum size in MB before rotation
- `LOG_MAX_FILES` - Maximum number of log files to keep

Example:
```
LOG_RETENTION_DAYS=30
LOG_MAX_SIZE=10
LOG_MAX_FILES=5
```

### Performance Monitoring

When enabled, performance monitoring records:
- Database query execution times
- API endpoint response times
- Memory usage
- Request counts and error rates

Configure with:
```
ENABLE_PERFORMANCE_MONITORING=true
PERFORMANCE_SAMPLE_RATE=0.1  # Sample 10% of requests
```

## BME280 Publisher Logging

The BME280 Sensor Publisher includes a flexible logging system that can be fully customized through the `sensor_config.ini` file.

### BME280 Configuration Options

The following options can be configured in the `[logging]` section of `sensor_config.ini`:

#### Log Level

Determines the minimum severity level of messages to log:

```
# Log level options: DEBUG, INFO, WARNING, ERROR, CRITICAL
log_level = INFO
```

- `DEBUG` - Most detailed logging, includes diagnostic information
- `INFO` - General operational information
- `WARNING` - Issues that don't prevent operation but should be noted
- `ERROR` - Significant problems that affect functionality
- `CRITICAL` - Severe errors that may cause the application to terminate

#### File Logging

Controls whether logs are written to files:

```
# Enable logging to file
file_logging = true
# Log file path
log_file = bme280_publisher.log
```

#### Log Rotation

Prevents log files from growing too large by rotating them:

```
# Maximum log file size in bytes (10MB default)
max_log_size = 10485760
# Number of backup log files to keep
backup_count = 5
```

When the log file reaches the maximum size, it's renamed to `bme280_publisher.log.1`, and a new log file is created. Older log files are shifted, and if they exceed `backup_count`, the oldest is deleted.

#### Console Logging

Controls whether logs are displayed in the console (default is disabled to reduce noise):

```
# Enable console logging (default is false)
console_logging = false
```

#### Separate Error Logs

Routes error and critical messages to a separate file for easier monitoring:

```
# Use a separate file for error logs
separate_error_log = true
# Error log file path
error_log_file = bme280_errors.log
```

#### Log Format

Customizes the format of log messages:

```
# Log format
log_format = %%(asctime)s [%%(levelname)s] %%(message)s
# Date format for logs
date_format = %%Y-%%m-%%d %%H:%%M:%%S
```

Note the double `%%` is required in the INI file to escape the `%` character.

### BME280 Log Files

The BME280 publisher creates the following log files by default:

1. **Main log file** (`bme280_publisher.log`): Contains all logs at or above the configured level.
2. **Error log file** (`bme280_errors.log`): Contains only ERROR and CRITICAL level logs.

Both files are automatically rotated to prevent disk space issues.

### Service Logs

When running as a systemd service, logs are also captured by the journal. You can view them with:

```bash
sudo journalctl -u bme280-publisher
```

To view only errors from the service:

```bash
sudo journalctl -u bme280-publisher -p err
```

To follow logs in real-time:

```bash
sudo journalctl -u bme280-publisher -f
```

## Troubleshooting

### Frontend Logs Not Being Suppressed

If logs are still appearing despite being disabled:

1. Check that `consoleInterceptor.js` is properly initialized in your main entry point
2. Verify that the localStorage settings match what the code expects
3. Check for conflicts with browser extensions or development tools
4. Make sure environment variables are properly set and the app has been rebuilt

### Backend Logs Missing

If backend logs aren't appearing as expected:

1. Verify LOG_LEVEL setting (higher levels suppress lower ones)
2. Check file permissions if LOG_TO_FILE is enabled
3. Ensure log directory exists and is writable
4. Check disk space if logs suddenly stop

### Common Error Patterns

Certain patterns in logs may indicate specific issues:

- Frequent 401 errors: Session management issues
- Repeated "Failed to fetch" errors: Network connectivity or CORS issues
- Memory usage warnings: Potential memory leaks
- Database timeout errors: Connection pool or query optimization issues 