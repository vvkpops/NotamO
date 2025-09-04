// Enhanced Auto-Responsive Sizing Hook for Wide Screens
import { useState, useEffect, useCallback } from 'react';

// Enhanced breakpoints with more granular wide-screen support
const BREAKPOINTS = {
  xs: 0,     // 0-575px (Mobile)
  sm: 576,   // 576-767px (Large Mobile/Small Tablet)
  md: 768,   // 768-1023px (Tablet)
  lg: 1024,  // 1024-1439px (Small Desktop)
  xl: 1440,  // 1440-1919px (Desktop)
  xxl: 1920, // 1920-2559px (Large Desktop)
  xxxl: 2560, // 2560px+ (Ultra-wide/4K)
  ultrawide: 3440, // 3440px+ (Ultra-wide monitors)
};

// Smart card size calculations optimized for wide screens
const calculateOptimalCardSize = (windowWidth, windowHeight) => {
  const viewportWidth = windowWidth;
  const availableWidth = viewportWidth * 0.96; // Use more of the available width
  
  let optimalSize;
  let columnsTarget;
  let breakpoint;
  
  if (viewportWidth <= BREAKPOINTS.sm) {
    // Mobile: Single column, full width minus padding
    optimalSize = Math.min(availableWidth - 32, 400);
    columnsTarget = 1;
    breakpoint = 'xs';
  } else if (viewportWidth <= BREAKPOINTS.md) {
    // Large Mobile/Small Tablet: Single column
    optimalSize = Math.min(availableWidth - 48, 450);
    columnsTarget = 1;
    breakpoint = 'sm';
  } else if (viewportWidth <= BREAKPOINTS.lg) {
    // Tablet: 2 columns optimal
    columnsTarget = 2;
    const gap = 24;
    optimalSize = Math.min((availableWidth - gap) / 2, 380);
    breakpoint = 'md';
  } else if (viewportWidth <= BREAKPOINTS.xl) {
    // Small Desktop: 2-3 columns
    columnsTarget = viewportWidth > 1200 ? 3 : 2;
    const gap = 28 * (columnsTarget - 1);
    optimalSize = Math.min((availableWidth - gap) / columnsTarget, 420);
    breakpoint = 'lg';
  } else if (viewportWidth <= BREAKPOINTS.xxl) {
    // Desktop: 3-4 columns
    columnsTarget = Math.floor(viewportWidth / 480);
    columnsTarget = Math.max(3, Math.min(columnsTarget, 5));
    const gap = 32 * (columnsTarget - 1);
    optimalSize = Math.min((availableWidth - gap) / columnsTarget, 450);
    breakpoint = 'xl';
  } else if (viewportWidth <= BREAKPOINTS.xxxl) {
    // Large Desktop: 4-5 columns
    columnsTarget = Math.floor(viewportWidth / 480);
    columnsTarget = Math.max(4, Math.min(columnsTarget, 6));
    const gap = 36 * (columnsTarget - 1);
    optimalSize = Math.min((availableWidth - gap) / columnsTarget, 480);
    breakpoint = 'xxl';
  } else if (viewportWidth <= BREAKPOINTS.ultrawide) {
    // Ultra-wide/4K: 5-7 columns
    columnsTarget = Math.floor(viewportWidth / 520);
    columnsTarget = Math.max(5, Math.min(columnsTarget, 8));
    const gap = 40 * (columnsTarget - 1);
    optimalSize = Math.min((availableWidth - gap) / columnsTarget, 520);
    breakpoint = 'xxxl';
  } else {
    // Ultra-wide monitors: 6-10 columns
    columnsTarget = Math.floor(viewportWidth / 560);
    columnsTarget = Math.max(6, Math.min(columnsTarget, 10));
    const gap = 48 * (columnsTarget - 1);
    optimalSize = Math.min((availableWidth - gap) / columnsTarget, 560);
    breakpoint = 'ultrawide';
  }
  
  // Ensure minimum and maximum bounds with wider range
  optimalSize = Math.max(280, Math.min(optimalSize, 600));
  
  return {
    cardSize: Math.round(optimalSize),
    columnsTarget,
    breakpoint,
    viewportWidth,
    viewportHeight: windowHeight,
    availableWidth,
    utilization: (columnsTarget * optimalSize + (columnsTarget - 1) * 32) / availableWidth
  };
};

const getBreakpointName = (width) => {
  if (width >= BREAKPOINTS.ultrawide) return 'ultrawide';
  if (width >= BREAKPOINTS.xxxl) return 'xxxl';
  if (width >= BREAKPOINTS.xxl) return 'xxl';
  if (width >= BREAKPOINTS.xl) return 'xl';
  if (width >= BREAKPOINTS.lg) return 'lg';
  if (width >= BREAKPOINTS.md) return 'md';
  if (width >= BREAKPOINTS.sm) return 'sm';
  return 'xs';
};

// Debounced resize handler with performance optimization
const useDebounce = (callback, delay) => {
  const [debounceTimer, setDebounceTimer] = useState(null);

  const debouncedCallback = useCallback((...args) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    const newTimer = setTimeout(() => {
      callback(...args);
    }, delay);
    
    setDebounceTimer(newTimer);
  }, [callback, delay, debounceTimer]);

  useEffect(() => {
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  }, [debounceTimer]);

  return debouncedCallback;
};

// Enhanced main hook with wide-screen optimizations
export const useAutoResponsiveSize = (initialSize = 420) => {
  const [sizeInfo, setSizeInfo] = useState(() => {
    // Initialize with sensible defaults for SSR
    if (typeof window === 'undefined') {
      return {
        cardSize: initialSize,
        columnsTarget: 3,
        breakpoint: 'xl',
        viewportWidth: 1440,
        viewportHeight: 900,
        availableWidth: 1380,
        utilization: 0.8
      };
    }
    
    return calculateOptimalCardSize(window.innerWidth, window.innerHeight);
  });

  const [isAutoMode, setIsAutoMode] = useState(() => {
    try {
      const saved = localStorage.getItem('notamAutoSizeMode');
      return saved ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const [manualSize, setManualSize] = useState(() => {
    try {
      const saved = localStorage.getItem('notamCardSize');
      return saved ? JSON.parse(saved) : initialSize;
    } catch {
      return initialSize;
    }
  });

  // Update size calculations with enhanced logging
  const updateSize = useCallback(() => {
    if (typeof window === 'undefined') return;
    
    const newSizeInfo = calculateOptimalCardSize(window.innerWidth, window.innerHeight);
    
    // Only update if there's a meaningful change
    if (newSizeInfo.cardSize !== sizeInfo.cardSize || 
        newSizeInfo.breakpoint !== sizeInfo.breakpoint ||
        newSizeInfo.columnsTarget !== sizeInfo.columnsTarget) {
      
      setSizeInfo(newSizeInfo);
      
      // Enhanced logging for wide screens
      const utilizationPercent = (newSizeInfo.utilization * 100).toFixed(1);
      console.log(`📏 Wide-screen auto-resize:`, {
        breakpoint: newSizeInfo.breakpoint,
        viewport: `${newSizeInfo.viewportWidth}×${newSizeInfo.viewportHeight}`,
        cardSize: `${newSizeInfo.cardSize}px`,
        columns: newSizeInfo.columnsTarget,
        utilization: `${utilizationPercent}%`,
        availableWidth: `${newSizeInfo.availableWidth}px`
      });
    }
  }, [sizeInfo]);

  // Enhanced debounced resize handler for performance
  const debouncedResize = useDebounce(updateSize, 100); // Faster response for better UX

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Initial calculation
    updateSize();

    // Enhanced resize listener with performance optimizations
    const handleResize = () => {
      // Use requestAnimationFrame for smoother updates
      requestAnimationFrame(debouncedResize);
    };

    const handleOrientationChange = () => {
      // Delay orientation change to allow viewport to settle
      setTimeout(debouncedResize, 300);
    };

    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('orientationchange', handleOrientationChange);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, [debouncedResize, updateSize]);

  // Enhanced control methods
  const enableAutoMode = useCallback(() => {
    setIsAutoMode(true);
    updateSize();
    localStorage.setItem('notamAutoSizeMode', JSON.stringify(true));
    console.log('🤖 Auto-sizing enabled for wide-screen optimization');
  }, [updateSize]);

  const setManualCardSize = useCallback((size) => {
    const newSize = Math.max(280, Math.min(size, 800));
    setIsAutoMode(false);
    setManualSize(newSize);
    localStorage.setItem('notamAutoSizeMode', JSON.stringify(false));
    localStorage.setItem('notamCardSize', JSON.stringify(newSize));
    console.log(`🎛️ Manual card size set: ${newSize}px`);
  }, []);

  const toggleAutoMode = useCallback(() => {
    if (isAutoMode) {
      setManualCardSize(sizeInfo.cardSize);
    } else {
      enableAutoMode();
    }
  }, [isAutoMode, sizeInfo.cardSize, setManualCardSize, enableAutoMode]);

  // Enhanced return object with wide-screen utilities
  return {
    // Current sizing info
    cardSize: isAutoMode ? sizeInfo.cardSize : manualSize,
    columnsTarget: sizeInfo.columnsTarget,
    breakpoint: sizeInfo.breakpoint,
    viewportWidth: sizeInfo.viewportWidth,
    viewportHeight: sizeInfo.viewportHeight,
    availableWidth: sizeInfo.availableWidth,
    utilization: sizeInfo.utilization,
    
    // Mode control
    isAutoMode,
    enableAutoMode,
    setManualCardSize,
    toggleAutoMode,
    
    // Enhanced utility methods
    isSmallScreen: sizeInfo.breakpoint === 'xs' || sizeInfo.breakpoint === 'sm',
    isMobileLayout: sizeInfo.columnsTarget === 1,
    isWideScreen: sizeInfo.breakpoint === 'xl' || sizeInfo.breakpoint === 'xxl' || 
                  sizeInfo.breakpoint === 'xxxl' || sizeInfo.breakpoint === 'ultrawide',
    isUltraWide: sizeInfo.breakpoint === 'xxxl' || sizeInfo.breakpoint === 'ultrawide',
    shouldHideCardSizer: sizeInfo.breakpoint === 'xs' || sizeInfo.breakpoint === 'sm',
    
    // Wide-screen specific utilities
    canShowMoreInfo: sizeInfo.viewportWidth >= 1440,
    shouldUseCompactLayout: sizeInfo.viewportWidth < 1024,
    optimalGap: sizeInfo.viewportWidth >= 1920 ? 2.25 : 
               sizeInfo.viewportWidth >= 1440 ? 2 : 1.75,
    
    // Performance info
    isHighDensity: sizeInfo.columnsTarget >= 4,
    efficiencyScore: Math.round(sizeInfo.utilization * 100),
    
    // Debug info
    _debug: {
      autoCalculatedSize: sizeInfo.cardSize,
      manualSize,
      isAutoMode,
      breakpointDetails: {
        current: sizeInfo.breakpoint,
        width: sizeInfo.viewportWidth,
        threshold: BREAKPOINTS[sizeInfo.breakpoint]
      }
    }
  };
};

// Enhanced CSS custom property updater
export const useResponsiveCSS = (cardSize, breakpoint, columnsTarget, utilization) => {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    
    const root = document.documentElement;
    
    // Update CSS custom properties with enhanced values
    root.style.setProperty('--notam-card-size', `${cardSize}px`);
    root.style.setProperty('--current-breakpoint', breakpoint);
    root.style.setProperty('--columns-target', columnsTarget);
    root.style.setProperty('--layout-utilization', utilization);
    
    // Dynamic gap based on screen size
    const dynamicGap = breakpoint === 'ultrawide' ? '3rem' :
                      breakpoint === 'xxxl' ? '2.5rem' :
                      breakpoint === 'xxl' ? '2.25rem' :
                      breakpoint === 'xl' ? '2rem' :
                      breakpoint === 'lg' ? '1.75rem' : '1.5rem';
    
    root.style.setProperty('--dynamic-gap', dynamicGap);
    
    // Update breakpoint class
    document.body.className = document.body.className.replace(/bp-\w+/g, '');
    document.body.classList.add(`bp-${breakpoint}`);
    
    // Add density class for high-column layouts
    document.body.classList.toggle('high-density', columnsTarget >= 4);
    document.body.classList.toggle('ultra-wide', breakpoint === 'xxxl' || breakpoint === 'ultrawide');
    
  }, [cardSize, breakpoint, columnsTarget, utilization]);
};

// Enhanced wrapper component with wide-screen optimizations
export const AutoSizingWrapper = ({ children, className = '' }) => {
  const sizeInfo = useAutoResponsiveSize();
  useResponsiveCSS(sizeInfo.cardSize, sizeInfo.breakpoint, sizeInfo.columnsTarget, sizeInfo.utilization);
  
  return (
    <div 
      className={`auto-sizing-container ${className}`}
      style={{ 
        '--computed-card-size': `${sizeInfo.cardSize}px`,
        '--computed-columns': sizeInfo.columnsTarget,
        '--computed-gap': sizeInfo.optimalGap + 'rem',
        '--efficiency-score': sizeInfo.efficiencyScore,
      }}
      data-breakpoint={sizeInfo.breakpoint}
      data-columns={sizeInfo.columnsTarget}
      data-wide-screen={sizeInfo.isWideScreen}
      data-ultra-wide={sizeInfo.isUltraWide}
      data-efficiency={sizeInfo.efficiencyScore}
    >
      {children}
    </div>
  );
};

export default useAutoResponsiveSize;
