import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook for managing location order and visibility
 * 
 * @param {Array} sensors - Array of sensor objects
 * @returns {Object} Location order state and management functions
 */
export default function useLocationOrder(sensors = []) {
  // State for location order and hidden locations
  const [locationOrder, setLocationOrder] = useState([]);
  const [hiddenLocations, setHiddenLocations] = useState([]);
  
  // State for drag and drop
  const [draggedLocation, setDraggedLocation] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  // Load location order and hidden locations from localStorage on mount
  useEffect(() => {
    // Load hidden locations
    const storedHiddenLocations = localStorage.getItem('hiddenLocations');
    if (storedHiddenLocations) {
      try {
        const parsedHiddenLocations = JSON.parse(storedHiddenLocations);
        console.log("Loading hidden locations from localStorage:", parsedHiddenLocations);
        setHiddenLocations(parsedHiddenLocations);
      } catch (e) {
        console.error("Error parsing hidden locations:", e);
      }
    }
    
    // Load location order
    const storedLocationOrder = localStorage.getItem('locationOrder');
    if (storedLocationOrder) {
      try {
        setLocationOrder(JSON.parse(storedLocationOrder));
      } catch (e) {
        console.error("Error parsing location order:", e);
      }
    }
  }, []);

  // Save location order when it changes
  useEffect(() => {
    if (locationOrder.length > 0) {
      localStorage.setItem('locationOrder', JSON.stringify(locationOrder));
    }
  }, [locationOrder]);

  // Initialize location order if needed when sensors data changes
  useEffect(() => {
    if (locationOrder.length === 0 && sensors.length > 0) {
      const allLocations = [...new Set(sensors.map(sensor => sensor.name.split('_')[0]))];
      if (allLocations.length > 0) {
        setLocationOrder(allLocations);
      }
    }
  }, [sensors, locationOrder]);

  // Ensure hidden locations are valid based on current data
  useEffect(() => {
    if (sensors.length > 0 && hiddenLocations.length > 0) {
      // Get unique locations from loaded sensors
      const uniqueLocations = [...new Set(sensors.map(sensor => sensor.name.split('_')[0]))];
      
      // Check if any hidden location doesn't exist in current data
      const validHiddenLocations = hiddenLocations.filter(
        loc => uniqueLocations.includes(loc)
      );
      
      // Update hidden locations if they've changed (some might no longer exist)
      if (validHiddenLocations.length !== hiddenLocations.length) {
        console.log("Cleaning up hidden locations list - removing non-existent locations");
        setHiddenLocations(validHiddenLocations);
        localStorage.setItem('hiddenLocations', JSON.stringify(validHiddenLocations));
      }
    }
  }, [sensors, hiddenLocations]);

  // Get sorted locations (filtered and ordered)
  const getSortedLocations = useCallback(() => {
    if (sensors.length === 0) return [];
    
    // Get all unique locations
    let locations = [...new Set(sensors.map(sensor => sensor.name.split('_')[0]))];
    
    // Sort locations according to custom order
    if (locationOrder.length > 0) {
      locations.sort((a, b) => {
        const indexA = locationOrder.indexOf(a);
        const indexB = locationOrder.indexOf(b);
        
        // If not in order array, put at the end
        if (indexA === -1 && indexB === -1) return 0;
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        
        return indexA - indexB;
      });
    }
    
    // Filter out hidden locations
    return locations.filter(loc => !hiddenLocations.includes(loc));
  }, [sensors, locationOrder, hiddenLocations]);

  // Update hidden locations
  const updateHiddenLocations = useCallback((newHiddenLocations) => {
    console.log("Updating hidden locations:", newHiddenLocations);
    setHiddenLocations(newHiddenLocations);
    // Save to localStorage to persist across refreshes
    localStorage.setItem('hiddenLocations', JSON.stringify(newHiddenLocations));
  }, []);

  // Move a location up in the order
  const moveLocationUp = useCallback((location) => {
    setLocationOrder(prev => {
      // If location isn't in order yet, initialize the order
      if (prev.length === 0) {
        const allLocations = [...new Set(sensors.map(sensor => sensor.name.split('_')[0]))];
        prev = [...allLocations];
      }
      
      const index = prev.indexOf(location);
      // Can't move up if it's already at the top
      if (index <= 0) return prev;
      
      const newOrder = [...prev];
      // Swap with the item above
      [newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]];
      return newOrder;
    });
  }, [sensors]);
  
  // Move a location down in the order
  const moveLocationDown = useCallback((location) => {
    setLocationOrder(prev => {
      // If location isn't in order yet, initialize the order
      if (prev.length === 0) {
        const allLocations = [...new Set(sensors.map(sensor => sensor.name.split('_')[0]))];
        prev = [...allLocations];
      }
      
      const index = prev.indexOf(location);
      // Can't move down if it's already at the bottom or not found
      if (index === -1 || index >= prev.length - 1) return prev;
      
      const newOrder = [...prev];
      // Swap with the item below
      [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
      return newOrder;
    });
  }, [sensors]);

  // Drag and drop handlers
  const handleDragStart = useCallback((location) => {
    setDraggedLocation(location);
  }, []);
  
  const handleDragEnter = useCallback((location) => {
    if (draggedLocation && draggedLocation !== location) {
      setDropTarget(location);
    }
  }, [draggedLocation]);
  
  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);
  
  const handleDrop = useCallback((targetLocation) => {
    if (!draggedLocation || draggedLocation === targetLocation) {
      setDraggedLocation(null);
      setDropTarget(null);
      return;
    }
    
    setLocationOrder(prev => {
      // If order is empty, initialize it
      if (prev.length === 0) {
        const allLocations = [...new Set(sensors.map(sensor => sensor.name.split('_')[0]))];
        prev = [...allLocations];
      }
      
      const draggedIndex = prev.indexOf(draggedLocation);
      const targetIndex = prev.indexOf(targetLocation);
      
      if (draggedIndex === -1 || targetIndex === -1) {
        return prev;
      }
      
      // Create new array without the dragged location
      const newOrder = prev.filter(loc => loc !== draggedLocation);
      
      // Insert the dragged location at its new position
      newOrder.splice(targetIndex, 0, draggedLocation);
      
      return newOrder;
    });
    
    setDraggedLocation(null);
    setDropTarget(null);
  }, [draggedLocation, sensors]);
  
  return {
    locationOrder,
    hiddenLocations,
    draggedLocation,
    dropTarget,
    getSortedLocations,
    updateHiddenLocations,
    moveLocationUp,
    moveLocationDown,
    handleDragStart,
    handleDragEnter,
    handleDragLeave,
    handleDrop
  };
} 