import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import NotamTabContent, { FilterModal } from './NotamTabContent';
import { getNotamType, isNotamCurrent, isNotamFuture } from './NotamUtils';
import NotamKeywordHighlightManager, { DEFAULT_NOTAM_KEYWORDS } from './NotamKeywordHighlight.jsx';
import ICAOSortingModal from './ICAOSortingModal.jsx';
import NotamHistoryModal from './NotamHistoryModal.jsx';
import { useAutoResponsiveSize, useResponsiveCSS } from './useAutoResponsiveSize.jsx';

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

  // ENHANCED AUTO-RESPONSIVE SIZING SYSTEM FOR WIDE SCREENS
  const {
    cardSize,
    isAutoMode,
    enableAutoMode,
    setManualCardSize,
    toggleAutoMode,
    shouldHideCardSizer,
    isSmallScreen,
    isMobileLayout,
    isWideScreen,
    isUltraWide,
    breakpoint,
    columnsTarget,
    utilization,
    canShowMoreInfo,
    shouldUseCompactLayout,
    optimalGap,
    efficiencyScore,
    _debug
  } = useAutoResponsiveSize(420);

  // Apply enhanced CSS custom properties for wide screens
  useResponsiveCSS(cardSize, breakpoint, columnsTarget, utilization);

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

  // Enhanced card size management for wide screens
  const [manualCardSizeOverride, setManualCardSizeOverride] = useState(null);
  const effectiveCardSize = isAutoMode ? cardSize : (manualCardSizeOverride || cardSize);

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

  // Enhanced logging for wide-screen responsive changes
  useEffect(() => {
    if (isWideScreen) {
      console.log(`🖥️ Wide-Screen Layout Active:`, {
        breakpoint,
        cardSize: `${cardSize}px`,
        columns: columnsTarget,
        efficiency: `${efficiencyScore}%`,
        ultraWide: isUltraWide,
        gap: `${optimalGap}rem`
      });
    }
  }, [breakpoint, cardSize, columnsTarget, isWideScreen, isUltraWide, efficiencyScore, optimalGap]);

  // Enhanced card size handler for wide screens
  const handleCardSizeChange = useCallback((newSize) => {
    const size = parseInt(newSize);
    if (isAutoMode) {
      setManualCardSize(size);
      setManualCardSizeOverride(size);
    } else {
      setManualCardSizeOverride(size);
      setManualCardSize(size);
    }
  }, [isAutoMode, setManualCardSize]);

  // Toggle auto/manual sizing mode with wide-screen awareness
  const handleToggleAutoMode = useCallback(() => {
    if (isAutoMode) {
      setManualCardSizeOverride(cardSize);
      setManualCardSize(cardSize);
      console.log(`🎛️ Switched to manual mode with ${cardSize}px cards (${breakpoint})`);
    } else {
      setManualCardSizeOverride(null);
      enableAutoMode();
      console.log(`🤖 Switched to auto mode for ${breakpoint} screen`);
    }
  }, [isAutoMode, cardSize, setManualCardSize, enableAutoMode, breakpoint]);

  // Save manual size to localStorage with wide-screen context
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

  // Load saved preferences with wide-screen considerations
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

  // Enhanced Card Sizer Control with wide-screen features
  const CardSizerControl = () => {
    if (shouldHideCardSizer) return null;
    
    return (
      <div className={`card-sizer-control ${isWideScreen ? 'wide-screen' : ''}`}>
        <span className="sizer-icon" title={`Layout efficiency: ${efficiencyScore}%`}>
          {isUltraWide ? '🖥️' : isWideScreen ? '💻' : '📱'}
        </span>
        <button 
          className={`auto-toggle-btn ${isAutoMode ? 'auto-enabled' : 'manual-enabled'}`}
          onClick={handleToggleAutoMode}
          title={isAutoMode ? 
            `Auto mode: ${columnsTarget} cols, ${efficiencyScore}% efficient` : 
            'Switch to automatic sizing'}
        >
          {isAutoMode ? 'AUTO' : 'MANUAL'}
        </button>
        {!isAutoMode && (
          <>
            <input 
              type="range" 
              min="280" 
              max={isUltraWide ? "700" : "600"} 
              step="10" 
              value={effectiveCardSize} 
              onChange={(e) => handleCardSizeChange(e.target.value)} 
              className="card-size-slider" 
              title={`Card width: ${effectiveCardSize}px`} 
            />
            <span className="sizer-value manual-size">{effectiveCardSize}px</span>
          </>
        )}
        {isAutoMode && (
          <span className="sizer-value auto-info" title={`${columnsTarget} columns, ${efficiencyScore}% screen utilization`}>
            {cardSize}px
            {canShowMoreInfo && (
              <span className="efficiency-indicator"> • {efficiencyScore}%</span>
            )}
          </span>
        )}
      </div>
    );
  };

  // Handle ICAO reordering with wide-screen optimization
  const handleIcaoReorder = useCallback((newOrder) => {
    setIcaos(newOrder);
    localStorage.setItem("notamIcaos", JSON.stringify(newOrder));
    localStorage.setItem('icaoCustomOrder', JSON.stringify(newOrder));
    console.log(`🔄 ICAO order updated for ${breakpoint} layout:`, newOrder);
  }, [breakpoint]);

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
      const limitedHistory = notamHistory.slice(0, 100);
      localStorage.setItem('notamHistory', JSON.stringify(limitedHistory));
    } catch (error) {
      console.warn('Failed to save NOTAM history:', error);
    }
  }, [notamHistory]);

  // Enhanced NOTAM signature generation
  const createNotamSignature = useCallback((notam) => {
    const number = notam.number || 'unknown';
    const validFrom = notam.validFrom || 'unknown';
    const validTo = notam.validTo || 'unknown';
    const source = notam.source || 'unknown';
    
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

    const oldNotamMap = new Map();
    const oldSignatures = new Set();
    
    oldData.forEach(notam => {
      const signature = createNotamSignature(notam);
      oldNotamMap.set(signature, notam);
      oldSignatures.add(signature);
    });

    const newNotamMap = new Map();
    const newSignatures = new Set();
    
    newData.forEach(notam => {
      const signature = createNotamSignature(notam);
      newNotamMap.set(signature, notam);
      newSignatures.add(signature);
    });

    const genuinelyNewSignatures = [...newSignatures].filter(sig => !oldSignatures.has(sig));
    const expiredSignatures = [...oldSignatures].filter(sig => !newSignatures.has(sig));
    const existingSignatures = [...newSignatures].filter(sig => oldSignatures.has(sig));

    console.log(`🔄 NOTAM Analysis (${breakpoint}):`, {
      total: newData.length,
      new: genuinelyNewSignatures.length,
      expired: expiredSignatures.length,
      existing: existingSignatures.length,
      efficiency: `${efficiencyScore}%`
    });

    const mergedNotams = [];
    const newNotamsList = [];
    let hasNewNotams = false;

    existingSignatures.forEach(signature => {
      const existingNotam = oldNotamMap.get(signature);
      const updatedNotam = newNotamMap.get(signature);
      
      mergedNotams.push({
        ...updatedNotam,
        isNew: existingNotam.isNew,
        userViewed: existingNotam.userViewed,
        firstSeenAt: existingNotam.firstSeenAt,
      });
    });

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

    if (expiredSignatures.length > 0) {
      console.log(`🗑️ Expired NOTAMs removed: ${expiredSignatures.length}`);
    }

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
  }, [createNotamSignature, breakpoint, efficiencyScore]);

  // Rest of the component logic remains the same but with enhanced logging...
  const handleRefreshIcao = useCallback((icaoToRefresh) => {
    if (fetchQueue.includes(icaoToRefresh)) return;
    setFetchQueue(prev => [...prev, icaoToRefresh]);
  }, [fetchQueue]);

  // fetchNotams with enhanced wide-screen logging
  const fetchNotams = useCallback(async (icao) => {
    console.log(`🚀 Fetching NOTAMs for ${icao} (${breakpoint} layout)`);
    
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
        
        const { processedData, hasNewNotams, newNotamsList, stats } = smartNotamMerge(oldData, data, isInitialFetch);
        
        const notamsWithIcao = processedData.map(n => ({ ...n, icao }));

        if (hasNewNotams) {
          console.log(`🆕 Found ${stats.new} new NOTAMs for ${icao} (displaying in ${columnsTarget} columns)`);
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

        return { 
          ...prev, 
          [icao]: { 
            data: notamsWithIcao, 
            loading: false, 
            error: null,
            lastUpdated: Date.now(),
            stats: stats
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
    }
  }, [smartNotamMerge, breakpoint, columnsTarget]);

  // Continue with the rest of the methods... (same as original but with enhanced logging)

  // Clear new status when user views NOTAMs
  const markNotamsAsViewed = useCallback((icao) => {
    setNotamDataStore(prev => {
      if (!prev[icao]?.data) return prev;
      
      const updatedData = prev[icao].data.map(notam => ({
        ...notam,
        userViewed: true,
        isNew: false
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

  const handleRefreshAll = useCallback(() => {
    const currentIcaos = icaosRef.current;
    
    if (currentIcaos.length > 0) {
      console.log(`🔄 Auto-refresh triggered for all ICAOs (${breakpoint} layout): ${currentIcaos.join(', ')}`);
      
      setFetchQueue(prevQueue => {
        const newQueue = [...new Set([...prevQueue, ...currentIcaos])];
        console.log(`📋 Queue updated: ${newQueue.join(', ')}`);
        return newQueue;
      });
    } else {
      console.log('⚠️  No ICAOs to refresh');
    }
  }, [breakpoint]);

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
          return currentQueue;
        }

        if (currentQueue.length > 10) {
          console.warn(`⚠️  Queue is large (${currentQueue.length} items), this may take a while`);
        }

        isProcessingQueue.current = true;
        const icaoToFetch = currentQueue[0];
        
        console.log(`🔄 Processing queue item: ${icaoToFetch} (${currentQueue.length - 1} remaining)`);
        
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

  useEffect(() => {
    console.log(`🕐 Starting auto-refresh timer (${breakpoint} layout)`);
    
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
    
    const savedIcaos = JSON.parse(localStorage.getItem("notamIcaos") || "[]");
    if (savedIcaos.length > 0) {
      console.log(`🔄 Initial fetch for saved ICAOs (${breakpoint}): ${savedIcaos.join(', ')}`);
      setFetchQueue(prev => [...new Set([...prev, ...savedIcaos])]);
    }

    return () => {
      console.log('🛑 Cleaning up auto-refresh timer');
      clearInterval(timer);
      if (queueTimerRef.current) {
        clearTimeout(queueTimerRef.current);
      }
    };
  }, [handleRefreshAll, breakpoint]);

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
      return new Date(b.validFrom) - new Date(a.validFrom);
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
    return { filteredNotams: results, typ
