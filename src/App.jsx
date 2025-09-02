import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import NotamTabContent from './NotamTabContent';
import { getNotamType, isNotamCurrent, isNotamFuture } from './NotamUtils';
import { FilterModal } from './NotamTabContent';
import NotamKeywordHighlightManager, { DEFAULT_NOTAM_KEYWORDS } from './NotamKeywordHighlight.jsx';

const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

const App = () => {
  // State Management
  const [icaos, setIcaos] = useState(() => JSON.parse(localStorage.getItem("notamIcaos") || "[]"));
  const [activeTab, setActiveTab] = useState('ALL');
  const [notamDataStore, setNotamDataStore] = useState({});
  const [isAdding, setIsAdding] = useState(false);
  const [cardSize, setCardSize] = useState(() => {
    const saved = localStorage.getItem('notamCardSize');
    return saved ? JSON.parse(saved) : 420; // Default size
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
    const saved = localStorage.getItem('notamKeywordHighlightEnabled');
    return saved ? JSON.parse(saved) : true;
  });
  const [keywordCategories, setKeywordCategories] = useState(() => {
    const saved = localStorage.getItem('notamKeywordCategories');
    return saved ? JSON.parse(saved) : DEFAULT_NOTAM_KEYWORDS;
  });
  const [isHighlightModalOpen, setIsHighlightModalOpen] = useState(false);

  // FIX 1: Use useRef to avoid stale state in callbacks
  const icaosRef = useRef([]);
  const isProcessingQueue = useRef(false);
  const queueTimerRef = useRef(null);
  const icaoInputRef = useRef(null);

  // Update ref whenever icaos changes
  useEffect(() => {
    icaosRef.current = icaos;
  }, [icaos]);

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('notamKeywordHighlightEnabled', JSON.stringify(keywordHighlightEnabled));
  }, [keywordHighlightEnabled]);

  useEffect(() => {
    localStorage.setItem('notamKeywordCategories', JSON.stringify(keywordCategories));
  }, [keywordCategories]);
  
  useEffect(() => {
    localStorage.setItem('notamCardSize', JSON.stringify(cardSize));
  }, [cardSize]);

  // FIX 2: Improved NOTAM signature-based detection
  const createNotamSignature = (notam) => {
    // Create a more robust signature using multiple fields
    const summary = (notam.summary || '').replace(/\s+/g, ' ').trim();
    const rawText = (notam.rawText || '').replace(/\s+/g, ' ').trim();
    const text = summary || rawText;
    
    return `${notam.number || 'unknown'}-${notam.validFrom || 'unknown'}-${text.slice(0, 100)}`;
  };

  const detectNewNotams = (oldData, newData, isInitialFetch) => {
    if (isInitialFetch || oldData.length === 0) {
      return { processedData: newData.map(n => ({ ...n, isNew: false })), hasNewNotams: false };
    }

    // Create signatures for old NOTAMs
    const oldNotamSignatures = new Set(oldData.map(createNotamSignature));
    
    let hasNewNotams = false;
    const processedData = newData.map(notam => {
      const signature = createNotamSignature(notam);
      const isNew = !oldNotamSignatures.has(signature);
      
      if (isNew) {
        hasNewNotams = true;
        console.log(`🆕 New NOTAM detected: ${notam.number} - ${signature.slice(0, 50)}...`);
      }
      
      return { ...notam, isNew };
    });

    return { processedData, hasNewNotams };
  };

  // FIX 3: Enhanced fetchNotams with better error handling
  const fetchNotams = useCallback(async (icao) => {
    console.log(`🚀 Fetching NOTAMs for ${icao}`);
    
    setNotamDataStore(prev => ({ 
      ...prev, 
      [icao]: { ...prev[icao], loading: true, error: null } 
    }));
    
    try {
      const response = await fetch(`/api/notams?icao=${icao}`);
      const data = await response.json();
      
      if (!response.ok || data.error) {
        throw new Error(data.error || `Failed to fetch NOTAMs for ${icao}`);
      }
      
      setNotamDataStore(prev => {
        const oldData = prev[icao]?.data || [];
        const isInitialFetch = oldData.length === 0;
        
        // Use improved detection logic
        const { processedData, hasNewNotams } = detectNewNotams(oldData, data, isInitialFetch);
        
        // Add ICAO to each NOTAM for consistency
        const notamsWithIcao = processedData.map(n => ({ ...n, icao }));

        // Update new NOTAM indicators
        if (hasNewNotams) {
          console.log(`🆕 Found new NOTAMs for ${icao}`);
          setNewNotamIcaos(prevSet => new Set(prevSet).add(icao));
        }

        return { 
          ...prev, 
          [icao]: { 
            data: notamsWithIcao, 
            loading: false, 
            error: null,
            lastUpdated: Date.now() // Track when last updated
          } 
        };
      });
      
      console.log(`✅ Successfully fetched ${data.length} NOTAMs for ${icao}`);
      
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
  }, []);

  // FIX 4: Stable handleRefreshAll using ref
  const handleRefreshAll = useCallback(() => {
    const currentIcaos = icaosRef.current; // Use ref instead of state
    
    if (currentIcaos.length > 0) {
      console.log(`🔄 Auto-refresh triggered for all ICAOs: ${currentIcaos.join(', ')}`);
      
      setFetchQueue(prevQueue => {
        // Deduplicate and add all current ICAOs
        const newQueue = [...new Set([...prevQueue, ...currentIcaos])];
        console.log(`📋 Queue updated: ${newQueue.join(', ')}`);
        return newQueue;
      });
    } else {
      console.log('⚠️  No ICAOs to refresh');
    }
  }, []); // Truly stable - no dependencies

  // FIX 5: Robust queue processing with overflow protection
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

        // Protect against queue overflow
        if (currentQueue.length > 10) {
          console.warn(`⚠️  Queue is large (${currentQueue.length} items), this may take a while`);
        }

        isProcessingQueue.current = true;
        const icaoToFetch = currentQueue[0];
        
        console.log(`🔄 Processing queue item: ${icaoToFetch} (${currentQueue.length - 1} remaining)`);
        
        fetchNotams(icaoToFetch).finally(() => {
          // Use consistent delay between requests to avoid API rate limits
          queueTimerRef.current = setTimeout(() => {
            isProcessingQueue.current = false;
            processQueueRef.current(); // Process next item
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

  // FIX 6: Stable timer with proper cleanup and no restart loops
  useEffect(() => {
    console.log('🕐 Starting auto-refresh timer');
    
    const timer = setInterval(() => {
      setTimeToNextRefresh(prevTime => {
        const newTime = prevTime - 1000;
        
        if (newTime <= 0) {
          console.log('⏰ Auto-refresh timer expired, triggering refresh');
          handleRefreshAll();
          return AUTO_REFRESH_INTERVAL; // Reset timer
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
  }, []); // No dependencies = no restarts!

  useEffect(() => {
    localStorage.setItem("notamIcaos", JSON.stringify(icaos));
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
    // Also remove from new NOTAM indicators
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

  // FIX 7: Enhanced tab click with proper new NOTAM clearing
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
    }
  };

  // FIX 8: Debug utilities for monitoring system health
  const getSystemHealth = () => {
    const queueLength = fetchQueue.length;
    const isProcessing = isProcessingQueue.current;
    const totalIcaos = icaos.length;
    const loadingIcaos = icaos.filter(icao => notamDataStore[icao]?.loading).length;
    const errorIcaos = icaos.filter(icao => notamDataStore[icao]?.error).length;
    const newNotamCount = newNotamIcaos.size;
    
    return {
      queueLength,
      isProcessing,
      totalIcaos,
      loadingIcaos,
      errorIcaos,
      newNotamCount,
      nextRefresh: Math.ceil(timeToNextRefresh / 1000)
    };
  };

  // Log system health periodically (only in development)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const healthCheck = setInterval(() => {
        const health = getSystemHealth();
        console.log('🏥 System Health:', health);
      }, 30000); // Every 30 seconds
      
      return () => clearInterval(healthCheck);
    }
  }, [timeToNextRefresh, fetchQueue, icaos, notamDataStore, newNotamIcaos]);

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
