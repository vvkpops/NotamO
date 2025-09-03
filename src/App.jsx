import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import NotamTabContent from './NotamTabContent';
import { getNotamType, isNotamCurrent, isNotamFuture } from './NotamUtils';
import { FilterModal } from './NotamTabContent';
import NotamKeywordHighlightManager, { DEFAULT_NOTAM_KEYWORDS } from './NotamKeywordHighlight.jsx';
import ICAOSortingModal from './ICAOSortingModal.jsx';

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
  const [cardSize, setCardSize] = useState(() => {
    try {
      const saved = localStorage.getItem('notamCardSize');
      return saved ? JSON.parse(saved) : 420;
    } catch {
      return 420;
    }
  });

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

  // Use useRef to avoid stale state in callbacks
  const icaosRef = useRef([]);
  const isProcessingQueue = useRef(false);
  const queueTimerRef = useRef(null);
  const icaoInputRef = useRef(null);

  // Update ref whenever icaos changes
  useEffect(() => {
    icaosRef.current = icaos;
  }, [icaos]);

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
      localStorage.setItem('notamCardSize', JSON.stringify(cardSize));
    } catch (error) {
      console.warn('Failed to save card size:', error);
    }
  }, [cardSize]);

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
        hasNewNotams: false 
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
      
      mergedNotams.push({
        ...newNotam,
        isNew: true,
        userViewed: false,
        firstSeenAt: Date.now(),
      });
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
      stats: {
        new: genuinelyNewSignatures.length,
        expired: expiredSignatures.length,
        existing: existingSignatures.length,
        total: mergedNotams.length
      }
    };
  }, [createNotamSignature]);

  // fetchNotams with smart incremental updates
  const fetchNotams = useCallback(async (icao) => {
    console.log(`🚀 Fetching NOTAMs for ${icao}`);
    
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
        const { processedData, hasNewNotams, stats } = smartNotamMerge(oldData, data, isInitialFetch);
        
        // Add ICAO to each NOTAM for consistency
        const notamsWithIcao = processedData.map(n => ({ ...n, icao }));

        // Update new NOTAM indicators only if there are genuinely new NOTAMs
        if (hasNewNotams) {
          console.log(`🆕 Found ${stats.new} new NOTAMs for ${icao}`);
          setNewNotamIcaos(prevSet => new Set(prevSet).add(icao));
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
  }, [smartNotamMerge]);

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
      
      setFetchQueue(prevQueue => {
        const newQueue = [...new Set([...prevQueue, ...currentIcaos])];
        console.log(`📋 Queue updated: ${newQueue.join(', ')}`);
        return newQueue;
      });
    } else {
      console.log('⚠️  No ICAOs to refresh');
    }
  }, []);

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

  const handleRefreshIcao = useCallback((icaoToRefresh) => {
    if (fetchQueue.includes(icaoToRefresh)) return;
    setFetchQueue(prev => [...prev, icaoToRefresh]);
  }, [fetchQueue]);

  const handleIcaoInputKeyPress = (e) => {
    if (e.key === "Enter") handleAddIcao();
  };

  const allNotamsData = useMemo(() => {
    let combined = [];
    let isLoading = icaos.some(icao => notamDataStore[icao]?.loading || fetchQueue.includes(icao));
    let anyError = null;
    let hasAnyData = false;
    [...icaos].sort().forEach(icao => {
      const storeEntry = notamDataStore[icao];
      if (storeEntry) {
        if (storeEntry.error) anyError = anyError || storeEntry.error;
        if (storeEntry.data && storeEntry.data.length > 0) {
          hasAnyData = true;
          combined.push({ isIcaoHeader: true, icao: icao, id: `header-${icao}` });
          combined = combined.concat(storeEntry.data);
        }
      }
    });
    return { data: combined, loading: isLoading && !hasAnyData, error: anyError };
  }, [notamDataStore, icaos, fetchQueue]);

  const activeNotamData = useMemo(() => {
    if (activeTab === 'ALL') return allNotamsData;
    const storeEntry = notamDataStore[activeTab];
    const isLoading = storeEntry?.loading || fetchQueue.includes(activeTab);
    return { data: storeEntry?.data || [], loading: isLoading, error: storeEntry?.error || null };
  }, [activeTab, allNotamsData, notamDataStore, fetchQueue]);

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

  const Tab = ({ id, label, onRemove, onRefresh }) => {
    const isLoading = fetchQueue.includes(id) || notamDataStore[id]?.loading;
    const hasNew = newNotamIcaos.has(id);
    return (
      <div className={`icao-tab ${activeTab === id ? 'active' : ''} ${hasNew ? 'has-new-notams' : ''}`} onClick={() => handleTabClick(id)}>
        <span>{label}</span>
        {isLoading ? <span className="loading-spinner tab-spinner"></span> :
          <div className="tab-actions">
            {onRefresh && (
              <button onClick={(e) => { e.stopPropagation(); onRefresh(id); }} className="refresh-btn" title={`Refresh ${id}`}>🔄</button>
            )}
            {onRemove && (
              <button onClick={(e) => { e.stopPropagation(); onRemove(id); }} className="remove-btn" title={`Remove ${id}`}>×</button>
            )}
          </div>
        }
      </div>
    );
  };

  return (
    <div className="container" style={{ '--notam-card-size': `${cardSize}px` }}>
      <ModernHeader timeToNextRefresh={timeToNextRefresh} onRefreshAll={handleRefreshAll} />
      
      <div className="glass icao-input-container">
        <div className="top-controls">
          <div className="icao-input-wrapper">
            <input ref={icaoInputRef} placeholder="ICAO codes (e.g., CYYT, KJFK)" className="icao-input compact" onKeyPress={handleIcaoInputKeyPress} disabled={isAdding} />
            <button onClick={handleAddIcao} className={`add-button ${isAdding ? 'loading' : ''}`} disabled={isAdding}>
              {isAdding ? (<><span className="loading-spinner"></span>Adding...</>) : 'Add ICAO'}
            </button>
          </div>
          <div className="filter-controls">
            <button className="filter-toggle-btn" onClick={() => setIsFilterModalOpen(true)}>
              <span className="filter-icon">🎯</span><span className="filter-text">FILTER</span>
              {activeFilterCount > 0 && (<span className="filter-badge">{activeFilterCount}</span>)}
            </button>
            <button className="filter-toggle-btn" onClick={() => setIsHighlightModalOpen(true)} style={{background: keywordHighlightEnabled ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)'}}>
              <span className="filter-icon">💡</span><span className="filter-text">HIGHLIGHT</span>
              {keywordHighlightEnabled && (<span className="filter-badge">ON</span>)}
            </button>
            <button className="filter-toggle-btn" onClick={() => setIsSortModalOpen(true)} disabled={icaos.length === 0}>
              <span className="filter-icon">↕️</span><span className="filter-text">SORT</span>
            </button>
          </div>
        </div>
        <div className="bottom-controls">
          <div className="search-input-wrapper">
            <span className="search-icon">🔍</span>
            <input type="text" placeholder="Filter current results by keyword..." className="search-input" value={keywordFilter} onChange={(e) => setKeywordFilter(e.target.value)} />
            {keywordFilter && (<button className="clear-search-btn" onClick={() => setKeywordFilter('')} title="Clear search">✕</button>)}
          </div>
          <div className="card-sizer-control">
            <span className="sizer-icon">↔️</span>
            <input type="range" min="420" max="800" step="10" value={cardSize} onChange={(e) => setCardSize(e.target.value)} className="card-size-slider" title={`Adjust card width: ${cardSize}px`} />
            <span className="sizer-value">{cardSize}px</span>
          </div>
          {hasActiveFilters && (<button className="quick-clear-btn" onClick={clearAllFilters}>Clear All Filters</button>)}
        </div>
      </div>
      
      <div className="glass">
        <div className="icao-tabs">
          <Tab id="ALL" label={`ALL (${icaos.length})`} />
          {icaos.map(icao => {
            const count = notamDataStore[icao]?.data?.length || 0;
            const isLoading = fetchQueue.includes(icao) || notamDataStore[icao]?.loading;
            return (
              <Tab key={icao} id={icao} label={isLoading ? `${icao}` : `${icao} (${count})`} onRemove={handleRemoveIcao} onRefresh={handleRefreshIcao} />
            );
          })}
        </div>
        <NotamTabContent icao={activeTab} notams={filteredNotams} loading={activeNotamData.loading} error={activeNotamData.error} hasActiveFilters={hasActiveFilters} onClearFilters={clearAllFilters} filterOrder={filterOrder} keywordHighlightEnabled={keywordHighlightEnabled} keywordCategories={keywordCategories} />
      </div>

      <FilterModal isOpen={isFilterModalOpen} onClose={() => setIsFilterModalOpen(false)} filters={filters} onFilterChange={handleFilterChange} typeCounts={typeCounts} onClearAll={clearAllFilters} filterOrder={filterOrder} setFilterOrder={setFilterOrder} dragState={dragState} setDragState={setDragState} />
      <NotamKeywordHighlightManager isOpen={isHighlightModalOpen} onClose={() => setIsHighlightModalOpen(false)} keywordCategories={keywordCategories} setKeywordCategories={setKeywordCategories} keywordHighlightEnabled={keywordHighlightEnabled} setKeywordHighlightEnabled={setKeywordHighlightEnabled} />
      <ICAOSortingModal isOpen={isSortModalOpen} onClose={() => setIsSortModalOpen(false)} icaos={icaos} onReorder={handleIcaoReorder} />
    </div>
  );
};

const ModernHeader = ({ timeToNextRefresh, onRefreshAll }) => {
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

  return (
    <header className={`modern-header ${mounted ? 'mounted' : ''}`}>
      <h1>NOTAM Console</h1>
      <div className="header-meta">
        <div className="global-refresh" title={`Next auto-refresh in ${minutes}:${seconds}`}>
          <button onClick={onRefreshAll} className="refresh-all-btn">Refresh All</button>
          <span className="global-countdown">{minutes}:{seconds}</span>
        </div>
        <p className="utc-time">{utcTime}</p>
      </div>
    </header>
  );
};

export default App;
