# Telegram Notifications Setup Guide

This guide explains how to configure and use the Telegram notification system in the IoT Sensor Dashboard. The notification system allows you to receive real-time alerts when sensor values (temperature, humidity, pressure) exceed configured thresholds.

## Prerequisites

1. A Telegram account
2. Access to the IoT Sensor Dashboard with admin rights
3. The dashboard backend server running

## Step 1: Create a Telegram Bot

To send notifications, you need to create a Telegram bot:

1. Open Telegram and search for "BotFather" (@BotFather)
2. Start a chat with BotFather
3. Send the `/newbot` command
4. Follow the instructions to create your bot:
   - Provide a name for your bot (e.g., "My Sensor Dashboard")
   - Provide a username for your bot (must end in "bot", e.g., "my_sensor_dashboard_bot")
5. BotFather will provide an API token (looks like `123456789:ABCdefGhIJklmNoPQRsTUVwxyZ`)
6. **Keep this token secure** - it gives control over your bot

## Step 2: Configure the Server

1. Add the following variables to your backend `.env` file:

```
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_NOTIFICATIONS_ENABLED=true
# Optional debug mode for easier development
TELEGRAM_DEV_MODE=false
```

2. Restart the backend server to apply the changes

## Step 3: Set Up Notifications in Dashboard

1. Log in to the dashboard with admin credentials
2. Navigate to the Notifications settings page
3. In the Telegram section:
   - Initiate the connection setup
   - Follow the instructions to connect with your bot
   - Send a test message to verify the connection

## Step 4: Configure Notification Thresholds

For each sensor location:

1. Enable/disable notifications as needed
2. Set the threshold values:
   - **Temperature**: min and max values in °C
   - **Humidity**: min and max values in %
   - **Pressure**: min and max values in hPa
3. Choose the threshold mode:
   - **Range mode**: Notify when values are outside the min-max range
   - **Max mode**: Notify when values exceed a target value (for alert-on-target scenarios)
4. Configure notification frequency to avoid notification fatigue
5. Enable/disable chart attachments with notifications

## Notification Types

The system provides two types of notifications:

1. **Threshold Alerts**: Sent when sensor values exceed configured thresholds
2. **Charts**: Optional graphical representations of recent sensor data

### Threshold Alert Format

Threshold alerts include:
- Sensor type (temperature, humidity, pressure)
- Current value
- Threshold information
- Location name

Example:
```
🌡️ Temperature is 32.5°C (outside range 18°C - 30°C) at Office
```

### Chart Format

Charts provide visual context for the alert, showing:
- Recent history for the specific sensor
- Current trend
- The threshold line(s)
- Timestamp of the reading

## Advanced Configuration

### Notification Frequency

To prevent notification fatigue, the system enforces a minimum time between notifications for each location:

1. Default: 30 minutes
2. Configurable per location in the dashboard
3. Separate tracking for each user and location combination

### Multilingual Support

The notification system supports multiple languages:

1. English (default)
2. Slovak

Change the language in the notification settings section.

### Debugging

If you're having trouble with notifications:

1. Enable debug mode with `TELEGRAM_DEV_MODE=true` in your `.env` file
2. Check the server logs for detailed information about notification attempts
3. Use the "Test Connection" button to verify your setup

## Troubleshooting

| Problem | Possible Solutions |
|---------|-------------------|
| No notifications received | 1. Verify your bot token is correct<br>2. Make sure you started a chat with your bot<br>3. Check `TELEGRAM_NOTIFICATIONS_ENABLED` is set to `true`<br>4. Verify thresholds are properly configured |
| Duplicate notifications | Wait for the notification frequency timeout to expire |
| Missing charts | Make sure the chart generation dependencies are installed |
| Test message works but no threshold alerts | Check the threshold configuration and make sure sensor values exceed them |

## Security Considerations

- Keep your bot token secure
- The bot can only send messages to users who initiated contact
- Consider using a dedicated bot for each installation

## API Endpoints

For frontend or API integration, these endpoints are available:

- `GET /api/notifications/telegram/settings` - Get current settings
- `POST /api/notifications/telegram/settings` - Update settings
- `POST /api/notifications/telegram/test` - Send test message
- `POST /api/notifications/telegram/notify` - Trigger a manual notification
- `POST /api/notifications/telegram/chart` - Send a sensor chart
- `POST /api/notifications/telegram/notify-with-chart` - Send notification with attached chart 