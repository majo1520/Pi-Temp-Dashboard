import React from 'react';
import useDeviceDetect from '../hooks/useDeviceDetect';

/**
 * Wrapper component to render different versions of a component based on device type
 * 
 * Usage: 
 * <MobileOptimized
 *   mobile={<MobileComponent />}
 *   desktop={<DesktopComponent />}
 *   tablet={<TabletComponent />} // Optional
 *   fallback={<FallbackComponent />} // Optional
 * />
 * 
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.mobile - Mobile version of the component
 * @param {React.ReactNode} props.desktop - Desktop version of the component
 * @param {React.ReactNode} props.tablet - Optional tablet version of the component
 * @param {React.ReactNode} props.fallback - Optional fallback component if no matching device
 * @returns {React.ReactNode} The appropriate component for the current device
 */
const MobileOptimized = ({ mobile, desktop, tablet, fallback = null }) => {
  const { isMobile, isTablet, isDesktop } = useDeviceDetect();
  
  if (isMobile && mobile) {
    return mobile;
  }
  
  if (isTablet && tablet) {
    return tablet;
  }
  
  if (isDesktop && desktop) {
    return desktop;
  }
  
  // If we can't determine or don't have a specific version, use the fallback
  if (fallback) {
    return fallback;
  }
  
  // Default to desktop version or mobile if desktop is not provided
  return desktop || mobile || null;
};

/**
 * Wrapper component to apply different styles based on device type
 * 
 * Usage:
 * <MobileOptimizedStyle
 *   mobileStyles="text-sm p-2"
 *   desktopStyles="text-lg p-4"
 *   tabletStyles="text-md p-3"
 * >
 *   <div>Your content here</div>
 * </MobileOptimizedStyle>
 * 
 * @param {Object} props - Component props
 * @param {string} props.mobileStyles - Tailwind classes for mobile
 * @param {string} props.desktopStyles - Tailwind classes for desktop
 * @param {string} props.tabletStyles - Tailwind classes for tablet
 * @param {string} props.baseStyles - Base Tailwind classes for all devices
 * @param {React.ReactNode} props.children - Child components
 * @param {string} props.as - HTML element to render (default: div)
 * @returns {React.ReactNode} The component with device-specific styles
 */
export const MobileOptimizedStyle = ({ 
  mobileStyles = '', 
  desktopStyles = '', 
  tabletStyles = '', 
  baseStyles = '',
  children,
  as: Component = 'div',
  ...rest
}) => {
  const { isMobile, isTablet } = useDeviceDetect();
  
  let responsiveStyles = baseStyles;
  
  if (isMobile) {
    responsiveStyles += ' ' + mobileStyles;
  } else if (isTablet) {
    responsiveStyles += ' ' + tabletStyles;
  } else {
    responsiveStyles += ' ' + desktopStyles;
  }
  
  return (
    <Component className={responsiveStyles.trim()} {...rest}>
      {children}
    </Component>
  );
};

export default MobileOptimized; 