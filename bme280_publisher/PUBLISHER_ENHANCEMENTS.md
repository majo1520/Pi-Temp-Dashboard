# BME280 Publisher Enhancements

This document outlines the enhancements made to the BME280 sensor publisher to improve reading accuracy, stability, and long-term reliability.

## Key Enhancements

### 1. Multi-Sample Reading Aggregation

The publisher now takes multiple samples for each measurement cycle and aggregates them for higher accuracy:

- Takes configurable number of samples (default: 5)
- Discards outliers (min and max values) when enough samples are available
- Averages the remaining samples to reduce noise
- Logs both raw and processed readings for diagnostics
- Configurable via `num_samples` parameter in `sensor_config.ini`

### 2. Improved Sensor Initialization and Stabilization

Added improved sensor initialization with hardware verification and stabilization:

- I2C bus scanning to verify device presence
- Multiple initialization attempts with retry logic
- Chip ID verification to confirm proper connection
- Configurable warm-up/stabilization period to allow sensor to reach steady state
- Configurable via `stabilization_time` parameter in `sensor_config.ini`

### 3. Adaptive Filtering and Smoothing

Added multiple layers of noise reduction for more stable readings:

- Configurable oversampling (1x to 16x) for the sensor's internal ADC
- Configurable IIR filter (disabled, 2x, 4x, 8x, 16x) for high-frequency noise reduction
- Optional exponential smoothing across reading cycles for temporal stability
- Different configurations available for various environments
- Configurable via `oversampling`, `iir_filter`, and `smoothing_factor` parameters

### 4. Resilient Error Handling and Recovery

Enhanced error handling to maintain service continuity:

- Distinguishes between validation errors, hardware errors, and unexpected errors
- Intelligent sensor reinitialization based on error patterns
- Uses last known good readings for temporary continuation during unstable periods
- Adds small random jitter to recovery values for statistical transparency
- Configurable via `max_consecutive_errors` parameter

### 5. Comprehensive Logging

Improved logging for diagnosis and data quality tracking:

- Logs raw readings for precision monitoring
- Tracks sample quality metrics 
- Records hardware events (resets, errors, reconnections)
- Maintains separate error log file for quick issue identification

## Configuration Guide

The enhanced publisher can be configured via `sensor_config.ini`. Here's a guide to the new parameters:

### Sensor Accuracy Section

| Parameter | Description | Recommended Values |
|-----------|-------------|-------------------|
| `num_samples` | Number of samples to take per reading cycle | 3-5 for balance, 10+ for highest accuracy |
| `stabilization_time` | Seconds to wait after initialization | 2-3 for normal use, 5+ for high precision |
| `oversampling` | Internal ADC sampling multiplier | 16 for high precision, 4-8 for balance |
| `iir_filter` | Internal filter coefficient | 16 for stable readings, 4 for faster response |
| `smoothing_factor` | Temporal smoothing between readings | 0.0 (none), 0.2 (light), 0.5 (medium), 0.8 (heavy) |

### Environmental Optimization

Different environments may require different settings:

- **For stable indoor environments**: Use high oversampling (16), high filtering (16), and light smoothing (0.2)
- **For changing environments**: Reduce filter (4-8) and smoothing (0.1) for faster response to changes
- **For rapidly changing conditions**: Use lower oversampling (4) and minimal filtering

## Troubleshooting

If readings still appear inaccurate:

1. **Check sensor placement**: Ensure the sensor is not near heat sources, in direct sunlight, or affected by air conditioning
2. **Verify power supply**: Unstable power can affect readings
3. **I2C bus issues**: Try a slower I2C clock frequency or shorter cables
4. **Sensor quality**: Some BME280 sensors (especially clones) may have inherent accuracy issues
5. **Environmental interference**: RF/EMI interference can affect readings
6. **Altitude effects**: Adjust `sea_level_pressure` to your location's actual value

## Performance Impact

The enhanced publisher has slightly higher CPU and memory usage due to sampling and processing. You may adjust the parameters to balance accuracy vs. resource usage as needed. 