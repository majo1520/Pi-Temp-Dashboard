# BME280 Sensor MQTT Publisher

This component reads temperature, humidity, pressure, and altitude data from a BME280 sensor and publishes it to an MQTT broker.

## Features

- **Configuration-based setup**: All settings managed through a config file
- **Robust error handling**: Automatic recovery from sensor and network failures
- **Message queuing**: Stores messages when MQTT broker is unavailable
- **Data validation**: Ensures readings are within realistic ranges
- **TLS support**: Secure communication with the MQTT broker
- **Service integration**: Runs as a system service with auto-restart
- **Status reporting**: Reports online/offline status

## New Features and Enhancements

The publisher has been enhanced for improved accuracy and long-term reliability:

- **Multi-sample readings** with outlier rejection for higher accuracy
- **Advanced filtering** with configurable oversampling and IIR filtering
- **Temporal smoothing** using exponential smoothing algorithm
- **Improved error handling** with intelligent recovery mechanisms
- **Detailed diagnostics** and quality metrics in logs

For details on these enhancements and how to configure them for optimal performance, see the [Publisher Enhancements](PUBLISHER_ENHANCEMENTS.md) documentation.

## Hardware Requirements

- Raspberry Pi or similar SBC with I2C support
- BME280 temperature/humidity/pressure sensor connected via I2C
- Internet connectivity for MQTT communication

## Installation

1. **Run the setup script**:

```bash
chmod +x setup_bme280.sh
sudo ./setup_bme280.sh
```

This script will:
- Install required dependencies
- Set up Python environment
- Configure and enable the system service
- Test I2C connectivity to the sensor

2. **Configure settings**:

Edit the `sensor_config.ini` file to match your environment:

```bash
nano sensor_config.ini
```

## Configuration Options

### MQTT Settings

```ini
[mqtt]
host = localhost          # MQTT broker address
port = 1883               # MQTT broker port
username =                # MQTT username (if required)
password =                # MQTT password (if required)
use_tls = false           # Enable/disable TLS encryption
ca_certs = ca.crt         # CA certificate file for TLS
certfile = client.crt     # Client certificate for TLS
keyfile = client.key      # Client key for TLS
client_id = bme280-sensor1 # Unique client ID
```

### Sensor Settings

```ini
[sensor]
location = IT OFFICE      # Physical location identifier
sample_rate = 5           # Reading interval in seconds
address = 0x76            # I2C address of BME280 (0x76 or 0x77)
```

### Data Validation Settings

```ini
[data]
temp_min = -40            # Minimum valid temperature (°C)
temp_max = 85             # Maximum valid temperature (°C)
humidity_min = 0          # Minimum valid humidity (%)
humidity_max = 100        # Maximum valid humidity (%)
pressure_min = 300        # Minimum valid pressure (hPa)
pressure_max = 1100       # Maximum valid pressure (hPa)
```

## MQTT Topics

The script publishes to the following topics:

- `senzory/{LOCATION}/readings` - Sensor readings (JSON format)
- `senzory/{LOCATION}/status` - Online/offline status (JSON format)

## JSON Message Format

### Readings Message

```json
{
  "location": "IT OFFICE",
  "temperature": 23.45,
  "humidity": 43.21,
  "pressure": 1013.25,
  "altitude": 125.5,
  "timestamp": "2023-06-15 14:32:00",
  "local_time": "2023-06-15 16:32:00"
}
```

### Status Message

```json
{
  "location": "IT OFFICE",
  "status": "online",
  "timestamp": "2023-06-15 14:32:00"
}
```

## Service Management

Start the service:
```bash
sudo systemctl start bme280-service
```

Stop the service:
```bash
sudo systemctl stop bme280-service
```

Check status:
```bash
sudo systemctl status bme280-service
```

View logs:
```bash
journalctl -u bme280-service -f
```

## Troubleshooting

### Sensor not detected

1. Check I2C connectivity:
```bash
i2cdetect -y 1
```

2. Verify sensor address in configuration (usually 0x76 or 0x77)

3. Check wiring connections

### MQTT Connection Issues

1. Verify MQTT broker is running:
```bash
systemctl status mosquitto
```

2. Test MQTT connection:
```bash
mosquitto_pub -h localhost -t test -m "test message"
```

3. Check firewall settings if connecting to a remote broker

### Log Analysis

Check error logs to diagnose issues:
```bash
cat bme280_errors.log
``` 