import { useState, useEffect, useCallback } from 'react';

/**
 * Hook to detect device type and screen size
 * @returns {Object} Device detection data and utilities
 */
function useDeviceDetect() {
  // Screen breakpoints (match with Tailwind's defaults)
  const BREAKPOINTS = {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    '2xl': 1536
  };

  // State for device detection
  const [deviceData, setDeviceData] = useState({
    isMobile: false,
    isTablet: false,
    isDesktop: false,
    screenWidth: typeof window !== 'undefined' ? window.innerWidth : 0,
    screenHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
    orientation: 'portrait'
  });

  // Check if mobile by user agent
  const checkMobileByUserAgent = useCallback(() => {
    if (typeof navigator === 'undefined') return false;
    
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    
    // Check for mobile/tablet regex patterns
    const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
    const tabletRegex = /iPad|Android.*Tablet|Tablet.*Android/i;
    
    const isMobileDevice = mobileRegex.test(userAgent);
    const isTabletDevice = tabletRegex.test(userAgent);
    
    return {
      isMobileDevice,
      isTabletDevice
    };
  }, []);

  // Update device data based on screen size
  const updateDeviceData = useCallback(() => {
    if (typeof window === 'undefined') return;
    
    const width = window.innerWidth;
    const height = window.innerHeight;
    const { isMobileDevice, isTabletDevice } = checkMobileByUserAgent();
    
    setDeviceData({
      // Primary device type indicators
      isMobile: width < BREAKPOINTS.md || isMobileDevice,
      isTablet: (width >= BREAKPOINTS.md && width < BREAKPOINTS.lg) || isTabletDevice,
      isDesktop: width >= BREAKPOINTS.lg && !isTabletDevice && !isMobileDevice,
      
      // Screen size data
      screenWidth: width,
      screenHeight: height,
      orientation: width > height ? 'landscape' : 'portrait',
      
      // Specific breakpoint checks
      isExtraSmall: width < BREAKPOINTS.sm,
      isSmall: width >= BREAKPOINTS.sm && width < BREAKPOINTS.md,
      isMedium: width >= BREAKPOINTS.md && width < BREAKPOINTS.lg,
      isLarge: width >= BREAKPOINTS.lg && width < BREAKPOINTS.xl,
      isExtraLarge: width >= BREAKPOINTS.xl
    });
  }, [checkMobileByUserAgent]);

  // Handle window resize
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Initial check
    updateDeviceData();
    
    // Add resize listener
    const handleResize = () => {
      updateDeviceData();
    };
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    
    // Clean up
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [updateDeviceData]);

  /**
   * Helper function to get style based on device type
   * @param {Object} styles - Object with style variations
   * @returns {string} - The appropriate style for current device
   */
  const getResponsiveStyle = (styles) => {
    const { mobile, tablet, desktop, default: defaultStyle } = styles;
    
    if (deviceData.isMobile && mobile) return mobile;
    if (deviceData.isTablet && tablet) return tablet;
    if (deviceData.isDesktop && desktop) return desktop;
    
    return defaultStyle || '';
  };

  return {
    ...deviceData,
    getResponsiveStyle,
    BREAKPOINTS
  };
}

export default useDeviceDetect; 