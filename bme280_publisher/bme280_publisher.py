"""
BME280 Sensor Publisher

This module reads data from a BME280 sensor and publishes it to an MQTT broker.
It supports both legacy and structured data formats, error handling,
automatic reconnection, and message queuing when disconnected.

Dependencies:
    - adafruit-circuitpython-bme280: For interacting with the BME280 sensor
    - paho-mqtt: For MQTT communication
    - zoneinfo: For timezone aware timestamps

Configuration is loaded from sensor_config.ini file and includes:
    - MQTT connection settings
    - Sensor settings
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
            'init_retry_interval': '30'
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
    Initialize the BME280 sensor with high accuracy settings.
    
    This function configures the sensor with:
    - 16x oversampling for temperature, pressure, and humidity
    - 16x IIR filtering to reduce noise
    - Normal mode for continuous measurements
    - 500ms standby period between measurements
    
    Returns:
        Adafruit_BME280_I2C or None: Initialized sensor object or None if initialization failed.
    """
    if not init_i2c():
        return None
        
    try:
        sensor = Adafruit_BME280_I2C(i2c, address=SENSOR_ADDRESS)
        
        # Nastavenie presnosti (oversampling)
        sensor.overscan_temperature = OVERSCAN_X16
        sensor.overscan_humidity = OVERSCAN_X16
        sensor.overscan_pressure = OVERSCAN_X16

        # Filtrovanie rýchlych zmien (nižší šum)
        sensor.iir_filter = IIR_FILTER_X16

        # Režim merania – normal (nepretržité meranie)
        sensor.mode = MODE_NORMAL

        # Voliteľne: nastav standby čas medzi meraniami (v režime normal)
        sensor.standby_period = STANDBY_TC_500
        
        # Set sea level pressure for accurate altitude reading
        sensor.sea_level_pressure = SEA_LEVEL_PRESSURE
        
        logging.info("Sensor initialized successfully with high accuracy settings.")
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
    
    while True:
        # Check if sensor needs reinitialization
        if bme280 is None:
            current_time = time.time()
            if current_time - last_sensor_init_attempt >= INIT_RETRY_INTERVAL:
                logging.info("Sensor not available. Attempting to reinitialize...")
                bme280 = init_sensor()
                last_sensor_init_attempt = current_time
                if bme280 is None:
                    time.sleep(min(INIT_RETRY_INTERVAL, SAMPLE_RATE))
                    continue
        
        try:
            # Čítanie dát zo senzora
            temp = round(bme280.temperature, 2)
            hum = round(bme280.humidity, 2)
            pres = round(bme280.pressure, 2)

            # Strict validation - immediately raise exceptions like the old publisher
            if not (TEMP_RANGE[0] <= temp <= TEMP_RANGE[1]):
                raise ValueError(f"Invalid temperature reading: {temp} °C (outside range {TEMP_RANGE[0]}-{TEMP_RANGE[1]})")
                
            if not (HUMIDITY_RANGE[0] <= hum <= HUMIDITY_RANGE[1]):
                raise ValueError(f"Invalid humidity reading: {hum} % (outside range {HUMIDITY_RANGE[0]}-{HUMIDITY_RANGE[1]})")
                
            if not (PRESSURE_RANGE[0] <= pres <= PRESSURE_RANGE[1]):
                raise ValueError(f"Invalid pressure reading: {pres} hPa (outside range {PRESSURE_RANGE[0]}-{PRESSURE_RANGE[1]})")

            # Calculate additional derived metrics
            altitude = round(bme280.altitude, 2)
            
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
                "local_time": local_time_str
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
                    logging.info(f"Published: temperature={temp}°C, humidity={hum}%, pressure={pres}hPa")
                    consecutive_errors = 0
            else:
                logging.warning("MQTT broker not connected, queueing messages")
                for msg in messages_to_publish:
                    add_to_queue(msg)
        
        except (IOError, OSError, ValueError) as e:
            # Handle both hardware errors and validation errors the same way - like old publisher
            if isinstance(e, ValueError):
                logging.error(f"Validation error: {e}")
            else:
                logging.error(f"Hardware error: {e}")
                
            # Always reset sensor on any error - exactly like old publisher
            logging.info("Error detected, reinitializing sensor")
            bme280 = None
            consecutive_errors += 1
            
        except Exception as e:
            # Other unexpected errors
            logging.error(f"Unexpected error: {e}", exc_info=True)
            # Also reset sensor on unexpected errors
            logging.info("Unexpected error, reinitializing sensor")
            bme280 = None
            consecutive_errors += 1

        time.sleep(SAMPLE_RATE)
        
except KeyboardInterrupt:
    # Handled by signal handler
    pass
except Exception as e:
    logging.critical(f"Unhandled exception in main loop: {e}", exc_info=True)
    graceful_shutdown(None, None)
