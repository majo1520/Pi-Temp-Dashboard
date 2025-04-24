# Telegram Notification System

The IoT Sensor Dashboard includes a powerful Telegram notification system that allows you to receive alerts when your sensors detect readings outside of configured thresholds. This document provides detailed information on setting up, configuring, and troubleshooting the notification system.

## Features

- **Real-time Alerts**: Receive immediate notifications when sensor readings go outside specified ranges
- **Multi-sensor Support**: Configure different thresholds for each location and sensor type
- **Intelligent Throttling**: Set notification frequency to prevent alert storms during prolonged threshold violations
- **Data Visualization**: Receive charts with historical data alongside alert messages
- **Multiple Threshold Types**: Choose between 'range' mode (min/max) or 'max' mode (ceiling threshold)
- **Bilingual Support**: Receive notifications in English or Slovak
- **Test Functionality**: Easily verify your configuration with test notifications and charts
- **Global Toggle**: Quickly enable/disable all notifications with a single switch
- **Customization**: Per-location and per-sensor type configuration options

## Prerequisites

- A Telegram account
- Access to the IoT Sensor Dashboard admin interface
- The dashboard backend running with proper configuration

## Setting Up Your Telegram Bot

1. **Create a Telegram Bot**:
   - Open Telegram and search for [@BotFather](https://t.me/botfather)
   - Start a chat and send `/newbot` command
   - Follow the instructions to name your bot
   - Copy the HTTP API token provided (it looks like `123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ`)

2. **Configure Environment Variables**:
   - Add the following to your backend's `.env` file:
   ```
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   TELEGRAM_NOTIFICATIONS_ENABLED=true
   ```
   - Restart the backend server to apply changes

## Configuring Notifications in the Dashboard

1. **Access the Telegram Settings**:
   - Log in to the dashboard with an admin account
   - Navigate to the Admin Panel
   - Click on "Telegram Alerts" in the sidebar

2. **Link Your Telegram Account**:
   - Find your created bot in Telegram and start a chat
   - Send any message to the bot
   - Copy the Chat ID displayed in the Telegram Settings panel
   - Alternatively, use the "Start Chat" link in the dashboard if provided
   - Paste your Chat ID in the "Telegram Chat ID" field

3. **Configure Global Settings**:
   - **Enable/Disable**: Toggle the master switch to enable or disable all notifications
   - **Notification Frequency**: Set how often (in minutes) notifications can be sent for the same alert condition
   - **Notification Language**: Choose between English or Slovak for your alerts
   - **Include Charts**: Enable/disable sending charts with notifications

4. **Configure Per-Location Thresholds**:
   - Select a location from the dropdown menu
   - For each sensor type (temperature, humidity, pressure):
     - Enable/disable alerts for this specific type
     - Set minimum and maximum thresholds or target values
     - Select threshold type:
       - **Range**: Alerts when values go below min or above max
       - **Max**: Alerts when values reach or exceed the target

5. **Test Your Configuration**:
   - Click "Send Test Message" to verify your Chat ID is correct
   - Click "Test Chart" for each sensor type to verify chart generation

6. **Save Your Settings**:
   - Click "Save Settings" to apply your configuration

## Understanding Notification Types

### Range Threshold

Range thresholds monitor when values go outside a specified range. For example, if you set temperature thresholds to min=18°C and max=25°C:
- You'll receive alerts if temperature drops below 18°C
- You'll receive alerts if temperature rises above 25°C
- No alerts will be sent while temperature stays between 18-25°C

### Max Threshold

Max thresholds notify you when a value reaches or exceeds a target value. For example, if you set a humidity max threshold of 60%:
- You'll receive an alert when humidity reaches or exceeds 60%
- No alerts will be sent while humidity stays below 60%

This is useful for monitoring when a condition reaches a critical point rather than maintaining a specific range.

## Charts in Notifications

When enabled, the system will send charts showing sensor data alongside alert notifications:

- Charts display approximately one hour of historical data
- Each chart includes the current value and timestamp
- Charts are generated on the server using Chart.js
- Chart generation requires proper configuration of the Node.js canvas package

## Notification Frequency

The notification frequency setting helps prevent "alert storms" during prolonged threshold violations:

- Set in minutes (default: 30 minutes)
- After sending a notification for a specific location and sensor type, the system will not send another notification for that same alert condition until the specified time has passed
- Each location and sensor type is tracked separately
- The frequency does not affect test notifications

## Troubleshooting

### Common Issues

1. **No notifications receiving**:
   - Verify TELEGRAM_BOT_TOKEN is correct in your `.env` file
   - Ensure TELEGRAM_NOTIFICATIONS_ENABLED=true in your `.env` file
   - Check if you've started a conversation with your bot in Telegram
   - Verify the Chat ID in the dashboard settings
   - Make sure the master toggle is enabled in the dashboard

2. **No charts in notifications**:
   - Verify the chart packages are installed: `canvas` and `chartjs-node-canvas`
   - Check server logs for canvas-related errors
   - On some systems, additional dependencies might be required:
     ```bash
     # For Ubuntu/Debian
     sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
     
     # For CentOS/RHEL
     sudo yum install gcc-c++ cairo-devel pango-devel libjpeg-turbo-devel giflib-devel
     ```

3. **Delayed notifications**:
   - Check your notification frequency setting
   - Verify server system time is correct
   - Review server logs for any processing delays

4. **Missing data in charts**:
   - Ensure InfluxDB is properly configured and accessible
   - Verify data is being stored for the time period shown in charts
   - Check for permissions issues with the temp directory

### Log Files

For detailed troubleshooting, check these logs:

- **Backend Server Logs**: Contains general notification service logs
- **Telegram Debug Logs**: When running in development mode with `NODE_ENV` not set to production

## Advanced Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| TELEGRAM_BOT_TOKEN | Your Telegram bot token | none (required) |
| TELEGRAM_NOTIFICATIONS_ENABLED | Master toggle for notifications | false |
| TELEGRAM_DEV_MODE | Allow API access without authentication in dev mode | false |
| LOGGING_LEVEL | Set log verbosity (ALL, ERROR, NONE) | ALL (dev) / ERROR (prod) |

### Custom Notifications Directory

You can customize where temporary chart files are stored:

```javascript
// In backend/telegram-chart.cjs
const tempDir = path.join(__dirname, 'custom-temp-directory');
```

## Security Considerations

- Bot tokens should be kept secure and not shared
- The Telegram API uses HTTPS for all communications
- Chart images are deleted from the server after sending
- In production, notifications API endpoints are protected by authentication
- Consider limiting dashboard access to authorized users only
- Review Telegram's privacy policies for data handling

## API Reference

For developers, the dashboard exposes several endpoints for the Telegram notification system:

- `GET /api/notifications/telegram/settings` - Retrieve current settings
- `POST /api/notifications/telegram/settings` - Update settings
- `POST /api/notifications/telegram/test` - Send test notification
- `POST /api/telegram/chart` - Send a test chart
- `POST /api/notifications/telegram/notify` - Trigger a notification for threshold violation
- `POST /api/telegram/notify-with-chart` - Trigger a notification with chart for threshold violation

## Additional Resources

- [Telegram Bot API Documentation](https://core.telegram.org/bots/api)
- [Chart.js Documentation](https://www.chartjs.org/docs/latest/)
- [Canvas Node.js Documentation](https://github.com/Automattic/node-canvas) 