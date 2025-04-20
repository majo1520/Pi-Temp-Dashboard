#!/bin/bash
# BME280 Sensor Setup Script
# This script installs dependencies and configures the BME280 service

set -e

# Colors for pretty output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}BME280 Sensor Setup Script${NC}"
echo "------------------------------"
echo "This script will:"
echo "1. Install required dependencies"
echo "2. Configure Python environment"
echo "3. Setup systemd service"
echo "4. Test sensor connectivity"
echo ""

# Check if script is run as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run this script as root${NC}"
  exit 1
fi

# Install dependencies
echo -e "${YELLOW}Installing system dependencies...${NC}"
apt-get update
apt-get install -y python3 python3-pip python3-venv i2c-tools

# Enable I2C if not already enabled
if ! grep -q "^dtparam=i2c_arm=on" /boot/config.txt; then
  echo -e "${YELLOW}Enabling I2C interface...${NC}"
  echo "dtparam=i2c_arm=on" >> /boot/config.txt
  echo "I2C interface enabled. System will need to be rebooted."
  REBOOT_REQUIRED=true
fi

# Create virtual environment
echo -e "${YELLOW}Setting up Python environment...${NC}"
python3 -m venv /home/admin/dashboard_refaktor/venv
source /home/admin/dashboard_refaktor/venv/bin/activate

# Install Python dependencies
echo -e "${YELLOW}Installing Python packages...${NC}"
pip install --upgrade pip
pip install adafruit-circuitpython-bme280 paho-mqtt

# Check if BME280 sensor is detectable
echo -e "${YELLOW}Detecting I2C devices...${NC}"
i2cdetect -y 1

# Setup systemd service
echo -e "${YELLOW}Setting up systemd service...${NC}"
cp /home/admin/dashboard_refaktor/bme280-service.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable bme280-service.service

echo -e "${GREEN}Setup completed!${NC}"
echo ""
echo "You can start the service with: sudo systemctl start bme280-service"
echo "View logs with: journalctl -u bme280-service -f"

if [ "$REBOOT_REQUIRED" = true ]; then
  echo -e "${YELLOW}A system reboot is required to enable I2C. Reboot now? (y/n)${NC}"
  read -r response
  if [[ "$response" =~ ^([yY][eE][sS]|[yY])+$ ]]; then
    echo "Rebooting system..."
    reboot
  else
    echo "Please reboot the system manually to complete setup."
  fi
fi 