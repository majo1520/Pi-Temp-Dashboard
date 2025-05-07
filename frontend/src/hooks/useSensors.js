/**
 * @module hooks/useSensors
 * @description Custom hook for managing sensor data in the dashboard
 */
import { useState, useEffect, useCallback } from 'react';
import * as api from '../services/api';

/**
 * Custom hook for managing sensor data and operations
 * 
 * This hook encapsulates all the logic for interacting with sensor data,
 * including loading sensors, updating visibility settings, adding and deleting
 * locations, and handling refresh operations.
 * 
 * @returns {Object} An object containing the following properties and methods:
 * @returns {Array} sensors - Array of sensor objects with their properties
 * @returns {Function} setSensors - State setter function for sensors
 * @returns {boolean} isRefreshing - Whether a data refresh operation is in progress
 * @returns {Function} loadSensors - Function to load sensors from the API
 * @returns {Function} updateSingleField - Function to update a specific sensor property
 * @returns {Function} deleteLocation - Function to delete a sensor location
 * @returns {Function} addLocation - Function to add a new sensor location
 * @returns {Function} refreshData - Function to refresh all sensor data
 */
export default function useSensors() {
  const [sensors, setSensors] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  /**
   * Loads all sensor data from the API
   * 
   * @returns {Promise<Array>} Promise resolving to array of sensor objects
   */
  const loadSensors = useCallback(() => {
    return api.getSensors()
      .then(data => {
        console.log("Fetched sensors from API:", data);
        setSensors(data);
        return data;
      })
      .catch(err => {
        console.error("Error loading sensors:", err);
        throw err;
      });
  }, []);

  /**
   * Updates a single field for a specific sensor
   * 
   * @param {string} name - Sensor name/identifier
   * @param {string} field - Field to update (e.g., 'cardVisible', 'locationVisible')
   * @param {any} value - New value for the field
   * @returns {Promise<boolean>} Promise resolving to true if the update was successful
   */
  const updateSingleField = useCallback((name, field, value) => {
    console.log(`Updating visibility for ${name}: ${field} = ${value}`);
    return api.updateSensorVisibility(name, { [field]: value })
      .then(() => {
        setSensors(prev =>
          prev.map(sensor =>
            sensor.name === name ? { ...sensor, [field]: value } : sensor
          )
        );
        return true;
      })
      .catch(err => {
        console.error("Error updating sensor visibility:", err);
        return false;
      });
  }, []);

  /**
   * Deletes a sensor location
   * 
   * @param {string} name - Sensor name/identifier to delete
   * @returns {Promise<string>} Promise resolving to success message
   */
  const deleteLocation = useCallback((name) => {
    return api.deleteLocation(name)
      .then(message => {
        loadSensors(); // Reload after deletion
        return message;
      })
      .catch(err => {
        console.error("Error deleting location:", err);
        throw err;
      });
  }, [loadSensors]);

  /**
   * Adds a new sensor location
   * 
   * @param {string} locationName - Name of the location to add
   * @returns {Promise<Object>} Promise resolving to the API response object
   * @throws {Error} If locationName is empty or if API call fails
   */
  const addLocation = useCallback((locationName) => {
    if (!locationName) return Promise.reject(new Error("Location name is required"));

    return api.addLocation(locationName)
      .then(response => {
        loadSensors(); // Reload after adding
        return response;
      })
      .catch(err => {
        console.error("Error adding location:", err);
        throw err;
      });
  }, [loadSensors]);

  /**
   * Refreshes all sensor data
   * 
   * This function updates both the sensor list and other potentially
   * stale data. While refreshing, the isRefreshing flag is set to true.
   * 
   * @returns {Promise<Array>} Promise resolving to the refreshed sensor data
   */
  const refreshData = useCallback(() => {
    console.log("Refreshing sensor data...");
    setIsRefreshing(true);
    
    return loadSensors()
      .then(data => {
        console.log("Sensors data refresh complete");
        return data;
      })
      .catch(err => {
        console.error("Error refreshing sensor data:", err);
        throw err;
      })
      .finally(() => {
        setIsRefreshing(false);
      });
  }, [loadSensors]);

  // Load sensors on mount
  useEffect(() => {
    loadSensors()
      .catch(err => console.error("Error loading sensors on mount:", err));
  }, [loadSensors]);

  return {
    sensors,
    setSensors,
    isRefreshing,
    loadSensors,
    updateSingleField,
    deleteLocation,
    addLocation,
    refreshData
  };
} 