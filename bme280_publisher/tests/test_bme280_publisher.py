"""
Unit tests for the BME280 Publisher.
"""
import sys
import os
import unittest
from unittest.mock import MagicMock, patch
from importlib import reload

# Add the parent directory to sys.path to allow importing the module
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))


class TestBME280Publisher(unittest.TestCase):
    """Test cases for BME280 Publisher."""

    def setUp(self):
        """Set up test fixtures."""
        # Mock modules that might not be available in test environment
        self.module_patcher = patch.dict('sys.modules', {
            'board': MagicMock(),
            'busio': MagicMock(),
            'adafruit_bme280.advanced': MagicMock(),
            'paho.mqtt.client': MagicMock()
        })
        self.module_patcher.start()
        
        # After patching modules, import the module to test
        import bme280_publisher
        self.bme280_publisher = reload(bme280_publisher)

    def tearDown(self):
        """Tear down test fixtures."""
        self.module_patcher.stop()

    def test_init_i2c(self):
        """Test I2C initialization."""
        # Mock the busio module
        busio = sys.modules['busio']
        busio.I2C.return_value = MagicMock()
        
        # Call the function
        result = self.bme280_publisher.init_i2c()
        
        # Assert busio.I2C was called
        self.assertTrue(busio.I2C.called)
        # Assert the function returned True
        self.assertTrue(result)

    def test_init_i2c_failure(self):
        """Test I2C initialization failure."""
        # Mock the busio module to raise an exception
        busio = sys.modules['busio']
        busio.I2C.side_effect = RuntimeError("I2C init failed")
        
        # Call the function
        result = self.bme280_publisher.init_i2c()
        
        # Assert the function returned False on error
        self.assertFalse(result)

    def test_init_sensor(self):
        """Test sensor initialization."""
        # Mock the I2C initialization
        with patch.object(self.bme280_publisher, 'init_i2c', return_value=True):
            # Mock the sensor module
            advanced = sys.modules['adafruit_bme280.advanced']
            mock_sensor = MagicMock()
            advanced.Adafruit_BME280_I2C.return_value = mock_sensor
            
            # Call the function
            result = self.bme280_publisher.init_sensor()
            
            # Assert the sensor was initialized and configured
            self.assertEqual(result, mock_sensor)
            self.assertTrue(advanced.Adafruit_BME280_I2C.called)
            # Check that sensor properties were set
            self.assertTrue(hasattr(mock_sensor, 'sea_level_pressure'))

    def test_init_sensor_failure(self):
        """Test sensor initialization failure."""
        # Mock the I2C initialization to fail
        with patch.object(self.bme280_publisher, 'init_i2c', return_value=False):
            # Call the function
            result = self.bme280_publisher.init_sensor()
            
            # Assert the function returned None on error
            self.assertIsNone(result)


if __name__ == '__main__':
    unittest.main() 