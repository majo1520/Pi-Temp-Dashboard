import { useMemo } from 'react';
import useDeviceDetect from './useDeviceDetect';

/**
 * Hook that provides responsive layout utilities
 * @returns {Object} Layout utility functions and values
 */
function useResponsiveLayout() {
  const deviceData = useDeviceDetect();
  
  // Memoized layout utilities
  const layoutUtils = useMemo(() => {
    // Defines how many items should be shown in different layouts
    const getItemsPerRow = (type = 'default') => {
      const layouts = {
        cards: {
          mobile: 1,
          tablet: 2,
          desktop: 4,
          largeDesktop: 5
        },
        grid: {
          mobile: 1,
          tablet: 2,
          desktop: 3,
          largeDesktop: 4
        },
        default: {
          mobile: 1,
          tablet: 2,
          desktop: 3,
          largeDesktop: 4
        }
      };
      
      const selectedLayout = layouts[type] || layouts.default;
      
      if (deviceData.isExtraSmall || deviceData.isSmall) {
        return selectedLayout.mobile;
      } else if (deviceData.isMedium) {
        return selectedLayout.tablet;
      } else if (deviceData.isLarge) {
        return selectedLayout.desktop;
      } else {
        return selectedLayout.largeDesktop;
      }
    };
    
    // Returns appropriate font sizes
    const getFontSizes = () => ({
      heading: deviceData.isMobile ? 'text-xl' : deviceData.isTablet ? 'text-2xl' : 'text-3xl',
      subheading: deviceData.isMobile ? 'text-lg' : deviceData.isTablet ? 'text-xl' : 'text-2xl',
      body: deviceData.isMobile ? 'text-sm' : 'text-base',
      small: deviceData.isMobile ? 'text-xs' : 'text-sm'
    });
    
    // Returns chart sizing
    const getChartSize = (type = 'default') => {
      const sizes = {
        default: {
          mobile: { height: 250, aspectRatio: 1.2 },
          tablet: { height: 300, aspectRatio: 1.5 },
          desktop: { height: 400, aspectRatio: 1.8 }
        },
        line: {
          mobile: { height: 200, aspectRatio: 1.2 },
          tablet: { height: 250, aspectRatio: 1.5 },
          desktop: { height: 350, aspectRatio: 1.8 }
        },
        heatmap: {
          mobile: { height: 300, aspectRatio: 1 },
          tablet: { height: 400, aspectRatio: 1.2 },
          desktop: { height: 500, aspectRatio: 1.5 }
        }
      };
      
      const selectedSize = sizes[type] || sizes.default;
      
      if (deviceData.isMobile) {
        return selectedSize.mobile;
      } else if (deviceData.isTablet) {
        return selectedSize.tablet;
      } else {
        return selectedSize.desktop;
      }
    };
    
    // Returns spacing values
    const getSpacing = () => ({
      container: deviceData.isMobile ? 'px-2 py-1' : deviceData.isTablet ? 'px-4 py-2' : 'px-6 py-3',
      section: deviceData.isMobile ? 'mb-4' : deviceData.isTablet ? 'mb-6' : 'mb-8',
      card: deviceData.isMobile ? 'p-2' : deviceData.isTablet ? 'p-3' : 'p-4',
      gap: deviceData.isMobile ? 'gap-2' : deviceData.isTablet ? 'gap-3' : 'gap-4'
    });
    
    // Returns layout strategies
    const getGridLayout = (columns = 'default') => {
      const layouts = {
        default: deviceData.isMobile ? '1' : deviceData.isTablet ? '2' : deviceData.isDesktop ? '3' : '4',
        cards: deviceData.isMobile ? '1' : deviceData.isTablet ? '2' : deviceData.isDesktop ? '3' : '4',
        widgets: deviceData.isMobile ? '1' : deviceData.isTablet ? '2' : '3'
      };
      
      const cols = layouts[columns] || layouts.default;
      
      return `grid-cols-${cols}`;
    };
    
    return {
      getItemsPerRow,
      getFontSizes,
      getChartSize,
      getSpacing,
      getGridLayout
    };
  }, [
    deviceData.isMobile, 
    deviceData.isTablet, 
    deviceData.isDesktop,
    deviceData.isExtraSmall,
    deviceData.isSmall,
    deviceData.isMedium,
    deviceData.isLarge
  ]);
  
  return {
    ...deviceData,
    ...layoutUtils
  };
}

export default useResponsiveLayout; 