import React, { useState, useEffect } from 'react';
import { useDeviceDetect } from '../../hooks';
import Sidebar from './Sidebar';
import MobileSidebar from './MobileSidebar';

/**
 * Responsive sidebar that renders the appropriate version based on device
 * @param {Object} props
 * @param {boolean} props.isVisible - Whether the sidebar should be visible
 * @param {Function} props.onToggle - Function to toggle sidebar visibility
 */
const ResponsiveSidebar = ({ isVisible, onToggle }) => {
  const { isMobile } = useDeviceDetect();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  
  // On mobile, we use the visibility state to control the mobile sidebar modal
  useEffect(() => {
    if (isMobile) {
      setMobileSidebarOpen(isVisible);
    }
  }, [isVisible, isMobile]);
  
  // Close mobile sidebar
  const handleCloseMobileSidebar = () => {
    setMobileSidebarOpen(false);
    if (onToggle) onToggle();
  };
  
  // If mobile, render the mobile sidebar as a modal
  if (isMobile) {
    return (
      <MobileSidebar 
        isVisible={mobileSidebarOpen}
        onClose={handleCloseMobileSidebar}
      />
    );
  }
  
  // On desktop, render the regular sidebar when it's visible
  return isVisible ? <Sidebar /> : null;
};

export default ResponsiveSidebar; 