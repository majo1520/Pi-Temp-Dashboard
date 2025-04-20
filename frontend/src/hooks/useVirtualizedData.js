import { useMemo } from 'react';

/**
 * A hook that optimizes large datasets for virtualized rendering
 * 
 * @param {Array} data - The full dataset to optimize
 * @param {Object} options - Configuration options
 * @param {number} options.maxItems - Maximum number of items to render at once (default: 1000)
 * @param {boolean} options.useSampling - Whether to use sampling or windowing (default: true)
 * @param {Object} options.keyBy - Group data by a specific key
 * @returns {Object} - The optimized data and helper functions
 */
function useVirtualizedData(data = [], options = {}) {
  const {
    maxItems = 1000,
    useSampling = true,
    keyBy = null
  } = options;
  
  return useMemo(() => {
    // Handle empty data
    if (!data || !Array.isArray(data) || data.length === 0) {
      return {
        optimizedData: [],
        originalLength: 0,
        isOptimized: false,
        getItem: (index) => null,
        getItemCount: () => 0
      };
    }
    
    const originalLength = data.length;
    let optimizedData = data;
    let isOptimized = false;
    
    // Only optimize if data exceeds maxItems
    if (data.length > maxItems) {
      isOptimized = true;
      
      if (useSampling) {
        // Sampling approach - take evenly distributed samples
        const samplingRate = Math.ceil(data.length / maxItems);
        optimizedData = data.filter((_, index) => index % samplingRate === 0);
      } else {
        // Window approach - take the first and last chunks
        const chunkSize = Math.floor(maxItems / 2);
        const firstChunk = data.slice(0, chunkSize);
        const lastChunk = data.slice(Math.max(0, data.length - chunkSize));
        optimizedData = [...firstChunk, ...lastChunk];
      }
    }
    
    // Create a keyed dataset if requested
    const keyedData = keyBy ? optimizedData.reduce((acc, item) => {
      const keyValue = typeof keyBy === 'function' ? keyBy(item) : item[keyBy];
      if (keyValue !== undefined) {
        acc[keyValue] = item;
      }
      return acc;
    }, {}) : null;
    
    // Helper function to get item by index
    const getItem = (index) => {
      if (index < 0 || index >= optimizedData.length) return null;
      return optimizedData[index];
    };
    
    // Helper function to get key by index
    const getItemKey = (index) => {
      const item = getItem(index);
      if (!item) return null;
      return typeof keyBy === 'function' ? keyBy(item) : item[keyBy] || index;
    };
    
    return {
      optimizedData,
      originalLength,
      isOptimized,
      keyedData,
      getItem,
      getItemKey,
      getItemCount: () => optimizedData.length
    };
  }, [data, maxItems, useSampling, keyBy]);
}

export default useVirtualizedData; 