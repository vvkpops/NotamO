import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import NotamTabContent, { FilterModal } from './NotamTabContent';
import { getNotamType, isNotamCurrent, isNotamFuture } from './NotamUtils';
import NotamKeywordHighlightManager, { DEFAULT_NOTAM_KEYWORDS } from './NotamKeywordHighlight.jsx';
import ICAOSortingModal from './ICAOSortingModal.jsx';
import NotamHistoryModal from './NotamHistoryModal.jsx';
import { useAutoResponsiveSize, useResponsiveCSS } from './useAutoResponsiveSize.jsx';
import { getFIRForICAO, getCachedFIRData, setCachedFIRData } from './FIRUtils';

const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

const App = () => {
  // Ensure modal root exists
  useEffect(() => {
    let modalRoot = document.getElementById('modal-root');
    if (!modalRoot) {
      modalRoot = document.createElement('div');
      modalRoot.id = 'modal-root';
      document.body.appendChild(modalRoot);
    }
  }, []);

  // AUTO-RESPONSIVE SIZING SYSTEM
  const {
    cardSize,
    isAutoMode,
    enableAutoMode,
    setManualCardSize,
    toggleAutoMode,
    shouldHideCardSizer,
    isSmallScreen,
    isMobileLayout,
    breakpoint,
    columnsTarget,
    _debug
  } = useAutoResponsiveSize(420); // Default to 420px as fallback

  // Apply CSS custom properties
  useResponsiveCSS(cardSize, breakpoint);

  // State Management
  const [icaos, setIcaos] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("notamIcaos") || "[]");
    } catch {
      return [];
    }
  });
  const [activeTab, setActiveTab] = useState('ALL');
  const [notamDataStore, setNotamDataStore] = useState({});
  const [isAdding, setIsAdding] = useState(false);

  // FIR data store - shared across all ICAOs
  const [firDataStore, setFirDataStore] = useState({});
  const [firFetchStatus, setFirFetchStatus] = useState({}); // Track which FIRs are being fetched

  // Progress tracking
  const [currentlyFetching, setCurrentlyFetching] = useState(null); // What's currently being fetched
  const [fetchProgress, setFetchProgress] = useState({ current: 0, total: 0 }); // Progress tracker

  // Use the responsive card size instead of localStorage-only approach
  const [manualCardSizeOverride, setManualCardSizeOverride] = useState(null);

  // Effective card size - use manual override if set and not in auto mode
  const effectiveCardSize = isAutoMode ? cardSize : (manualCardSizeOverride || cardSize);

  // Log responsive changes for debugging
  useEffect(() => {
    console.log(`📱 Responsive Update:`, {
      breakpoint,
      cardSize,
      columnsTarget,
      isAutoMode,
      isMobileLayout,
      shouldHideCardSizer
    });
  }, [breakpoint, cardSize, columnsTarget, isAutoMode, isMobileLayout, shouldHideCardSizer]);

  // Batching, new NOTAM detection, and auto-refresh states
  const [fetchQueue, setFetchQueue] = useState([]);
  const [newNotamIcaos, setNewNotamIcaos] = useState(new Set());
  const [timeToNextRefresh, setTimeToNextRefresh] = useState(AUTO_REFRESH_INTERVAL);

  // Filter states
  const [keywordFilter, setKeywordFilter] = useState('');
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [filterOrder, setFilterOrder] = useState([
    'rwy', 'twy', 'rsc', 'crfi', 'ils', 'fuel', 'other', 'cancelled'
  ]);
  const [filters, setFilters] = useState({
    rwy: true, twy: true, rsc: true, crfi: true, ils: true,
    fuel: true, other: true, cancelled: false, current: true, future: true,
  });
  const [dragState, setDragState] = useState({
    draggedItem: null,
    draggedOver: null
  });

  // Keyword highlighting states
  const [keywordHighlightEnabled, setKeywordHighlightEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem('notamKeywordHighlightEnabled');
      return saved ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });
  const [keywordCategories, setKeywordCategories] = useState(() => {
    try {
      const saved = localStorage.getItem('notamKeywordCategories');
      return saved ? JSON.parse(saved) : DEFAULT_NOTAM_KEYWORDS;
    } catch {
      return DEFAULT_NOTAM_KEYWORDS;
    }
  });
  const [isHighlightModalOpen, setIsHighlightModalOpen] = useState(false);

  // ICAO Sorting states
  const [isSortModalOpen, setIsSortModalOpen] = useState(false);

  // New NOTAM history states
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [notamHistory, setNotamHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('notamHistory');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Use useRef to avoid stale state in callbacks
  const icaosRef = useRef([]);
  const isProcessingQueue = useRef(false);
  const queueTimerRef = useRef(null);
  const icaoInputRef = useRef(null);

  // Update ref whenever icaos changes
  useEffect(() => {
    icaosRef.current = icaos;
  }, [icaos]);

  // Enhanced card size handler that respects auto mode
  const handleCardSizeChange = useCallback((newSize) => {
    const size = parseInt(newSize);
    if (isAutoMode) {
      // If in auto mode, switch to manual mode with this size
      setManualCardSize(size);
      setManualCardSizeOverride(size);
    } else {
      // Manual mode - just update the size
      setManualCardSizeOverride(size);
      setManualCardSize(size);
    }
  }, [isAutoMode, setManualCardSize]);

  // Toggle auto/manual sizing mode
  const handleToggleAutoMode = useCallback(() => {
    if (isAutoMode) {
      // Switching to manual - preserve current size
      setManualCardSizeOverride(cardSize);
      setManualCardSize(cardSize);
    } else {
      // Switching to auto - clear override
      setManualCardSizeOverride(null);
      enableAutoMode();
    }
  }, [isAutoMode, cardSize, setManualCardSize, enableAutoMode]);

  // Save manual size to localStorage
  useEffect(() => {
    try {
      if (!isAutoMode && manualCardSizeOverride) {
        localStorage.setItem('notamCardSize', JSON.stringify(manualCardSizeOverride));
        localStorage.setItem('notamAutoSizeMode', JSON.stringify(false));
      } else if (isAutoMode) {
        localStorage.setItem('notamAutoSizeMode', JSON.stringify(true));
      }
    } catch (error) {
      console.warn('Failed to save card size settings:', error);
    }
  }, [isAutoMode, manualCardSizeOverride]);

  // Load saved preferences on startup
  useEffect(() => {
    try {
      const savedAutoMode = localStorage.getItem('notamAutoSizeMode');
      const savedSize = localStorage.getItem('notamCardSize');
      
      if (savedAutoMode && savedSize) {
        const autoMode = JSON.parse(savedAutoMode);
        const size = JSON.parse(savedSize);
        
        if (!autoMode && size) {
          setManualCardSize(size);
          setManualCardSizeOverride(size);
        }
      }
    } catch (error) {
      console.warn('Failed to load card size settings:', error);
    }
  }, [setManualCardSize]);

  // Load custom ICAO order on app start
  useEffect(() => {
    const savedOrder = localStorage.getItem('icaoCustomOrder');
    if (savedOrder) {
      try {
        const parsedOrder = JSON.parse(savedOrder);
        const currentIcaos = JSON.parse(localStorage.getItem("notamIcaos") || "[]");
        const orderedIcaos = [...parsedOrder.filter(icao => currentIcaos.includes(icao))];
        const newIcaos = currentIcaos.filter(icao => !orderedIcaos.includes(icao));
        const finalOrder = [...orderedIcaos, ...newIcaos];
        
        if (finalOrder.length > 0 && JSON.stringify(finalOrder) !== JSON.stringify(currentIcaos)) {
          setIcaos(finalOrder);
          localStorage.setItem("notamIcaos", JSON.stringify(finalOrder));
        }
      } catch (error) {
        console.warn('Failed to load custom ICAO order:', error);
      }
    }
  }, []);

  // Enhanced card sizer control with auto mode toggle
  const CardSizerControl = () => {
    if (shouldHideCardSizer) return null;
    
    return (
      <div className="card-sizer-control">
        <span className="sizer-icon">↔️</span>
        <button 
          className={`auto-toggle-btn ${isAutoMode ? 'auto-enabled' : 'manual-enabled'}`}
          onClick={handleToggleAutoMode}
          title={isAutoMode ? 'Switch to manual sizing' : 'Switch to automatic sizing'}
        >
          {isAutoMode ? 'AUTO' : 'MANUAL'}
        </button>
        {!isAutoMode && (
          <>
            <input 
              type="range" 
              min="280" 
              max="600" 
              step="10" 
              value={effectiveCardSize} 
              onChange={(e) => handleCardSizeChange(e.target.value)} 
              className="card-size-slider" 
              title={`Adjust card width: ${effectiveCardSize}px`} 
            />
            <span className="sizer-value">{effectiveCardSize}px</span>
          </>
        )}
        {isAutoMode && (
          <span className="sizer-value auto-info">
            {cardSize}px ({breakpoint.toUpperCase()})
          </span>
        )}
      </div>
    );
  };

  // Handle ICAO reordering
  const handleIcaoReorder = useCallback((newOrder) => {
    setIcaos(newOrder);
    localStorage.setItem("notamIcaos", JSON.stringify(newOrder));
    localStorage.setItem('icaoCustomOrder', JSON.stringify(newOrder));
    console.log('🔄 ICAO order updated:', newOrder);
  }, []);

  // Save settings to localStorage with error handling
  useEffect(() => {
    try {
      localStorage.setItem('notamKeywordHighlightEnabled', JSON.stringify(keywordHighlightEnabled));
    } catch (error) {
      console.warn('Failed to save highlight setting:', error);
    }
  }, [keywordHighlightEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem('notamKeywordCategories', JSON.stringify(keywordCategories));
    } catch (error) {
      console.warn('Failed to save keyword categories:', error);
    }
  }, [keywordCategories]);

  useEffect(() => {
    try {
      // Limit history to 100 entries
      const limitedHistory = notamHistory.slice(0, 100);
      localStorage.setItem('notamHistory', JSON.stringify(limitedHistory));
    } catch (error) {
      console.warn('Failed to save NOTAM history:', error);
    }
  }, [notamHistory]);

  // Enhanced NOTAM signature generation for better detection
  const createNotamSignature = useCallback((notam) => {
    const number = notam.number || 'unknown';
    const validFrom = notam.validFrom || 'unknown';
    const validTo = notam.validTo || 'unknown';
    const source = notam.source || 'unknown';
    
    // Create content hash from summary/rawText
    const summary = (notam.summary || '').replace(/\s+/g, ' ').trim();
    const rawText = (notam.rawText || '').replace(/\s+/g, ' ').trim();
    const text = summary || rawText;
    const contentHash = text.slice(0, 200);
    
    return `${number}-${validFrom}-${validTo}-${source}-${contentHash}`;
  }, []);

  // Smart incremental NOTAM detection and merging
  const smartNotamMerge = useCallback((oldData, newData, isInitialFetch) => {
    if (isInitialFetch || oldData.length === 0) {
      console.log(`📋 Initial fetch: ${newData.length} NOTAMs loaded`);
      return { 
        processedData: newData.map(n => ({ ...n, isNew: false, userViewed: false })), 
        hasNewNotams: false,
        newNotamsList: [],
        stats: {
          new: newData.length,
          expired: 0,
          existing: 0,
          total: newData.length
        }
      };
    }

    // Create signature maps for efficient lookup
    const oldNotamMap = new Map();
    const oldSignatures = new Set();
    
    oldData.forEach(notam => {
      const signature = createNotamSignature(notam);
      oldNotamMap.set(signature, notam);
      oldSignatures.add(signature);
    });

    // Process new data
    const newNotamMap = new Map();
    const newSignatures = new Set();
    
    newData.forEach(notam => {
      const signature = createNotamSignature(notam);
      newNotamMap.set(signature, notam);
      newSignatures.add(signature);
    });

    // Find truly new NOTAMs
    const genuinelyNewSignatures = [...newSignatures].filter(sig => !oldSignatures.has(sig));
    
    // Find expired NOTAMs (removed from source)
    const expiredSignatures = [...oldSignatures].filter(sig => !newSignatures.has(sig));
    
    // Find updated NOTAMs (same signature but potentially different content)
    const existingSignatures = [...newSignatures].filter(sig => oldSignatures.has(sig));

    console.log(`🔄 NOTAM Analysis:`, {
      total: newData.length,
      new: genuinelyNewSignatures.length,
      expired: expiredSignatures.length,
      existing: existingSignatures.length
    });

    // Build merged result
    const mergedNotams = [];
    const newNotamsList = [];
    let hasNewNotams = false;

    // 1. Add existing NOTAMs (preserve user state)
    existingSignatures.forEach(signature => {
      const existingNotam = oldNotamMap.get(signature);
      const updatedNotam = newNotamMap.get(signature);
      
      // Preserve user state from existing NOTAM
      mergedNotams.push({
        ...updatedNotam, // Use updated content
        isNew: existingNotam.isNew, // Preserve new status
        userViewed: existingNotam.userViewed, // Preserve viewed status
        firstSeenAt: existingNotam.firstSeenAt, // Preserve first seen timestamp
      });
    });

    // 2. Add genuinely new NOTAMs
    genuinelyNewSignatures.forEach(signature => {
      const newNotam = newNotamMap.get(signature);
      hasNewNotams = true;
      
      console.log(`🆕 New NOTAM detected: ${newNotam.number}`);
      
      const newNotamObject = {
        ...newNotam,
        isNew: true,
        userViewed: false,
        firstSeenAt: Date.now(),
      };
      mergedNotams.push(newNotamObject);
      newNotamsList.push(newNotamObject);
    });

    // 3. Log expired NOTAMs but don't include them
    if (expiredSignatures.length > 0) {
      console.log(`🗑️ Expired NOTAMs removed: ${expiredSignatures.length}`);
      expiredSignatures.forEach(signature => {
        const expiredNotam = oldNotamMap.get(signature);
        console.log(`   - ${expiredNotam.number}`);
      });
    }

    // Sort merged NOTAMs by validity date (newest first)
    mergedNotams.sort((a, b) => {
      const dateA = new Date(a.validFrom || 0);
      const dateB = new Date(b.validFrom || 0);
      return dateB - dateA;
    });

    return { 
      processedData: mergedNotams, 
      hasNewNotams,
      newNotamsList,
      stats: {
        new: genuinelyNewSignatures.length,
        expired: expiredSignatures.length,
        existing: existingSignatures.length,
        total: mergedNotams.length
      }
    };
  }, [createNotamSignature]);

  const handleRefreshIcao = useCallback((icaoToRefresh) => {
    if (fetchQueue.includes(icaoToRefresh)) return;
    setFetchQueue(prev => [...prev, icaoToRefresh]);
  }, [fetchQueue]);

  // Fetch FIR NOTAMs with shared cache
  const fetchFIRNotams = useCallback(async (firCode, icao) => {
    if (!firCode) return;
    
    // Check if FIR is already being fetched
    if (firFetchStatus[firCode]?.fetching) {
      console.log(`⏳ FIR ${firCode} is already being fetched, waiting...`);
      return;
    }
    
    // Check if FIR data already exists and is recent (less than 5 mins old)
    const existingFirData = firDataStore[firCode];
    if (existingFirData && existingFirData.lastUpdated) {
      const age = Date.now() - existingFirData.lastUpdated;
      if (age < 5 * 60 * 1000) { // 5 minutes
        console.log(`✅ Using existing FIR data for ${firCode} (${Math.round(age / 1000)}s old)`);
        return;
      }
    }
    
    setCurrentlyFetching(`FIR ${firCode}`);
    setFirFetchStatus(prev => ({ ...prev, [firCode]: { fetching: true, error: null } }));
    
    try {
      console.log(`🌐 Fetching FIR NOTAMs for ${firCode}`);
      const response = await fetch(`/api/notams?fir=${firCode}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      // Filter to only include FIR-wide NOTAMs (not specific airports)
      const firWideNotams = data.filter(notam => {
        const isAirportSpecific = /^[A-Z]{4}$/.test(notam.icao) && notam.icao !== firCode;
        return !isAirportSpecific;
      });
      
      console.log(`✅ Loaded ${firWideNotams.length} FIR-wide NOTAMs for ${firCode}`);
      
      // Apply new NOTAM detection
      const oldFirData = firDataStore[firCode]?.data || [];
      const { processedData, hasNewNotams, newNotamsList } = smartNotamMerge(
        oldFirData, 
        firWideNotams, 
        oldFirData.length === 0
      );
      
      // Update FIR data store
      setFirDataStore(prev => ({
        ...prev,
        [firCode]: {
          data: processedData,
          lastUpdated: Date.now(),
          loading: false,
          error: null
        }
      }));
      
      // Cache the results
      setCachedFIRData(firCode, processedData);
      
      setFirFetchStatus(prev => ({ ...prev, [firCode]: { fetching: false, error: null } }));
      
    } catch (error) {
      console.error(`❌ Error fetching FIR NOTAMs for ${firCode}:`, error);
      setFirFetchStatus(prev => ({ 
        ...prev, 
        [firCode]: { fetching: false, error: error.message } 
      }));
      setFirDataStore(prev => ({
        ...prev,
        [firCode]: {
          ...prev[firCode],
          loading: false,
          error: error.message
        }
      }));
    }
  }, [firFetchStatus, firDataStore, smartNotamMerge]);

  // Updated fetchNotams function with correct logic
const fetchNotams = useCallback(async (icao) => {
  console.log(`🚀 Fetching NOTAMs for ${icao}`);
  setCurrentlyFetching(`ICAO ${icao}`);
  
  // Set loading state but preserve existing data
  setNotamDataStore(prev => ({ 
    ...prev, 
    [icao]: { ...prev[icao], loading: true, error: null } 
  }));
  
  try {
    const response = await fetch(`/api/notams?icao=${icao}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error);
    }
    
    setNotamDataStore(prev => {
      const oldData = prev[icao]?.data || [];
      const isInitialFetch = oldData.length === 0 && !prev[icao]?.lastUpdated;
      
      // Use smart incremental merge
      const { processedData, hasNewNotams, newNotamsList, stats } = smartNotamMerge(oldData, data, isInitialFetch);
      
      // Add ICAO to each NOTAM for consistency
      const notamsWithIcao = processedData.map(n => ({ ...n, icao }));

      // Update new NOTAM indicators and history if there are new NOTAMs
      if (hasNewNotams) {
        console.log(`🆕 Found ${stats.new} new NOTAMs for ${icao}`);
        setNewNotamIcaos(prevSet => new Set(prevSet).add(icao));
        
        const historyEntry = {
          id: Date.now(),
          icao: icao,
          timestamp: new Date().toISOString(),
          count: newNotamsList.length,
          notams: newNotamsList.map(n => ({ number: n.number, summary: n.summary.substring(0, 100) + '...' }))
        };
        setNotamHistory(prevHistory => [historyEntry, ...prevHistory]);
      }

      console.log(`✅ Successfully updated ${icao}: ${stats.total} NOTAMs (${stats.new} new, ${stats.expired} expired)`);
      
      // IMPORTANT: Determine if we should fetch FIR based on source and data count
      const source = notamsWithIcao[0]?.source || 'UNKNOWN';
      const hasFaaData = source === 'FAA' && notamsWithIcao.length > 0;
      const isNavCanadaFallback = source === 'NAV CANADA'; // This means FAA returned 0
      
      if (hasFaaData) {
        // FAA returned at least 1 NOTAM - fetch FIR
        console.log(`✅ FAA returned ${notamsWithIcao.length} NOTAMs for ${icao}, will fetch FIR`);
        
        // Extract FIR and fetch FIR NOTAMs
        const firCode = getFIRForICAO(icao, notamsWithIcao);
        if (firCode) {
          console.log(`🔍 Detected FIR ${firCode} for ${icao}, fetching FIR NOTAMs...`);
          // Fetch FIR NOTAMs in parallel (non-blocking)
          fetchFIRNotams(firCode, icao).catch(err => {
            console.error(`Failed to fetch FIR ${firCode}:`, err);
          });
        } else {
          console.log(`⚠️ Could not determine FIR for ${icao}`);
        }
      } else if (isNavCanadaFallback) {
        // NAV CANADA data (FAA returned 0) - NO FIR fetch needed
        console.log(`🍁 Using NAV CANADA data for ${icao} (FAA returned 0). NAV CANADA already includes FIR NOTAMs, skipping FIR fetch.`);
      }

      return { 
        ...prev, 
        [icao]: { 
          data: notamsWithIcao, 
          loading: false, 
          error: null,
          lastUpdated: Date.now(),
          stats: stats,
          source: source // Track the source
        } 
      };
    });
    
  } catch (err) {
    console.error(`❌ Error fetching NOTAMs for ${icao}:`, err.message);
    
    setNotamDataStore(prev => ({ 
      ...prev, 
      [icao]: { 
        ...prev[icao], 
        loading: false, 
        error: err.message,
        lastError: Date.now()
      } 
    }));
  } finally {
    setCurrentlyFetching(null);
  }
}, [smartNotamMerge, fetchFIRNotams]);
  // Clear new status when user views NOTAMs
  const markNotamsAsViewed = useCallback((icao) => {
    setNotamDataStore(prev => {
      if (!prev[icao]?.data) return prev;
      
      const updatedData = prev[icao].data.map(notam => ({
        ...notam,
        userViewed: true,
        isNew: false // Clear new status when viewed
      }));

      return {
        ...prev,
        [icao]: {
          ...prev[icao],
          data: updatedData
        }
      };
    });
  }, []);

  // Stable handleRefreshAll using ref
  const handleRefreshAll = useCallback(() => {
    const currentIcaos = icaosRef.current;
    
    if (currentIcaos.length > 0) {
      console.log(`🔄 Auto-refresh triggered for all ICAOs: ${currentIcaos.join(', ')}`);
      
      // Clear FIR cache to force refresh
      setFirDataStore({});
      setFirFetchStatus({});
      
      setFetchQueue(prevQueue => {
        const newQueue = [...new Set([...prevQueue, ...currentIcaos])];
        console.log(`📋 Queue updated: ${newQueue.join(', ')}`);
        setFetchProgress({ current: 0, total: newQueue.length });
        return newQueue;
      });
    } else {
      console.log('⚠️  No ICAOs to refresh');
    }
  }, []);

  // Smart refresh handler for the main button
  const handleSmartRefresh = useCallback(() => {
    if (activeTab === 'ALL') {
      handleRefreshAll();
    } else if (icaos.includes(activeTab)) {
      handleRefreshIcao(activeTab);
    }
  }, [activeTab, icaos, handleRefreshAll, handleRefreshIcao]);

  // Robust queue processing
  const processQueueRef = useRef();
  
  useEffect(() => {
    processQueueRef.current = () => {
      if (isProcessingQueue.current) {
        console.log('⚠️  Queue processing already in progress, skipping');
        return;
      }

      setFetchQueue(currentQueue => {
        if (currentQueue.length === 0) {
          console.log('✅ Queue empty, processing complete');
          isProcessingQueue.current = false;
          setCurrentlyFetching(null);
          setFetchProgress({ current: 0, total: 0 });
          return currentQueue;
        }

        if (currentQueue.length > 10) {
          console.warn(`⚠️  Queue is large (${currentQueue.length} items), this may take a while`);
        }

        isProcessingQueue.current = true;
        const icaoToFetch = currentQueue[0];
        
        console.log(`🔄 Processing queue item: ${icaoToFetch} (${currentQueue.length - 1} remaining)`);
        
        // Update progress
        const totalItems = fetchProgress.total || currentQueue.length;
        const currentItem = totalItems - currentQueue.length + 1;
        setFetchProgress({ current: currentItem, total: totalItems });
        
        fetchNotams(icaoToFetch).finally(() => {
          queueTimerRef.current = setTimeout(() => {
            isProcessingQueue.current = false;
            processQueueRef.current();
          }, 2100);
        });

        return currentQueue.slice(1);
      });
    };
  });

  // Trigger queue processing when items are added
  useEffect(() => {
    if (fetchQueue.length > 0 && !isProcessingQueue.current) {
      processQueueRef.current();
    }
    
    return () => {
      if (queueTimerRef.current) {
        clearTimeout(queueTimerRef.current);
      }
    };
  }, [fetchQueue]);

  // Stable timer with proper cleanup
  useEffect(() => {
    console.log('🕐 Starting auto-refresh timer');
    
    const timer = setInterval(() => {
      setTimeToNextRefresh(prevTime => {
        const newTime = prevTime - 1000;
        
        if (newTime <= 0) {
          console.log('⏰ Auto-refresh timer expired, triggering refresh');
          handleRefreshAll();
          return AUTO_REFRESH_INTERVAL;
        }
        
        return newTime;
      });
    }, 1000);
    
    // Initial fetch for any ICAOs loaded from localStorage
    const savedIcaos = JSON.parse(localStorage.getItem("notamIcaos") || "[]");
    if (savedIcaos.length > 0) {
      console.log(`🔄 Initial fetch for saved ICAOs: ${savedIcaos.join(', ')}`);
      setFetchQueue(prev => [...new Set([...prev, ...savedIcaos])]);
      setFetchProgress({ current: 0, total: savedIcaos.length });
    }

    return () => {
      console.log('🛑 Cleaning up auto-refresh timer');
      clearInterval(timer);
      if (queueTimerRef.current) {
        clearTimeout(queueTimerRef.current);
      }
    };
  }, [handleRefreshAll]);

  useEffect(() => {
    try {
      localStorage.setItem("notamIcaos", JSON.stringify(icaos));
    } catch (error) {
      console.warn('Failed to save ICAOs:', error);
    }
    
    if (!icaos.includes(activeTab) && activeTab !== 'ALL') {
      setActiveTab(icaos.length > 0 ? icaos[0] : 'ALL');
    }
  }, [icaos, activeTab]);
  
  const handleAddIcao = useCallback(() => {
    if (!icaoInputRef.current || isAdding) return;
    const input = icaoInputRef.current.value.toUpperCase().trim();
    const newIcaoInputs = input.split(/[,\s]+/).map(s => s.trim()).filter(s => s.length === 4 && /^[A-Z0-9]{4}$/.test(s));
    if (newIcaoInputs.length === 0) {
      icaoInputRef.current.style.animation = 'shake 0.5s ease-in-out';
      setTimeout(() => { if (icaoInputRef.current) { icaoInputRef.current.style.animation = ''; } }, 500);
      return;
    }
    setIsAdding(true);
    const uniqueNewIcaos = [...new Set(newIcaoInputs.filter(icao => !icaos.includes(icao)))];
    if (uniqueNewIcaos.length > 0) {
      const updatedIcaos = [...icaos, ...uniqueNewIcaos];
      setIcaos(updatedIcaos);
      setActiveTab(uniqueNewIcaos[0]);
      setFetchQueue(prev => [...new Set([...prev, ...uniqueNewIcaos])]);
      setFetchProgress({ current: 0, total: uniqueNewIcaos.length });
      icaoInputRef.current.classList.add('success-flash');
      setTimeout(() => { if (icaoInputRef.current) { icaoInputRef.current.classList.remove('success-flash'); } }, 500);
    }
    icaoInputRef.current.value = "";
    icaoInputRef.current.focus();
    setTimeout(() => setIsAdding(false), 300);
  }, [icaos, isAdding]);

  const handleRemoveIcao = useCallback((icaoToRemove) => {
    setIcaos(prev => prev.filter(i => i !== icaoToRemove));
    setNotamDataStore(prev => { const newStore = {...prev}; delete newStore[icaoToRemove]; return newStore; });
    setNewNotamIcaos(prevSet => {
      const newSet = new Set(prevSet);
      newSet.delete(icaoToRemove);
      return newSet;
    });
  }, []);

  const handleIcaoInputKeyPress = (e) => {
    if (e.key === "Enter") handleAddIcao();
  };

  const allNotamsData = useMemo(() => {
    let combined = [];
    // Show loading only if there's no data for ANY ICAO yet.
    let hasAnyData = icaos.some(icao => notamDataStore[icao]?.data?.length > 0);
    let isLoading = icaos.some(icao => notamDataStore[icao]?.loading) && !hasAnyData;
    let anyError = null;

    [...icaos].sort().forEach(icao => {
      const storeEntry = notamDataStore[icao];
      if (storeEntry) {
        if (storeEntry.error) anyError = anyError || storeEntry.error;
        if (storeEntry.data && storeEntry.data.length > 0) {
          combined.push({ isIcaoHeader: true, icao: icao, id: `header-${icao}` });
          combined = combined.concat(storeEntry.data);
        }
      }
    });
    return { data: combined, loading: isLoading, error: anyError };
  }, [notamDataStore, icaos]);

  const activeNotamData = useMemo(() => {
    if (activeTab === 'ALL') return allNotamsData;
    const storeEntry = notamDataStore[activeTab];
    // Show loading spinner only if there's no data for this tab yet.
    const isLoading = storeEntry?.loading && (!storeEntry.data || storeEntry.data.length === 0);
    return { data: storeEntry?.data || [], loading: isLoading, error: storeEntry?.error || null };
  }, [activeTab, allNotamsData, notamDataStore]);

  const { filteredNotams, typeCounts, hasActiveFilters, activeFilterCount } = useMemo(() => {
    const notams = activeNotamData.data;
    if (!notams) return { filteredNotams: [], typeCounts: {}, hasActiveFilters: false, activeFilterCount: 0 };
    const counts = { rwy: 0, twy: 0, rsc: 0, crfi: 0, ils: 0, fuel: 0, other: 0, cancelled: 0, current: 0, future: 0 };
    notams.forEach(notam => {
      if (notam.isIcaoHeader) return;
      const type = getNotamType(notam); counts[type]++;
      if (isNotamCurrent(notam)) counts.current++; if (isNotamFuture(notam)) counts.future++;
    });
    const filterFunc = notam => {
      if (notam.isIcaoHeader) return true;
      const type = getNotamType(notam);
      if (keywordFilter && !(notam.summary || '').toLowerCase().includes(keywordFilter.toLowerCase())) return false;
      if (filters[type] === false) return false;
      if (!filters.current && isNotamCurrent(notam)) return false;
      if (!filters.future && isNotamFuture(notam)) return false;
      return true;
    };
    const sortFunc = (a, b) => {
      if (a.isIcaoHeader || b.isIcaoHeader) return 0;
      const aPrio = filterOrder.indexOf(getNotamType(a)), bPrio = filterOrder.indexOf(getNotamType(b));
      if (aPrio !== bPrio) return aPrio - bPrio;
      return new Date(b.validFrom) - new Date(b.validFrom);
    };
    let results = notams.filter(filterFunc).sort(sortFunc);
    if (activeTab === 'ALL') {
        const icaoGroups = results.reduce((acc, item) => {
            if (item.isIcaoHeader) return acc;
            acc[item.icao] = acc[item.icao] || [];
            acc[item.icao].push(item);
            return acc;
        }, {});
        results = [];
        Object.keys(icaoGroups).sort().forEach(icao => {
            if (icaoGroups[icao].length > 0) {
                results.push({ isIcaoHeader: true, icao: icao, id: `header-${icao}` });
                results.push(...icaoGroups[icao]);
            }
        });
    }
    const defaultFilters = { rwy: true, twy: true, rsc: true, crfi: true, ils: true, fuel: true, other: true, cancelled: false, current: true, future: true };
    const hasFilters = keywordFilter || Object.keys(filters).some(key => filters[key] !== defaultFilters[key]);
    const filterCount = Object.keys(filters).filter(key => filters[key] !== defaultFilters[key]).length + (keywordFilter ? 1 : 0);
    return { filteredNotams: results, typeCounts: counts, hasActiveFilters: hasFilters, activeFilterCount: filterCount };
  }, [activeNotamData.data, keywordFilter, filters, activeTab, filterOrder]);

  const handleFilterChange = (filterKey) => setFilters(prev => ({ ...prev, [filterKey]: !prev[filterKey] }));
  const clearAllFilters = () => {
    setFilters({ rwy: true, twy: true, rsc: true, crfi: true, ils: true, fuel: true, other: true, cancelled: false, current: true, future: true });
    setKeywordFilter('');
  };

  // Tab click with smart new NOTAM clearing
  const handleTabClick = (id) => {
    setActiveTab(id);
    
    // Clear the "new" indicator when user views the tab
    if (newNotamIcaos.has(id)) {
      console.log(`👁️  User viewed ${id}, clearing new NOTAM indicator`);
      setNewNotamIcaos(prevSet => {
        const newSet = new Set(prevSet);
        newSet.delete(id);
        return newSet;
      });
      
      // Mark NOTAMs as viewed
      markNotamsAsViewed(id);
    }
  };

  const Tab = ({ id, label, onRemove }) => {
    const hasNew = newNotamIcaos.has(id);
    return (
      <div className={`icao-tab ${activeTab === id ? 'active' : ''} ${hasNew ? 'has-new-notams' : ''}`} onClick={() => handleTabClick(id)}>
        <span>{label}</span>
        {onRemove && (
          <div className="tab-actions">
            <button onClick={(e) => { e.stopPropagation(); onRemove(id); }} className="remove-btn" title={`Remove ${id}`}>×</button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="container" style={{ '--notam-card-size': `${effectiveCardSize}px` }}>
      <ModernHeader 
        timeToNextRefresh={timeToNextRefresh} 
        onRefresh={handleSmartRefresh}
        onHistoryClick={() => setIsHistoryModalOpen(true)}
        activeTab={activeTab}
        autoRefreshAll={handleRefreshAll}
        currentlyFetching={currentlyFetching}
        fetchProgress={fetchProgress}
        isQueueProcessing={isProcessingQueue.current || fetchQueue.length > 0}
      />
      
      <div className="glass icao-input-container">
        <div className="control-row">
          <div className="icao-input-wrapper">
            <input ref={icaoInputRef} placeholder="ICAO codes (e.g., CYYT, KJFK)" className="icao-input" onKeyPress={handleIcaoInputKeyPress} disabled={isAdding} />
            <button onClick={handleAddIcao} className={`add-button ${isAdding ? 'loading' : ''}`} disabled={isAdding}>
              {isAdding ? (<><span className="loading-spinner"></span>Adding...</>) : 'Add ICAO'}
            </button>
          </div>
          <div className="view-controls">
            <button className="view-control-btn" onClick={() => setIsFilterModalOpen(true)}>
              <span className="btn-icon">🎯</span><span>Filter</span>
              {activeFilterCount > 0 && (<span className="btn-badge">{activeFilterCount}</span>)}
            </button>
            <button className="view-control-btn" onClick={() => setIsHighlightModalOpen(true)} style={{background: keywordHighlightEnabled ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : ''}}>
              <span className="btn-icon">💡</span><span>Highlight</span>
              {keywordHighlightEnabled && (<span className="btn-badge">ON</span>)}
            </button>
            <button className="view-control-btn" onClick={() => setIsSortModalOpen(true)} disabled={icaos.length === 0}>
              <span className="btn-icon">↕️</span><span>Sort</span>
            </button>
          </div>
        </div>
        <div className="control-row">
          <div className="search-input-wrapper">
            <span className="search-icon">🔍</span>
            <input type="text" placeholder="Filter current results by keyword..." className="search-input" value={keywordFilter} onChange={(e) => setKeywordFilter(e.target.value)} />
            {keywordFilter && (<button className="clear-search-btn" onClick={() => setKeywordFilter('')} title="Clear search">✕</button>)}
          </div>
          <div className="secondary-controls">
            <CardSizerControl />
            {hasActiveFilters && (<button className="quick-clear-btn" onClick={clearAllFilters}>Clear Filters</button>)}
          </div>
        </div>
      </div>
      
      <div className="glass">
        <div className="icao-tabs">
          <Tab id="ALL" label={`ALL (${icaos.length})`} />
          {icaos.map(icao => {
            const count = notamDataStore[icao]?.data?.length || 0;
            return (
              <Tab key={icao} id={icao} label={`${icao} (${count})`} onRemove={handleRemoveIcao} />
            );
          })}
        </div>
        <NotamTabContent 
          icao={activeTab} 
          notams={filteredNotams} 
          loading={activeNotamData.loading} 
          error={activeNotamData.error} 
          hasActiveFilters={hasActiveFilters} 
          onClearFilters={clearAllFilters} 
          filterOrder={filterOrder} 
          keywordHighlightEnabled={keywordHighlightEnabled} 
          keywordCategories={keywordCategories}
          firDataStore={firDataStore}
        />
      </div>

      <FilterModal 
        isOpen={isFilterModalOpen} 
        onClose={() => setIsFilterModalOpen(false)} 
        filters={filters} 
        onFilterChange={handleFilterChange} 
        typeCounts={typeCounts} 
        onClearAll={clearAllFilters} 
        filterOrder={filterOrder} 
        setFilterOrder={setFilterOrder} 
        dragState={dragState} 
        setDragState={setDragState} 
      />
      <NotamKeywordHighlightManager 
        isOpen={isHighlightModalOpen} 
        onClose={() => setIsHighlightModalOpen(false)} 
        keywordCategories={keywordCategories} 
        setKeywordCategories={setKeywordCategories} 
        keywordHighlightEnabled={keywordHighlightEnabled} 
        setKeywordHighlightEnabled={setKeywordHighlightEnabled} 
      />
      <ICAOSortingModal 
        isOpen={isSortModalOpen} 
        onClose={() => setIsSortModalOpen(false)} 
        icaos={icaos} 
        onReorder={handleIcaoReorder} 
      />
      <NotamHistoryModal 
        isOpen={isHistoryModalOpen} 
        onClose={() => setIsHistoryModalOpen(false)} 
        history={notamHistory} 
        onClearHistory={() => setNotamHistory([])}
      />
    </div>
  );
};

const ModernHeader = ({ 
    timeToNextRefresh, 
    onRefresh, 
    onHistoryClick, 
    activeTab, 
    autoRefreshAll, 
    currentlyFetching, 
    fetchProgress,
    isQueueProcessing 
}) => {
    const [utcTime, setUtcTime] = useState('');
    const [mounted, setMounted] = useState(false);
    
    useEffect(() => {
        setMounted(true);
        const tick = () => {
            const now = new Date();
            setUtcTime(now.toUTCString().slice(5, -4) + ' UTC');
        };
        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, []);

    const minutes = Math.floor(timeToNextRefresh / 60000);
    const seconds = Math.floor((timeToNextRefresh % 60000) / 1000).toString().padStart(2, '0');

    const buttonText = activeTab === 'ALL' ? 'Refresh All' : `Refresh ${activeTab}`;
    const buttonTitle = activeTab === 'ALL' 
        ? 'Fetch latest NOTAMs for all airports' 
        : `Fetch latest NOTAMs for ${activeTab}`;

    const progressPercentage = fetchProgress.total > 0 
        ? (fetchProgress.current / fetchProgress.total) * 100 
        : 0;
        
    const isRefreshing = isQueueProcessing || currentlyFetching;

    return (
        <header className={`modern-header ${mounted ? 'mounted' : ''}`}>
            <div className="header-main-content">
                <h1>NOTAM Console</h1>
                <div className="header-meta">
                    <p className="utc-time">{utcTime}</p>
                    <div className="global-refresh" title={`Next auto-refresh in ${minutes}:${seconds}`}>
                        <span className="global-countdown" onClick={autoRefreshAll} title="Click to refresh all now">
                            Next update in {minutes}:{seconds}
                        </span>
                    </div>
                </div>
            </div>
            <div className="header-actions">
                <button onClick={onHistoryClick} className="header-action-btn history-btn" title="View New NOTAM History">
                    <span className="btn-icon">📜</span>
                    <span>History</span>
                </button>
                <button 
                    onClick={onRefresh} 
                    className={`header-action-btn refresh-btn ${isRefreshing ? 'refreshing' : ''}`}
                    title={buttonTitle}
                    disabled={isRefreshing}
                >
                    {isRefreshing ? (
                        <>
                            <span className="btn-spinner"></span>
                            <span>Refreshing...</span>
                        </>
                    ) : (
                        <>
                            <span className="btn-icon">🔄</span>
                            <span>{buttonText}</span>
                        </>
                    )}
                </button>
            </div>
            
            {isRefreshing && (
                <div className="fetch-progress-bar">
                    <div className="fetch-progress-track">
                        <div 
                            className="fetch-progress-fill" 
                            style={{ width: `${progressPercentage}%` }}
                        />
                    </div>
                    <span className="fetch-progress-text">
                        {currentlyFetching} {fetchProgress.total > 1 && `(${fetchProgress.current}/${fetchProgress.total})`}
                    </span>
                </div>
            )}
        </header>
    );
};

export default App;