// src/useAutoResponsiveSize.js
// Smart auto-sizing hook for NOTAM Console - Save this as a separate file

import { useState, useEffect, useCallback } from 'react';

// Intelligent breakpoints for different screen sizes
const BREAKPOINTS = {
  xs: 0,     // 0-575px
  sm: 576,   // 576-767px  
  md: 768,   // 768-1023px
  lg: 1024,  // 1024-1439px
  xl: 1440,  // 1440-1919px
  xxl: 1920, // 1920px+
};

// Smart card size calculations based on viewport
const calculateOptimalCardSize = (windowWidth, windowHeight) => {
  // Base calculations
  const viewportWidth = windowWidth;
  const availableWidth = viewportWidth * 0.9; // Account for container padding
  
  let optimalSize;
  let columnsTarget;
  
  if (viewportWidth <= BREAKPOINTS.sm) {
    // Mobile: Single column, full width minus padding
    optimalSize = Math.min(availableWidth - 32, 400);
    columnsTarget = 1;
  } else if (viewportWidth <= BREAKPOINTS.md) {
    // Tablet portrait: Single column, but larger cards
    optimalSize = Math.min(availableWidth - 48, 450);
    columnsTarget = 1;
  } else if (viewportWidth <= BREAKPOINTS.lg) {
    // Tablet landscape: 2 columns optimal
    columnsTarget = 2;
    const gap = 28; // 1.75rem
    optimalSize = Math.min((availableWidth - gap) / 2, 380);
  } else if (viewportWidth <= BREAKPOINTS.xl) {
    // Desktop: 2-3 columns
    columnsTarget = viewportWidth > 1200 ? 3 : 2;
    const gap = 28 * (columnsTarget - 1);
    optimalSize = Math.min((availableWidth - gap) / columnsTarget, 420);
  } else {
    // Large desktop: 3-4 columns
    columnsTarget = viewportWidth > 2000 ? 4 : 3;
    const gap = 28 * (columnsTarget - 1);
    optimalSize = Math.min((availableWidth - gap) / columnsTarget, 450);
  }
  
  // Ensure minimum and maximum bounds
  optimalSize = Math.max(280, Math.min(optimalSize, 520));
  
  return {
    cardSize: Math.round(optimalSize),
    columnsTarget,
    breakpoint: getBreakpointName(viewportWidth),
    viewportWidth,
    viewportHeight: windowHeight
  };
};

const getBreakpointName = (width) => {
  if (width >= BREAKPOINTS.xxl) return 'xxl';
  if (width >= BREAKPOINTS.xl) return 'xl';  
  if (width >= BREAKPOINTS.lg) return 'lg';
  if (width >= BREAKPOINTS.md) return 'md';
  if (width >= BREAKPOINTS.sm) return 'sm';
  return 'xs';
};

// Debounced window resize handler
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

// Main hook
export const useAutoResponsiveSize = (initialSize = 420) => {
  const [sizeInfo, setSizeInfo] = useState(() => {
    // Initialize with sensible defaults for SSR
    if (typeof window === 'undefined') {
      return {
        cardSize: initialSize,
        columnsTarget: 2,
        breakpoint: 'lg',
        viewportWidth: 1024,
        viewportHeight: 768
      };
    }
    
    return calculateOptimalCardSize(window.innerWidth, window.innerHeight);
  });

  const [isAutoMode, setIsAutoMode] = useState(() => {
    // Check localStorage for saved preference
    try {
      const saved = localStorage.getItem('notamAutoSizeMode');
      return saved ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const [manualSize, setManualSize] = useState(() => {
    // Load manual size from localStorage
    try {
      const saved = localStorage.getItem('notamCardSize');
      return saved ? JSON.parse(saved) : initialSize;
    } catch {
      return initialSize;
    }
  });

  // Update size calculations
  const updateSize = useCallback(() => {
    if (typeof window === 'undefined') return;
    
    const newSizeInfo = calculateOptimalCardSize(window.innerWidth, window.innerHeight);
    
    // Only update if there's a meaningful change
    if (newSizeInfo.cardSize !== sizeInfo.cardSize || 
        newSizeInfo.breakpoint !== sizeInfo.breakpoint) {
      setSizeInfo(newSizeInfo);
      
      console.log(`📏 Auto-resize: ${newSizeInfo.breakpoint} (${newSizeInfo.viewportWidth}px) -> ${newSizeInfo.cardSize}px cards, ${newSizeInfo.columnsTarget} columns`);
    }
  }, [sizeInfo]);

  // Debounced resize handler
  const debouncedResize = useDebounce(updateSize, 150);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Initial calculation
    updateSize();

    // Set up resize listener
    window.addEventListener('resize', debouncedResize);
    window.addEventListener('orientationchange', debouncedResize);

    return () => {
      window.removeEventListener('resize', debouncedResize);
      window.removeEventListener('orientationchange', debouncedResize);
    };
  }, [debouncedResize, updateSize]);

  // Methods to control sizing
  const enableAutoMode = useCallback(() => {
    setIsAutoMode(true);
    updateSize();
    localStorage.setItem('notamAutoSizeMode', JSON.stringify(true));
  }, [updateSize]);

  const setManualCardSize = useCallback((size) => {
    const newSize = Math.max(280, Math.min(size, 800));
    setIsAutoMode(false);
    setManualSize(newSize);
    localStorage.setItem('notamAutoSizeMode', JSON.stringify(false));
    localStorage.setItem('notamCardSize', JSON.stringify(newSize));
  }, []);

  const toggleAutoMode = useCallback(() => {
    if (isAutoMode) {
      setManualCardSize(sizeInfo.cardSize);
    } else {
      enableAutoMode();
    }
  }, [isAutoMode, sizeInfo.cardSize, setManualCardSize, enableAutoMode]);

  // Return current effective size and control methods
  return {
    // Current sizing info
    cardSize: isAutoMode ? sizeInfo.cardSize : manualSize,
    columnsTarget: sizeInfo.columnsTarget,
    breakpoint: sizeInfo.breakpoint,
    viewportWidth: sizeInfo.viewportWidth,
    viewportHeight: sizeInfo.viewportHeight,
    
    // Mode control
    isAutoMode,
    enableAutoMode,
    setManualCardSize,
    toggleAutoMode,
    
    // Utility methods
    isSmallScreen: sizeInfo.breakpoint === 'xs' || sizeInfo.breakpoint === 'sm',
    isMobileLayout: sizeInfo.columnsTarget === 1,
    shouldHideCardSizer: sizeInfo.breakpoint === 'xs' || sizeInfo.breakpoint === 'sm',
    
    // For debugging
    _debug: {
      autoCalculatedSize: sizeInfo.cardSize,
      manualSize,
      isAutoMode
    }
  };
};

// CSS custom property updater hook
export const useResponsiveCSS = (cardSize, breakpoint) => {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    
    const root = document.documentElement;
    
    // Update CSS custom properties
    root.style.setProperty('--notam-card-size', `${cardSize}px`);
    root.style.setProperty('--current-breakpoint', breakpoint);
    
    // Add breakpoint class to body for CSS targeting
    document.body.className = document.body.className.replace(/bp-\w+/g, '');
    document.body.classList.add(`bp-${breakpoint}`);
    
  }, [cardSize, breakpoint]);
};

// Enhanced component with auto-sizing
export const AutoSizingWrapper = ({ children, className = '' }) => {
  const sizeInfo = useAutoResponsiveSize();
  useResponsiveCSS(sizeInfo.cardSize, sizeInfo.breakpoint);
  
  return (
    <div 
      className={`auto-sizing-container ${className}`}
      style={{ 
        '--computed-card-size': `${sizeInfo.cardSize}px`,
        '--computed-columns': sizeInfo.columnsTarget,
      }}
      data-breakpoint={sizeInfo.breakpoint}
      data-columns={sizeInfo.columnsTarget}
    >
      {children}
    </div>
  );
};
