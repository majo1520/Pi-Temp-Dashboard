import React, { memo } from 'react';
import { FixedSizeList } from 'react-window';
import { useWindowDimensions } from '../hooks';

/**
 * A virtualized list component that only renders items visible in the viewport
 * This component significantly improves performance when rendering large lists
 * 
 * @param {Object} props
 * @param {Array} props.items - The array of items to render
 * @param {Function} props.renderItem - Function to render each item: (item, index) => JSX
 * @param {Number} props.itemHeight - Height of each item in pixels
 * @param {Number} props.height - Optional custom height for the list container
 * @param {Number} props.width - Optional custom width for the list container
 * @param {Boolean} props.fullWidth - If true, the list will take the full width available
 */
const VirtualizedList = ({
  items = [],
  renderItem,
  itemHeight = 50,
  height = 400,
  width = '100%',
  fullWidth = true
}) => {
  const { width: windowWidth } = useWindowDimensions();
  const listWidth = fullWidth ? windowWidth * 0.95 : width;
  
  // Early return if no items
  if (!items || items.length === 0) {
    return <div className="text-center p-4 text-gray-500">No data available</div>;
  }
  
  // Render each item in the virtual window
  const Row = ({ index, style }) => {
    const item = items[index];
    return (
      <div style={style}>
        {renderItem(item, index)}
      </div>
    );
  };
  
  return (
    <FixedSizeList
      height={height}
      width={listWidth}
      itemCount={items.length}
      itemSize={itemHeight}
      className="virtualized-list"
    >
      {Row}
    </FixedSizeList>
  );
};

// Export with memo to prevent unnecessary re-renders
export default memo(VirtualizedList); 