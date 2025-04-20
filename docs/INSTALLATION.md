# Detailed Installation Guide

This guide provides comprehensive installation instructions for setting up the entire IoT Sensor Dashboard system, from hardware configuration to software deployment.

## Table of Contents

1. [Hardware Setup](#1-hardware-setup)
2. [Raspberry Pi Configuration](#2-raspberry-pi-configuration)
3. [InfluxDB Installation](#3-influxdb-installation)
4. [MQTT Broker Setup](#4-mqtt-broker-setup)
5. [Telegraf Configuration](#5-telegraf-configuration)
6. [BME280 Sensor Publisher](#6-bme280-sensor-publisher)
7. [Backend Server Setup](#7-backend-server-setup)
8. [Frontend Application](#8-frontend-application)
9. [Dashboard Configuration](#9-dashboard-configuration)
10. [Production Deployment](#10-production-deployment)
11. [Advanced Configuration](#11-advanced-configuration)
12. [Maintenance Tasks](#12-maintenance-tasks)
13. [Troubleshooting](#13-troubleshooting)

## 1. Hardware Setup

### Components Required:
- Raspberry Pi 3 or newer
- BME280 temperature/humidity/pressure sensor
- Jumper wires
- Optional: case for Raspberry Pi
- microSD card (16GB or larger recommended)
- Power supply for Raspberry Pi

### BME280 Wiring Instructions:
1. Connect the BME280 sensor to the Raspberry Pi GPIO pins:
   - **VCC** pin to **3.3V** (pin 1)
   - **GND** pin to **Ground** (pin 6)
   - **SCL** pin to **GPIO 3/SCL** (pin 5)
   - **SDA** pin to **GPIO 2/SDA** (pin 3)

2. Double-check all connections to ensure proper wiring.

## 2. Raspberry Pi Configuration

### Operating System Installation:
1. Download Raspberry Pi OS (Lite or Desktop) from [Raspberry Pi website](https://www.raspberrypi.org/software/operating-systems/)
2. Flash the OS image to microSD card using Raspberry Pi Imager or similar tool
3. Insert the microSD card into your Raspberry Pi and power it on

### Initial Setup:
```bash
# Update your system
sudo apt update
sudo apt upgrade -y

# Set a hostname (optional)
sudo hostnamectl set-hostname iot-dashboard

# Enable I2C interface for BME280 sensor
sudo raspi-config
# Navigate to: Interface Options > I2C > Enable > Finish
```

### Install Required Packages:
```bash
sudo apt install -y python3-pip git i2c-tools

# Test I2C device detection
sudo i2cdetect -y 1
# You should see "76" in the output grid if BME280 is correctly connected
```

## 3. InfluxDB Installation

### Option A: Using Docker (Recommended)

1. Install Docker:
```bash
curl -sSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and log back in for group changes to take effect
```

2. Create directories for persistent storage:
```bash
mkdir -p ~/iot-dashboard/data/influxdb
mkdir -p ~/iot-dashboard/config/influxdb
```

3. Run InfluxDB container:
```bash
docker run -d -p 8086:8086 \
  --name influxdb \
  --restart unless-stopped \
  -v ~/iot-dashboard/data/influxdb:/var/lib/influxdb2 \
  -v ~/iot-dashboard/config/influxdb:/etc/influxdb2 \
  -e DOCKER_INFLUXDB_INIT_MODE=setup \
  -e DOCKER_INFLUXDB_INIT_USERNAME=admin \
  -e DOCKER_INFLUXDB_INIT_PASSWORD=MySecurePassword123 \
  -e DOCKER_INFLUXDB_INIT_ORG=iot_org \
  -e DOCKER_INFLUXDB_INIT_BUCKET=iot_sensors \
  -e DOCKER_INFLUXDB_INIT_ADMIN_TOKEN=MyVeryLongSecureToken123456789 \
  influxdb:2.6
```

### Option B: Manual Installation

1. Add InfluxDB repository:
```bash
# Add InfluxData GPG key
wget -qO- https://repos.influxdata.com/influxdata-archive_compat.key | sudo tee /etc/apt/trusted.gpg.d/influxdata-archive_compat.asc > /dev/null

# Add InfluxData repository
echo "deb [signed-by=/etc/apt/trusted.gpg.d/influxdata-archive_compat.asc] https://repos.influxdata.com/debian $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/influxdata.list > /dev/null
```

2. Install InfluxDB:
```bash
sudo apt update
sudo apt install influxdb2
```

3. Start InfluxDB service:
```bash
sudo systemctl enable influxdb
sudo systemctl start influxdb
```

4. Setup InfluxDB:
- Navigate to `http://your-raspberry-pi-ip:8086` in a web browser
- Follow the setup wizard to create:
  - An initial user (e.g., admin/MySecurePassword123)
  - Organization name (e.g., iot_org)
  - Bucket name (e.g., iot_sensors)
- Save the generated token for later use!

## 4. MQTT Broker Setup

### Option A: Using Docker

```bash
# Create directories for Mosquitto configuration and data
mkdir -p ~/iot-dashboard/config/mosquitto/config
mkdir -p ~/iot-dashboard/data/mosquitto/data
mkdir -p ~/iot-dashboard/data/mosquitto/log

# Create a basic configuration file
cat > ~/iot-dashboard/config/mosquitto/config/mosquitto.conf << EOF
# Basic configuration
listener 1883
allow_anonymous true

# WebSockets support for web clients
listener 9001
protocol websockets

# Persistence
persistence true
persistence_location /mosquitto/data/
log_dest file /mosquitto/log/mosquitto.log
EOF

# Run Mosquitto container
docker run -d \
  --name mosquitto \
  --restart unless-stopped \
  -p 1883:1883 \
  -p 9001:9001 \
  -v ~/iot-dashboard/config/mosquitto/config:/mosquitto/config \
  -v ~/iot-dashboard/data/mosquitto/data:/mosquitto/data \
  -v ~/iot-dashboard/data/mosquitto/log:/mosquitto/log \
  eclipse-mosquitto
```

### Option B: Manual Installation

```bash
# Install Mosquitto
sudo apt install -y mosquitto mosquitto-clients

# Create configuration file with WebSockets support
sudo tee /etc/mosquitto/conf.d/websockets.conf > /dev/null << EOF
# Main MQTT protocol listener
listener 1883
allow_anonymous true

# WebSockets listener for web clients
listener 9001
protocol websockets
allow_anonymous true
EOF

# Enable and start Mosquitto
sudo systemctl enable mosquitto
sudo systemctl restart mosquitto

# Test MQTT broker
mosquitto_sub -t test &
mosquitto_pub -t test -m "Hello MQTT"
```

## 5. Telegraf Configuration

### Option A: Using Docker

```bash
# Create Telegraf configuration directory
mkdir -p ~/iot-dashboard/config/telegraf

# Create configuration file
cat > ~/iot-dashboard/config/telegraf/telegraf.conf << EOF
# Telegraf Configuration

# Global tags are applied to all metrics
[global_tags]
  environment = "production"

# Agent settings
[agent]
  interval = "10s"
  round_interval = true
  metric_batch_size = 1000
  metric_buffer_limit = 10000
  collection_jitter = "0s"
  flush_jitter = "0s"
  precision = ""
  debug = false
  quiet = false
  hostname = ""
  omit_hostname = false

# Output plugin for InfluxDB v2
[[outputs.influxdb_v2]]
  urls = ["http://influxdb:8086"]
  token = "MyVeryLongSecureToken123456789"
  organization = "iot_org"
  bucket = "iot_sensors"

# MQTT Consumer Input Plugin
[[inputs.mqtt_consumer]]
  servers = ["tcp://mosquitto:1883"]
  topics = ["senzory/#"]
  data_format = "json"
  
  # Extract timestamp from JSON
  json_time_key = "timestamp"
  json_time_format = "2006-01-02 15:04:05"
  
  # Extract string fields
  json_string_fields = ["location"]
  
  # Use location as a tag
  json_name_key = "location"
  tag_keys = ["location"]
  
  # Set measurement name to "bme280"
  measurement = "bme280"
EOF

# Run Telegraf container with Docker network
docker network create iot-network

# Connect existing containers to the network
docker network connect iot-network influxdb
docker network connect iot-network mosquitto

# Run Telegraf container
docker run -d \
  --name telegraf \
  --restart unless-stopped \
  --network iot-network \
  -v ~/iot-dashboard/config/telegraf:/etc/telegraf \
  telegraf
```

### Option B: Manual Installation

```bash
# Add InfluxData repository (if not already done)
wget -qO- https://repos.influxdata.com/influxdata-archive_compat.key | sudo tee /etc/apt/trusted.gpg.d/influxdata-archive_compat.asc > /dev/null
echo "deb [signed-by=/etc/apt/trusted.gpg.d/influxdata-archive_compat.asc] https://repos.influxdata.com/debian $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/influxdata.list > /dev/null

# Install Telegraf
sudo apt update
sudo apt install -y telegraf

# Create Telegraf configuration file
sudo tee /etc/telegraf/telegraf.d/mqtt_to_influxdb.conf > /dev/null << EOF
# Output plugin for InfluxDB v2
[[outputs.influxdb_v2]]
  urls = ["http://localhost:8086"]
  token = "MyVeryLongSecureToken123456789"
  organization = "iot_org"
  bucket = "iot_sensors"

# MQTT Consumer Input Plugin
[[inputs.mqtt_consumer]]
  servers = ["tcp://localhost:1883"]
  topics = ["senzory/#"]
  data_format = "json"
  
  # Extract timestamp from JSON
  json_time_key = "timestamp"
  json_time_format = "2006-01-02 15:04:05"
  
  # Extract string fields
  json_string_fields = ["location"]
  
  # Use location as a tag
  json_name_key = "location"
  tag_keys = ["location"]
  
  # Set measurement name to "bme280"
  measurement = "bme280"
EOF

# Restart Telegraf service
sudo systemctl enable telegraf
sudo systemctl restart telegraf

# Check Telegraf logs for errors
sudo journalctl -u telegraf -f
```

## 6. BME280 Sensor Publisher

### Clone Repository and Configure

```bash
# Clone the repository (assuming you have the repository)
git clone https://github.com/majo1520/Pi-Temp-Dashboard.git
cd iot-sensor-dashboard

# Install Python dependencies
pip3 install -r bme280_publisher/requirements.txt

# Create configuration directory if needed
mkdir -p bme280_publisher
```

### Configuration File Setup

Create the sensor configuration file:

```bash
cat > bme280_publisher/sensor_config.ini << EOF
[mqtt]
host = localhost
port = 1883
username = 
password = 
use_tls = false
client_id = bme280-sensor1

[mqtt_topics]
legacy_topic = senzory/bme280
readings_topic = senzory/{location}/readings
status_topic = senzory/{location}/status
use_legacy_topic = true

[sensor]
location = IT OFFICE
sample_rate = 5
address = 0x76
sea_level_pressure = 1013.25
max_consecutive_errors = 5
init_retry_interval = 30

[data]
temp_min = -40
temp_max = 85
humidity_min = 0
humidity_max = 100
pressure_min = 300
pressure_max = 1100
EOF
```

### Service Setup for Automatic Start

```bash
# Create systemd service file
sudo tee /etc/systemd/system/bme280-publisher.service > /dev/null << EOF
[Unit]
Description=BME280 Sensor Publisher
After=network.target mosquitto.service

[Service]
Type=simple
User=pi
WorkingDirectory=$(pwd)/bme280_publisher
ExecStart=/usr/bin/python3 $(pwd)/bme280_publisher/bme280_publisher.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start the service
sudo systemctl daemon-reload
sudo systemctl enable bme280-publisher
sudo systemctl start bme280-publisher

# Check status
sudo systemctl status bme280-publisher

# Monitor logs
sudo journalctl -u bme280-publisher -f
```

### Testing the Publisher

```bash
# Monitor MQTT messages
mosquitto_sub -t "senzory/#" -v

# Check for errors in the log file
tail -f bme280_publisher/bme280_errors.log
```

## 7. Backend Server Setup

### Install Node.js (if not already installed)

```bash
# Install Node.js using NVM (recommended for version management)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Install Node.js LTS version
nvm install --lts
nvm use --lts

# Verify installation
node --version  # Should return v16.x or higher
npm --version
```

### Configure and Start Backend

```bash
# Navigate to backend directory
cd ~/iot-sensor-dashboard/backend

# Install dependencies
npm install

# Create environment file
cat > .env << EOF
PORT=5000
INFLUX_URL=http://localhost:8086
INFLUX_TOKEN=MyVeryLongSecureToken123456789
ORG=iot_org
BUCKET=iot_sensors
SESSION_SECRET=$(openssl rand -hex 32)
ENABLE_RATE_LIMITING=true
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,http://$(hostname -I | awk '{print $1}'):5000
EOF

# Test run the server
npm run dev
```

### Create a Service for the Backend

```bash
# Create systemd service file
sudo tee /etc/systemd/system/iot-dashboard-backend.service > /dev/null << EOF
[Unit]
Description=IoT Dashboard Backend
After=network.target influxdb.service

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$(pwd)
ExecStart=$(which npm) start
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Enable and start the service
sudo systemctl daemon-reload
sudo systemctl enable iot-dashboard-backend
sudo systemctl start iot-dashboard-backend

# Check status
sudo systemctl status iot-dashboard-backend
```

## 8. Frontend Application

### Build the Frontend

```bash
# Navigate to frontend directory
cd ~/iot-sensor-dashboard/frontend

# Install dependencies
npm install

# Create environment file (optional, for custom configuration)
cat > .env.production << EOF
VITE_API_URL=/api
VITE_MQTT_URL=ws://$(hostname -I | awk '{print $1}'):9001
EOF

# Build for production
npm run build

# The build output will be in the dist/ directory
```

### Testing the Full Stack

1. Make sure all services are running:
   ```bash
   sudo systemctl status influxdb mosquitto telegraf bme280-publisher iot-dashboard-backend
   ```

2. Access the dashboard at:
   ```
   http://your-raspberry-pi-ip:5000
   ```

## 9. Dashboard Configuration

### User Management

The dashboard uses a SQLite database for user management. The first time you run the application, an admin user is created with default credentials. 

To change the admin password:

```bash
# Access the SQLite database
cd ~/iot-sensor-dashboard/backend
sqlite3 dashboard.db

# Inside SQLite shell
sqlite> UPDATE users SET password_hash = '$2b$10$NEW_HASH' WHERE username = 'admin';
sqlite> .exit
```

To generate a new password hash:

```bash
node -e "console.log(require('bcrypt').hashSync('your-new-password', 10))"
```

### Configuring Threshold Alerts

Within the dashboard UI:
1. Go to "Settings" > "Thresholds"
2. Set minimum, middle, and high values for temperature, humidity, and pressure
3. Choose alert colors for each threshold level
4. Save changes

These settings are stored in the user settings in the SQLite database.

## 10. Production Deployment

### Setting Up Nginx as a Reverse Proxy

```bash
# Install Nginx
sudo apt install -y nginx

# Create Nginx configuration
sudo tee /etc/nginx/sites-available/iot-dashboard << EOF
server {
    listen 80;
    server_name $(hostname -I | awk '{print $1}');

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-XSS-Protection "1; mode=block";
    add_header X-Content-Type-Options "nosniff";

    # Proxy to backend
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # WebSocket support for MQTT over WebSockets
    location /mqtt {
        proxy_pass http://localhost:9001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
    }
}
EOF

# Enable the site and restart Nginx
sudo ln -s /etc/nginx/sites-available/iot-dashboard /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

# Open firewall if needed
sudo apt install -y ufw
sudo ufw allow 80/tcp
sudo ufw allow 1883/tcp
sudo ufw allow 9001/tcp
sudo ufw reload
```

### Enabling HTTPS with Let's Encrypt

If your dashboard is exposed to the internet, secure it with HTTPS:

```bash
# Install Certbot for Nginx
sudo apt install -y certbot python3-certbot-nginx

# Obtain and install certificate (replace with your domain name)
sudo certbot --nginx -d your-domain.com

# Certbot will modify your Nginx configuration to enable HTTPS
# Follow the interactive prompts
```

## 11. Advanced Configuration

### Secure MQTT with Credentials

Edit Mosquitto configuration to add authentication:

```bash
# Create password file
sudo mosquitto_passwd -c /etc/mosquitto/passwd mqtt_user

# Update Mosquitto configuration
sudo tee /etc/mosquitto/conf.d/security.conf > /dev/null << EOF
# Disable anonymous access
allow_anonymous false

# Use password file
password_file /etc/mosquitto/passwd
EOF

# Restart Mosquitto
sudo systemctl restart mosquitto
```

Update the BME280 publisher configuration:

```bash
# Edit sensor_config.ini
[mqtt]
host = localhost
port = 1883
username = mqtt_user
password = your_password
use_tls = false
client_id = bme280-sensor1
```

### InfluxDB Data Retention

Set up data retention policies to automatically downsample or expire old data:

1. Navigate to InfluxDB UI at `http://your-raspberry-pi-ip:8086`
2. Go to "Data" > "Buckets" > Select your bucket
3. Click "Add Retention Policy"
4. Set up rules such as:
   - Keep raw data for 30 days
   - Downsample data to 5-minute intervals after 30 days

### Multi-Sensor Setup

To add additional BME280 sensors:

1. Wire each sensor to a different Raspberry Pi or use I2C address selection jumpers to run multiple sensors on one Pi.

2. For each sensor, create a separate configuration and service:
   ```bash
   cp bme280_publisher/sensor_config.ini bme280_publisher/sensor_config_room2.ini
   # Edit the new config to change location and possibly I2C address

   sudo cp /etc/systemd/system/bme280-publisher.service /etc/systemd/system/bme280-publisher-room2.service
   # Edit the new service file to point to the new config
   ```

3. Add each location to your dashboard via the web interface.

## 12. Maintenance Tasks

### Database Backup

Schedule regular backups of InfluxDB and SQLite:

```bash
# Create backup script
cat > ~/backup_databases.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="~/iot-dashboard-backups"
DATE=$(date +%Y-%m-%d)

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

# Back up InfluxDB (if using Docker)
docker exec influxdb influx backup -t $INFLUX_TOKEN $BACKUP_DIR/influxdb-$DATE

# Back up SQLite database
cp ~/iot-sensor-dashboard/backend/dashboard.db $BACKUP_DIR/dashboard-$DATE.db

# Compress backups
tar -czf $BACKUP_DIR/backup-$DATE.tar.gz $BACKUP_DIR/influxdb-$DATE $BACKUP_DIR/dashboard-$DATE.db

# Remove uncompressed files
rm -rf $BACKUP_DIR/influxdb-$DATE
rm $BACKUP_DIR/dashboard-$DATE.db

# Keep only the last 7 backups
ls -t $BACKUP_DIR/backup-*.tar.gz | tail -n +8 | xargs rm -f
EOF

# Make script executable
chmod +x ~/backup_databases.sh

# Add to crontab to run daily at 2 AM
(crontab -l 2>/dev/null; echo "0 2 * * * ~/backup_databases.sh") | crontab -
```

### Log Rotation

Set up log rotation for application logs:

```bash
sudo tee /etc/logrotate.d/iot-dashboard << EOF
/home/pi/iot-sensor-dashboard/bme280_publisher/bme280_errors.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 pi pi
}
EOF
```

### System Updates

Keep your system up to date:

```bash
# Create update script
cat > ~/update_system.sh << 'EOF'
#!/bin/bash
# Update system packages
sudo apt update
sudo apt upgrade -y

# Update Node.js packages
cd ~/iot-sensor-dashboard/frontend
npm update
cd ~/iot-sensor-dashboard/backend
npm update

# Restart services after update
sudo systemctl restart bme280-publisher iot-dashboard-backend
EOF

# Make script executable
chmod +x ~/update_system.sh

# Add to crontab to run weekly on Sunday at 3 AM
(crontab -l 2>/dev/null; echo "0 3 * * 0 ~/update_system.sh") | crontab -
```

## 13. Troubleshooting

### BME280 Sensor Issues

**Sensor Not Detected:**
```bash
# Check I2C connections
sudo i2cdetect -y 1

# If sensor doesn't show up (no "76" in the output):
# 1. Check wiring connections
# 2. Enable I2C interface in raspi-config
# 3. Reboot the Raspberry Pi
```

**Invalid Readings:**
- Ensure the sensor is not placed near heat sources or in direct sunlight
- Check for physical damage to the sensor
- Try a different I2C address if available (0x76 or 0x77)

### MQTT Connection Issues

**Publisher Can't Connect to MQTT:**
```bash
# Test MQTT connection
mosquitto_pub -h localhost -p 1883 -t test -m "test message"

# Check if Mosquitto is running
sudo systemctl status mosquitto

# Verify the MQTT port is open
sudo ss -tuln | grep 1883
```

**WebSocket Connection Fails:**
```bash
# Check if WebSocket port is open
sudo ss -tuln | grep 9001

# Verify Mosquitto configuration includes WebSocket listener
cat /etc/mosquitto/conf.d/websockets.conf
```

### InfluxDB Issues

**Unable to Write Data:**
```bash
# Check InfluxDB status
sudo systemctl status influxdb

# Verify token has write permissions
# Access InfluxDB UI > Data > Tokens > Verify permissions

# Check Telegraf logs for connection issues
sudo journalctl -u telegraf -f
```

**Query Fails:**
```bash
# Test a basic query from the CLI
influx query 'from(bucket:"iot_sensors") |> range(start: -1h) |> filter(fn: (r) => r._measurement == "bme280")'

# Check bucket existence and retention policy
influx bucket list

# Verify the organization exists
influx org list
```

### Backend Server Issues

**Server Won't Start:**
```bash
# Check error logs
sudo journalctl -u iot-dashboard-backend -f

# Verify environment variables
cat ~/iot-sensor-dashboard/backend/.env

# Test manual start
cd ~/iot-sensor-dashboard/backend
node server.cjs
```

**API Returns 500 Errors:**
- Check connection to InfluxDB (token, organization, bucket)
- Verify SQLite database is not corrupted
- Check if the error occurs for specific requests or all requests

### Frontend Issues

**Charts Show No Data:**
```bash
# Check browser console for errors
# Ensure MQTT WebSocket connection is working
# Verify that data exists in InfluxDB

# Test API endpoints directly:
curl http://localhost:5000/api/sensors

# Check if data is being received from sensors
mosquitto_sub -t "senzory/#" -v
```

**Slow Performance:**
- Reduce the time range of displayed data
- Increase downsampling intervals for large time ranges
- Check system resource usage with `htop`
- Consider adding more RAM to your Raspberry Pi

---

Remember to update all passwords, tokens, and security settings for your production environment. This guide uses placeholder values that should be replaced with strong, unique credentials. 