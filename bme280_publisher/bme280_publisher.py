"""
BME280 Sensor Publisher (Enhanced Version)

This module reads data from a BME280 sensor and publishes it to an MQTT broker.
It includes advanced features for accurate and reliable readings:
- Multi-sample readings with outlier rejection
- Exponential smoothing for stable values
- Sensor warm-up and stabilization period
- Resilient error handling and recovery
- Comprehensive logging

Dependencies:
    - adafruit-circuitpython-bme280: For interacting with the BME280 sensor
    - paho-mqtt: For MQTT communication
    - zoneinfo: For timezone aware timestamps

Configuration is loaded from sensor_config.ini file and includes:
    - MQTT connection settings
    - Sensor settings (including accuracy parameters)
    - Topic configuration
    - Data validation ranges
    - Logging configuration
"""

import time
import json
import board
import busio
import logging
from logging.handlers import RotatingFileHandler
import paho.mqtt.client as mqtt
from adafruit_bme280.advanced import Adafruit_BME280_I2C, MODE_NORMAL, STANDBY_TC_500
from adafruit_bme280.advanced import OVERSCAN_X16, IIR_FILTER_X16
from datetime import datetime
from zoneinfo import ZoneInfo
import signal
import sys
import configparser
import uuid
import os
from collections import deque
import random


# Load configuration
CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sensor_config.ini')

# Create default config if it doesn't exist
def create_default_config():
    if not os.path.exists(CONFIG_FILE):
        config = configparser.ConfigParser()
        config['mqtt'] = {
            'host': 'localhost',
            'port': '1883',
            'username': '',
            'password': '',
            'use_tls': 'false',
            'ca_certs': '',
            'certfile': '',
            'keyfile': '',
            'client_id': f"bme280-{uuid.uuid4()}",
            'qos': '1',
            'connect_timeout': '60'
        }
        config['mqtt_topics'] = {
            'legacy_topic': 'senzory/bme280',
            'readings_topic': 'senzory/{location}/readings',
            'status_topic': 'senzory/{location}/status',
            'use_legacy_topic': 'true'
        }
        config['sensor'] = {
            'location': 'IT OFFICE',
            'sample_rate': '5',
            'address': '0x76',
            'sea_level_pressure': '1013.25',
            'max_consecutive_errors': '5',
            'init_retry_interval': '30',
            'stabilization_time': '2'
        }
        config['data'] = {
            'temp_min': '-40',
            'temp_max': '85',
            'humidity_min': '0',
            'humidity_max': '100',
            'pressure_min': '300',
            'pressure_max': '1100'
        }
        config['legacy_format'] = {
            'temp_field': 'teplota',
            'humidity_field': 'vlhkost',
            'pressure_field': 'tlak'
        }
        config['message_queue'] = {
            'max_size': '1000',
            'flush_on_each_cycle': 'true'
        }
        config['logging'] = {
            'log_level': 'INFO',
            'file_logging': 'true',
            'log_file': 'bme280_publisher.log',
            'max_log_size': '10485760',
            'backup_count': '5',
            'console_logging': 'false',
            'log_format': '%(asctime)s [%(levelname)s] %(message)s',
            'date_format': '%Y-%m-%d %H:%M:%S',
            'separate_error_log': 'true',
            'error_log_file': 'bme280_errors.log'
        }
        with open(CONFIG_FILE, 'w') as f:
            config.write(f)
        # Initialize basic logging to report config creation
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s [%(levelname)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )
        logging.info(f"Created default configuration file: {CONFIG_FILE}")

create_default_config()

# Load configuration
config = configparser.ConfigParser()
config.read(CONFIG_FILE)

# Setup logging based on configuration
def setup_logging():
    # Get logging configuration
    log_level_str = config.get('logging', 'log_level', fallback='INFO')
    file_logging = config.getboolean('logging', 'file_logging', fallback=True)
    log_file = config.get('logging', 'log_file', fallback='bme280_publisher.log')
    max_log_size = config.getint('logging', 'max_log_size', fallback=10485760)
    backup_count = config.getint('logging', 'backup_count', fallback=5)
    console_logging = config.getboolean('logging', 'console_logging', fallback=False)
    log_format = config.get('logging', 'log_format', fallback='%(asctime)s [%(levelname)s] %(message)s')
    date_format = config.get('logging', 'date_format', fallback='%Y-%m-%d %H:%M:%S')
    separate_error_log = config.getboolean('logging', 'separate_error_log', fallback=True)
    error_log_file = config.get('logging', 'error_log_file', fallback='bme280_errors.log')
    
    # Convert string log level to logging constant
    log_level_map = {
        'DEBUG': logging.DEBUG,
        'INFO': logging.INFO,
        'WARNING': logging.WARNING,
        'ERROR': logging.ERROR,
        'CRITICAL': logging.CRITICAL
    }
    log_level = log_level_map.get(log_level_str.upper(), logging.INFO)
    
    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    
    # Remove any existing handlers
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    
    # Create formatters
    formatter = logging.Formatter(log_format, date_format)
    
    # Add handlers based on configuration
    if file_logging:
        # Ensure log directory exists if log file has a directory path
        log_dir = os.path.dirname(log_file)
        if log_dir and not os.path.exists(log_dir):
            os.makedirs(log_dir)
            
        # Create main log file handler
        file_handler = RotatingFileHandler(
            log_file,
            maxBytes=max_log_size,
            backupCount=backup_count
        )
        file_handler.setLevel(log_level)
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)
        
        # Create separate error log file if enabled
        if separate_error_log:
            # Ensure error log directory exists
            error_log_dir = os.path.dirname(error_log_file)
            if error_log_dir and not os.path.exists(error_log_dir):
                os.makedirs(error_log_dir)
                
            error_handler = RotatingFileHandler(
                error_log_file,
                maxBytes=max_log_size,
                backupCount=backup_count
            )
            error_handler.setLevel(logging.ERROR)
            error_handler.setFormatter(formatter)
            root_logger.addHandler(error_handler)
    
    # Add console handler if enabled
    if console_logging:
        console_handler = logging.StreamHandler()
        console_handler.setLevel(log_level)
        console_handler.setFormatter(formatter)
        root_logger.addHandler(console_handler)
    
    logging.info("Logging initialized with level: %s, file: %s, console: %s", 
                log_level_str, file_logging, console_logging)

# Initialize logging
setup_logging()

# MQTT Configuration
MQTT_HOST = config.get('mqtt', 'host', fallback='localhost')
MQTT_PORT = config.getint('mqtt', 'port', fallback=1883)
MQTT_USER = config.get('mqtt', 'username', fallback='')
MQTT_PASS = config.get('mqtt', 'password', fallback='')
USE_TLS = config.getboolean('mqtt', 'use_tls', fallback=False)
CA_CERTS = config.get('mqtt', 'ca_certs', fallback='')
CERTFILE = config.get('mqtt', 'certfile', fallback='')
KEYFILE = config.get('mqtt', 'keyfile', fallback='')
CLIENT_ID = config.get('mqtt', 'client_id', fallback=f"bme280-{uuid.uuid4()}")
MQTT_QOS = config.getint('mqtt', 'qos', fallback=1)
CONNECT_TIMEOUT = config.getint('mqtt', 'connect_timeout', fallback=60)

# Topic Configuration
LEGACY_TOPIC = config.get('mqtt_topics', 'legacy_topic', fallback='senzory/bme280')
READINGS_TOPIC_TEMPLATE = config.get('mqtt_topics', 'readings_topic', fallback='senzory/{location}/readings')
STATUS_TOPIC_TEMPLATE = config.get('mqtt_topics', 'status_topic', fallback='senzory/{location}/status')
USE_LEGACY_TOPIC = config.getboolean('mqtt_topics', 'use_legacy_topic', fallback=True)

# Legacy format field names
TEMP_FIELD = config.get('legacy_format', 'temp_field', fallback='teplota')
HUMIDITY_FIELD = config.get('legacy_format', 'humidity_field', fallback='vlhkost')
PRESSURE_FIELD = config.get('legacy_format', 'pressure_field', fallback='tlak')

# Sensor Configuration
LOCATION = config.get('sensor', 'location', fallback='IT OFFICE')
SAMPLE_RATE = config.getint('sensor', 'sample_rate', fallback=5)
SENSOR_ADDRESS = int(config.get('sensor', 'address', fallback='0x76'), 16)
SEA_LEVEL_PRESSURE = config.getfloat('sensor', 'sea_level_pressure', fallback=1013.25)
MAX_CONSECUTIVE_ERRORS = config.getint('sensor', 'max_consecutive_errors', fallback=5)
INIT_RETRY_INTERVAL = config.getint('sensor', 'init_retry_interval', fallback=30)

# Data Validation Ranges
TEMP_RANGE = (
    config.getfloat('data', 'temp_min', fallback=-40),
    config.getfloat('data', 'temp_max', fallback=85)
)
HUMIDITY_RANGE = (
    config.getfloat('data', 'humidity_min', fallback=0),
    config.getfloat('data', 'humidity_max', fallback=100)
)
PRESSURE_RANGE = (
    config.getfloat('data', 'pressure_min', fallback=300),
    config.getfloat('data', 'pressure_max', fallback=1100)
)

# Message queue configuration
MAX_QUEUE_SIZE = config.getint('message_queue', 'max_size', fallback=1000)
FLUSH_ON_EACH_CYCLE = config.getboolean('message_queue', 'flush_on_each_cycle', fallback=True)
unsent_messages = deque(maxlen=MAX_QUEUE_SIZE)

# Format topic templates with the location
READINGS_TOPIC = READINGS_TOPIC_TEMPLATE.format(location=LOCATION)
STATUS_TOPIC = STATUS_TOPIC_TEMPLATE.format(location=LOCATION)

# Inicializácia I2C
i2c = None

def init_i2c():
    """
    Initialize the I2C bus.
    
    Returns:
        bool: True if initialization was successful, False otherwise.
    """
    global i2c
    try:
        i2c = busio.I2C(board.SCL, board.SDA)
        return True
    except Exception as e:
        logging.error(f"Failed to initialize I2C: {e}")
        return False

# Funkcia na inicializáciu senzora
def init_sensor():
    """
    Initialize the BME280 sensor with configurable accuracy settings.
    
    This function configures the sensor with:
    - Configurable oversampling for temperature, pressure, and humidity
    - Configurable IIR filtering to reduce noise
    - Normal mode for continuous measurements
    - 500ms standby period between measurements
    
    Returns:
        Adafruit_BME280_I2C or None: Initialized sensor object or None if initialization failed.
    """
    if not init_i2c():
        return None
    
    try:
        # Get the stabilization time from config
        stabilization_time = config.getint('sensor', 'stabilization_time', fallback=2)
        
        # First try to scan the I2C bus and report available devices
        try:
            devices = []
            for addr in range(0x76, 0x78):  # BME280 has address 0x76 or 0x77
                try:
                    i2c.scan()
                    if addr in i2c.scan():
                        devices.append(hex(addr))
                except Exception:
                    pass
            
            if devices:
                logging.info(f"Found I2C devices at addresses: {', '.join(devices)}")
            else:
                logging.warning("No BME280 compatible devices found on I2C bus")
        except Exception as e:
            logging.warning(f"Could not scan I2C bus: {e}")
        
        # Create the sensor object with robust error handling
        max_init_attempts = 3
        for attempt in range(max_init_attempts):
            try:
                sensor = Adafruit_BME280_I2C(i2c, address=SENSOR_ADDRESS)
                # Check if we can read the chip ID to verify connection
                if hasattr(sensor, "_chip_id") and sensor._chip_id:
                    logging.info(f"Connected to BME280 sensor with chip ID: {hex(sensor._chip_id)}")
                else:
                    logging.warning("Connected to sensor but chip ID verification failed")
                break
            except Exception as e:
                if attempt < max_init_attempts - 1:
                    logging.warning(f"Sensor initialization attempt {attempt+1} failed: {e}. Retrying...")
                    time.sleep(1)  # Wait before retry
                else:
                    logging.error(f"All sensor initialization attempts failed: {e}")
                    return None
        
        # Get oversampling and filter settings from config
        oversampling_value = config.getint('sensor', 'oversampling', fallback=16)
        iir_filter_value = config.getint('sensor', 'iir_filter', fallback=16)
        
        # Map config values to BME280 constants
        oversampling_map = {
            1: 1,  # OVERSCAN_X1
            2: 2,  # OVERSCAN_X2
            4: 3,  # OVERSCAN_X4
            8: 4,  # OVERSCAN_X8
            16: 5  # OVERSCAN_X16
        }
        
        filter_map = {
            0: 0,  # IIR_FILTER_DISABLE
            2: 1,  # IIR_FILTER_X2
            4: 2,  # IIR_FILTER_X4
            8: 3,  # IIR_FILTER_X8
            16: 4  # IIR_FILTER_X16
        }
        
        # Get mapped values or defaults if not found
        os_value = oversampling_map.get(oversampling_value, 5)  # Default to X16
        filter_value = filter_map.get(iir_filter_value, 4)  # Default to X16
        
        # Configure sensor parameters
        try:
            # Nastavenie presnosti (oversampling)
            sensor.overscan_temperature = os_value
            sensor.overscan_humidity = os_value
            sensor.overscan_pressure = os_value

            # Filtrovanie rýchlych zmien (nižší šum)
            sensor.iir_filter = filter_value

            # Režim merania – normal (nepretržité meranie)
            sensor.mode = MODE_NORMAL

            # Voliteľne: nastav standby čas medzi meraniami (v režime normal)
            sensor.standby_period = STANDBY_TC_500
            
            # Set sea level pressure for accurate altitude reading
            sensor.sea_level_pressure = SEA_LEVEL_PRESSURE
            
            logging.info(f"Sensor parameters configured: oversampling=x{oversampling_value}, IIR filter=x{iir_filter_value}")
        except Exception as e:
            logging.error(f"Failed to configure sensor parameters: {e}")
            return None
        
        # Stabilization period - allow sensor to warm up and stabilize
        if stabilization_time > 0:
            logging.info(f"Allowing sensor to stabilize for {stabilization_time} seconds...")
            
            # Take a few readings during warm-up period to help the sensor stabilize
            for i in range(stabilization_time):
                try:
                    # Read values but don't use them (just to cycle the sensor)
                    _ = sensor.temperature
                    _ = sensor.humidity
                    _ = sensor.pressure
                    time.sleep(1)
                except Exception as e:
                    logging.debug(f"Ignored error during stabilization readings: {e}")
            
            logging.info("Sensor stabilization period completed")
        
        # Take a test reading to verify the sensor works
        try:
            temp = sensor.temperature
            hum = sensor.humidity
            pres = sensor.pressure
            logging.info(f"Test reading successful: temperature={temp:.2f}°C, humidity={hum:.2f}%, pressure={pres:.2f}hPa")
        except Exception as e:
            logging.error(f"Test reading failed after initialization: {e}")
            return None
        
        return sensor
    except Exception as e:
        logging.error(f"Error initializing sensor: {e}")
        return None

# Globálne premenne pre MQTT pripojenie
mqtt_connected = False

# Callback pre úspešné pripojenie k MQTT brokeru
def on_connect(client, userdata, flags, rc):
    """
    Callback for successful connection to MQTT broker.
    
    Args:
        client: MQTT client instance
        userdata: User data passed to the client
        flags: Response flags sent by the broker
        rc: Connection result code
    """
    global mqtt_connected
    connection_responses = {
        0: "Connection successful",
        1: "Connection refused - incorrect protocol version",
        2: "Connection refused - invalid client identifier",
        3: "Connection refused - server unavailable",
        4: "Connection refused - bad username or password",
        5: "Connection refused - not authorized"
    }
    
    if rc == 0:
        logging.info("Successfully connected to MQTT broker.")
        mqtt_connected = True
        flush_unsent_messages(client)
    else:
        error_msg = connection_responses.get(rc, f"Unknown error code: {rc}")
        logging.error(f"Failed to connect to MQTT broker: {error_msg}")

# Callback pre odpojenie od MQTT brokeru
def on_disconnect(client, userdata, rc):
    """
    Callback for disconnection from MQTT broker.
    
    Args:
        client: MQTT client instance
        userdata: User data passed to the client
        rc: Disconnection result code
    """
    global mqtt_connected
    mqtt_connected = False
    if rc == 0:
        logging.info("Disconnected from MQTT broker.")
    else:
        logging.warning(f"Unexpected disconnect from MQTT broker: {rc}")

# Add a new function for accurate sensor reading with multiple samples
def get_accurate_readings(sensor, num_samples=5, discard_outliers=True):
    """
    Take multiple sensor readings and average them for higher accuracy.
    
    Args:
        sensor: BME280 sensor object
        num_samples: Number of samples to take (default: 5)
        discard_outliers: Whether to discard outlier readings (default: True)
    
    Returns:
        dict: Dictionary with averaged temperature, humidity, and pressure values,
              or None if reading failed
    """
    if sensor is None:
        return None
    
    # Ensure we have a valid number of samples
    num_samples = max(1, num_samples)
    
    # Get value from configuration
    num_samples = config.getint('sensor', 'num_samples', fallback=num_samples)
    
    # Lists to store readings
    temps, hums, press = [], [], []
    
    # Log raw readings for debugging
    logging.debug(f"Starting {num_samples} readings for aggregation...")
    
    # Take multiple readings
    successful_readings = 0
    for i in range(num_samples):
        try:
            t = sensor.temperature
            h = sensor.humidity
            p = sensor.pressure
            
            # Basic validation before adding to the list
            if (TEMP_RANGE[0] <= t <= TEMP_RANGE[1] and 
                HUMIDITY_RANGE[0] <= h <= HUMIDITY_RANGE[1] and 
                PRESSURE_RANGE[0] <= p <= PRESSURE_RANGE[1]):
                
                temps.append(t)
                hums.append(h)
                press.append(p)
                successful_readings += 1
                logging.debug(f"Reading {i+1}/{num_samples}: temp={t:.2f}°C, humidity={h:.2f}%, pressure={p:.2f}hPa")
            else:
                logging.debug(f"Reading {i+1}/{num_samples} discarded - out of range: temp={t:.2f}°C, humidity={h:.2f}%, pressure={p:.2f}hPa")
        except Exception as e:
            logging.debug(f"Failed to take reading {i+1}/{num_samples}: {e}")
        
        # Short pause between readings
        if i < num_samples - 1:
            time.sleep(0.2)
    
    # If we didn't get any valid readings, return None
    if not temps or not hums or not press:
        logging.error("Failed to get any valid readings during aggregation")
        return None
    
    # Remove outliers if requested and we have enough samples
    if discard_outliers and len(temps) > 3:
        # Very simple outlier removal - remove min and max
        temps.remove(min(temps))
        temps.remove(max(temps))
        hums.remove(min(hums))
        hums.remove(max(hums))
        press.remove(min(press))
        press.remove(max(press))
        logging.debug("Removed outliers (min and max values)")
    
    # Calculate averages
    avg_temp = sum(temps) / len(temps)
    avg_hum = sum(hums) / len(hums)
    avg_press = sum(press) / len(press)
    
    # Apply exponential smoothing if configured
    smoothing_factor = config.getfloat('sensor', 'smoothing_factor', fallback=0.0)
    if 0.0 < smoothing_factor < 1.0:
        # Get last known good readings if available
        last_good_readings = getattr(get_accurate_readings, 'last_good_readings', None)
        
        if last_good_readings:
            # Apply exponential smoothing
            avg_temp = smoothing_factor * avg_temp + (1 - smoothing_factor) * last_good_readings['temperature']
            avg_hum = smoothing_factor * avg_hum + (1 - smoothing_factor) * last_good_readings['humidity']
            avg_press = smoothing_factor * avg_press + (1 - smoothing_factor) * last_good_readings['pressure']
            logging.debug(f"Applied exponential smoothing with factor {smoothing_factor}")
    
    # Create result dictionary with rounded values
    result = {
        'temperature': round(avg_temp, 2),
        'humidity': round(avg_hum, 2),
        'pressure': round(avg_press, 2),
        'raw_readings': {
            'temperature': temps,
            'humidity': hums,
            'pressure': press
        },
        'successful_readings': successful_readings,
        'total_readings': num_samples
    }
    
    # Store as last good readings for future smoothing
    get_accurate_readings.last_good_readings = {
        'temperature': avg_temp,
        'humidity': avg_hum, 
        'pressure': avg_press
    }
    
    logging.debug(f"Aggregated readings: temp={result['temperature']}°C, humidity={result['humidity']}%, pressure={result['pressure']}hPa")
    return result

# Funkcia na bezpečné pridanie správy do fronty
def add_to_queue(msg):
    """
    Add a message to the queue for later sending.
    
    Args:
        msg (dict): Message to be queued containing topic, payload, and other properties
    """
    global unsent_messages
    unsent_messages.append(msg)
    if len(unsent_messages) == MAX_QUEUE_SIZE:
        logging.warning(f"Message queue reached maximum size ({MAX_QUEUE_SIZE})")

# Funkcia na odoslanie správ zo zásobníka
def flush_unsent_messages(client):
    """
    Attempt to send all queued messages that couldn't be delivered previously.
    
    Args:
        client: MQTT client instance to use for publishing
    """
    global unsent_messages
    
    if not unsent_messages:
        return
        
    logging.info(f"Sending {len(unsent_messages)} stored messages...")
    
    # Create a copy of the queue to avoid modification during iteration
    messages_to_send = list(unsent_messages)
    unsent_messages.clear()
    
    for msg in messages_to_send:
        if not mqtt_connected:
            # If disconnected during sending, put all remaining messages back
            add_to_queue(msg)
            break
            
        result = client.publish(msg["topic"], msg["payload"], qos=msg.get("qos", MQTT_QOS), retain=msg.get("retain", False))
        if result.rc != mqtt.MQTT_ERR_SUCCESS:
            logging.error(f"Failed to send queued message: {result.rc}")
            add_to_queue(msg)
            break
            
    if unsent_messages:
        logging.info(f"{len(unsent_messages)} messages remain in queue")

# Funkcia na korektné ukončenie programu
def graceful_shutdown(signum, frame):
    """
    Handle graceful shutdown when receiving termination signals.
    
    This function ensures:
    - A final "offline" status message is published
    - The MQTT connection is properly closed
    - Resources are released
    
    Args:
        signum: Signal number
        frame: Current stack frame
    """
    logging.info(f"Received signal {signum}. Shutting down...")
    try:
        if mqtt_connected and mqttc:
            # Publish a last will message indicating shutdown
            shutdown_msg = {
                "location": LOCATION,
                "status": "offline",
                "timestamp": datetime.now(ZoneInfo("UTC")).strftime("%Y-%m-%d %H:%M:%S")
            }
            mqttc.publish(STATUS_TOPIC, json.dumps(shutdown_msg), qos=MQTT_QOS, retain=True)
            time.sleep(1)  # Give time for message to be sent
            mqttc.loop_stop()
            mqttc.disconnect()
    except Exception as e:
        logging.error(f"Error during shutdown: {e}")
    logging.info("Shutdown complete.")
    sys.exit(0)

# Zachytenie signálov SIGINT a SIGTERM pre korektné ukončenie
signal.signal(signal.SIGINT, graceful_shutdown)
signal.signal(signal.SIGTERM, graceful_shutdown)

# Inicializácia MQTT klienta
mqttc = mqtt.Client(client_id=CLIENT_ID, clean_session=True, protocol=mqtt.MQTTv311)
mqttc.on_connect = on_connect
mqttc.on_disconnect = on_disconnect

# Configure last will message
last_will = {
    "location": LOCATION,
    "status": "offline",
    "timestamp": datetime.now(ZoneInfo("UTC")).strftime("%Y-%m-%d %H:%M:%S")
}
mqttc.will_set(STATUS_TOPIC, json.dumps(last_will), qos=MQTT_QOS, retain=True)

# Set MQTT authentication if provided
if MQTT_USER and MQTT_PASS:
    mqttc.username_pw_set(MQTT_USER, MQTT_PASS)

# Configure TLS if enabled
if USE_TLS:
    try:
        mqttc.tls_set(ca_certs=CA_CERTS, certfile=CERTFILE, keyfile=KEYFILE)
        mqttc.tls_insecure_set(False)
        logging.info("TLS security enabled for MQTT connection")
    except Exception as e:
        logging.error(f"Failed to configure TLS: {e}")
        sys.exit(1)

# Connect to MQTT broker with retry logic
max_retries = 5
retry_delay = 5
connected = False

for attempt in range(max_retries):
    try:
        logging.info(f"Connecting to MQTT broker at {MQTT_HOST}:{MQTT_PORT} (attempt {attempt+1}/{max_retries})")
        mqttc.connect(MQTT_HOST, MQTT_PORT, keepalive=CONNECT_TIMEOUT)
        mqttc.loop_start()
        connected = True
        break
    except Exception as e:
        logging.error(f"Connection attempt {attempt+1} failed: {e}")
        if attempt < max_retries - 1:
            time.sleep(retry_delay)
            retry_delay *= 2  # Exponential backoff

if not connected:
    logging.critical("Could not connect to MQTT broker after multiple attempts. Exiting.")
    sys.exit(1)

# Publish online status
online_status = {
    "location": LOCATION,
    "status": "online",
    "timestamp": datetime.now(ZoneInfo("UTC")).strftime("%Y-%m-%d %H:%M:%S")
}
mqttc.publish(STATUS_TOPIC, json.dumps(online_status), qos=MQTT_QOS, retain=True)

# Inicializácia senzora
bme280 = init_sensor()
last_sensor_init_attempt = time.time()

try:
    consecutive_errors = 0
    last_successful_readings = None
    max_consecutive_failures = config.getint('sensor', 'max_consecutive_errors', fallback=5)
    
    while True:
        # Check if sensor needs reinitialization
        if bme280 is None:
            current_time = time.time()
            if current_time - last_sensor_init_attempt >= INIT_RETRY_INTERVAL:
                logging.info("Sensor not available. Attempting to reinitialize...")
                bme280 = init_sensor()
                last_sensor_init_attempt = current_time
                if bme280 is None:
                    logging.warning("Sensor reinitialization failed. Will retry later.")
                    time.sleep(min(INIT_RETRY_INTERVAL, SAMPLE_RATE))
                    continue
                else:
                    logging.info("Sensor reinitialized successfully.")
        
        try:
            # Get readings using our new accurate function
            readings = get_accurate_readings(bme280)
            
            if readings is None:
                raise ValueError("Failed to get valid readings from sensor")
            
            # Extract values from the readings
            temp = readings['temperature']
            hum = readings['humidity']
            pres = readings['pressure']
            
            # Store quality metrics
            reading_quality = f"{readings['successful_readings']}/{readings['total_readings']} successful readings"
            
            # Optional: Calculate altitude (based on pressure and sea level pressure)
            try:
                altitude = round(bme280.altitude, 2)
            except Exception as e:
                logging.warning(f"Failed to calculate altitude: {e}")
                altitude = 0

            # Získanie UTC času
            utc_time = datetime.now(ZoneInfo("UTC"))
            local_time = utc_time.astimezone(ZoneInfo("Europe/Bratislava"))
            timestamp_str = utc_time.strftime("%Y-%m-%d %H:%M:%S")
            local_time_str = local_time.strftime("%Y-%m-%d %H:%M:%S")

            # Create standard format data
            data = {
                "location": LOCATION,
                "temperature": temp,
                "humidity": hum,
                "pressure": pres,
                "altitude": altitude,
                "timestamp": timestamp_str,
                "local_time": local_time_str,
                "reading_quality": reading_quality
            }
            
            # Store these as the last successful readings
            last_successful_readings = {
                "temperature": temp,
                "humidity": hum,
                "pressure": pres,
                "timestamp": timestamp_str
            }
            
            # Prepare messages to publish
            messages_to_publish = []
            
            # Add structured topic message
            messages_to_publish.append({
                "topic": READINGS_TOPIC,
                "payload": json.dumps(data),
                "qos": MQTT_QOS,
                "retain": False
            })
            
            # Add legacy format message if enabled
            if USE_LEGACY_TOPIC:
                legacy_data = {
                    "location": LOCATION,
                    TEMP_FIELD: temp,
                    HUMIDITY_FIELD: hum,
                    PRESSURE_FIELD: pres,
                    "timestamp": timestamp_str
                }
                messages_to_publish.append({
                    "topic": LEGACY_TOPIC,
                    "payload": json.dumps(legacy_data),
                    "qos": MQTT_QOS,
                    "retain": False
                })

            # Publish messages if connected
            if mqtt_connected:
                publish_failures = False
                
                # Flush unsent messages if configured
                if FLUSH_ON_EACH_CYCLE:
                    flush_unsent_messages(mqttc)
                
                # Publish all messages
                for msg in messages_to_publish:
                    result = mqttc.publish(
                        msg["topic"], 
                        msg["payload"], 
                        qos=msg["qos"], 
                        retain=msg["retain"]
                    )
                    
                    if result.rc != mqtt.MQTT_ERR_SUCCESS:
                        logging.error(f"Failed to publish to {msg['topic']}: {result.rc}")
                        add_to_queue(msg)
                        publish_failures = True
                
                if not publish_failures:
                    logging.info(f"Published: temperature={temp}°C, humidity={hum}%, pressure={pres}hPa ({reading_quality})")
                    consecutive_errors = 0
            else:
                logging.warning("MQTT broker not connected, queueing messages")
                for msg in messages_to_publish:
                    add_to_queue(msg)
        
        except (IOError, OSError, ValueError) as e:
            # Handle both hardware errors and validation errors
            if isinstance(e, ValueError):
                logging.error(f"Validation error: {e}")
            else:
                logging.error(f"Hardware error: {e}")
                
            # Increment error counter and check if we should reset the sensor
            consecutive_errors += 1
            
            if consecutive_errors >= max_consecutive_failures:
                logging.warning(f"Reached {consecutive_errors} consecutive errors. Reinitializing sensor.")
                # Reset sensor after consecutive failures
                bme280 = None
                consecutive_errors = 0  # Reset counter
            
            # Try to use last known good readings if available and within reasonable time
            if last_successful_readings and consecutive_errors <= 2:
                logging.info("Using last known good readings while sensor stabilizes")
                age_minutes = (datetime.now(ZoneInfo("UTC")) - datetime.strptime(last_successful_readings["timestamp"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=ZoneInfo("UTC"))).total_seconds() / 60
                
                # Only use recent readings (less than 5 minutes old)
                if age_minutes < 5:
                    # Add small jitter to readings to make it obvious they're repeated
                    jitter_temp = round(last_successful_readings["temperature"] + (random.random() * 0.2 - 0.1), 2)
                    jitter_hum = round(last_successful_readings["humidity"] + (random.random() * 0.2 - 0.1), 2)
                    jitter_pres = round(last_successful_readings["pressure"] + (random.random() * 0.2 - 0.1), 2)
                    
                    utc_time = datetime.now(ZoneInfo("UTC"))
                    timestamp_str = utc_time.strftime("%Y-%m-%d %H:%M:%S")
                    
                    recovery_data = {
                        "location": LOCATION,
                        "temperature": jitter_temp,
                        "humidity": jitter_hum,
                        "pressure": jitter_pres,
                        "timestamp": timestamp_str,
                        "recovery": True,
                        "based_on": last_successful_readings["timestamp"]
                    }
                    
                    # Only send to the structured topic, not legacy
                    recovery_msg = {
                        "topic": READINGS_TOPIC,
                        "payload": json.dumps(recovery_data),
                        "qos": MQTT_QOS,
                        "retain": False
                    }
                    
                    if mqtt_connected:
                        logging.info(f"Publishing recovery data: temperature={jitter_temp}°C, humidity={jitter_hum}%, pressure={jitter_pres}hPa")
                        mqttc.publish(recovery_msg["topic"], recovery_msg["payload"], qos=recovery_msg["qos"], retain=False)
                    else:
                        add_to_queue(recovery_msg)
            
        except Exception as e:
            # Other unexpected errors
            logging.error(f"Unexpected error: {e}", exc_info=True)
            # Increase error counter
            consecutive_errors += 1
            
            if consecutive_errors >= max_consecutive_failures:
                logging.warning(f"Reached {consecutive_errors} consecutive unexpected errors. Reinitializing sensor.")
                # Reset sensor on unexpected errors too
                bme280 = None
                consecutive_errors = 0  # Reset counter

        # Add random jitter to prevent exact synchronization with other processes
        jitter = random.uniform(-0.1, 0.1)
        time.sleep(SAMPLE_RATE + jitter)
        
except KeyboardInterrupt:
    # Handled by signal handler
    pass
except Exception as e:
    logging.critical(f"Unhandled exception in main loop: {e}", exc_info=True)
    graceful_shutdown(None, None)