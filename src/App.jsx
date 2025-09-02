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
  const isProcessingQueue = useRef(false);
  const queueTimerRef = useRef(null);
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

  const icaoInputRef = useRef(null);

  const fetchNotams = useCallback(async (icao) => {
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
        const oldNotamIds = new Set(oldData.map(n => n.id));
        let hasNewNotams = false;

        const newData = data.map(n => {
          const isNew = !isInitialFetch && !oldNotamIds.has(n.id);
          if (isNew) hasNewNotams = true;
          return { ...n, icao, isNew };
        });

        if (hasNewNotams) {
          setNewNotamIcaos(prevSet => new Set(prevSet).add(icao));
        }

        return { 
          ...prev, 
          [icao]: { 
            data: newData, 
            loading: false, 
            error: null 
          } 
        };
      });
    } catch (err) {
      setNotamDataStore(prev => ({ 
        ...prev, 
        [icao]: { 
          ...prev[icao], 
          loading: false, 
          error: err.message 
        } 
      }));
    }
  }, []);

  // --- Queue Processing Logic ---
  const processQueueRef = useRef();

  useEffect(() => {
    processQueueRef.current = () => {
      if (isProcessingQueue.current) return;

      setFetchQueue(currentQueue => {
        if (currentQueue.length === 0) {
          isProcessingQueue.current = false;
          return currentQueue;
        }

        isProcessingQueue.current = true;
        const icaoToFetch = currentQueue[0];
        
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
      if (queueTimerRef.current) clearTimeout(queueTimerRef.current);
    };
  }, [fetchQueue]);

  // --- Global Auto-Refresh and Countdown Timer ---
  useEffect(() => {
    // This timer handles the countdown display
    const countdownTimer = setInterval(() => {
      setTimeToNextRefresh(prevTime => (prevTime > 0 ? prevTime - 1000 : 0));
    }, 1000);

    // This timer triggers the actual refresh
    const autoRefreshTimer = setInterval(() => {
      // Use a function to get the latest `icaos` state without depending on it
      setIcaos(currentIcaos => {
        if (currentIcaos.length > 0) {
          console.log(`Auto-refreshing all ICAOs: ${currentIcaos.join(', ')}`);
          setFetchQueue(prevQueue => [...new Set([...prevQueue, ...currentIcaos])]);
        }
        return currentIcaos; // Return state unchanged
      });
      // Reset the countdown
      setTimeToNextRefresh(AUTO_REFRESH_INTERVAL);
    }, AUTO_REFRESH_INTERVAL);

    // Initial fetch for existing ICAOs
    const icaosToFetch = icaos.filter(icao => !notamDataStore[icao] && !fetchQueue.includes(icao));
    if (icaosToFetch.length > 0) {
      setFetchQueue(prev => [...new Set([...prev, ...icaosToFetch])]);
    }

    return () => {
      clearInterval(countdownTimer);
      clearInterval(autoRefreshTimer);
    };
  }, []); // Empty dependency array ensures this runs only once

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
    setNotamDataStore(prev => {
      const newStore = {...prev};
      delete newStore[icaoToRemove];
      return newStore;
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
      const type = getNotamType(notam);
      counts[type]++;
      if (isNotamCurrent(notam)) counts.current++;
      if (isNotamFuture(notam)) counts.future++;
    });
    
    let results = notams.filter(notam => {
      if (notam.isIcaoHeader) return true;
      const type = getNotamType(notam);
      if (keywordFilter && !(notam.summary || '').toLowerCase().includes(keywordFilter.toLowerCase())) return false;
      if (filters[type] === false) return false;
      if (!filters.current && isNotamCurrent(notam)) return false;
      if (!filters.future && isNotamFuture(notam)) return false;
      return true;
    });

    results.sort((a, b) => {
      if (a.isIcaoHeader) return -1; if (b.isIcaoHeader) return 1;
      const aPrio = filterOrder.indexOf(getNotamType(a)), bPrio = filterOrder.indexOf(getNotamType(b));
      if (aPrio !== bPrio) return aPrio - bPrio;
      return new Date(b.validFrom) - new Date(a.validFrom);
    });

    if (activeTab === 'ALL') {
      results = results.filter((item, i, arr) => !item.isIcaoHeader || (i + 1 < arr.length && !arr[i+1].isIcaoHeader));
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

  const handleTabClick = (id) => {
    setActiveTab(id);
    if (newNotamIcaos.has(id)) {
      setNewNotamIcaos(prevSet => { const newSet = new Set(prevSet); newSet.delete(id); return newSet; });
    }
  };

  const Tab = ({ id, label, onRemove, onRefresh, timeToRefresh }) => {
    const isLoading = fetchQueue.includes(id) || notamDataStore[id]?.loading;
    const hasNew = newNotamIcaos.has(id);
    const minutes = Math.floor(timeToRefresh / 60000);
    const seconds = Math.floor((timeToRefresh % 60000) / 1000).toString().padStart(2, '0');
    
    return (
      <div className={`icao-tab ${activeTab === id ? 'active' : ''} ${hasNew ? 'has-new-notams' : ''}`} onClick={() => handleTabClick(id)}>
        <span>{label}</span>
        {isLoading && <span className="loading-spinner tab-spinner"></span>}
        <div className="tab-actions">
          {onRefresh && !isLoading && (
            <>
              <span className="countdown-timer" title={`Next auto-refresh in ${minutes}:${seconds}`}>{minutes}:{seconds}</span>
              <button onClick={(e) => { e.stopPropagation(); onRefresh(id); }} className="refresh-btn" title={`Refresh ${id}`}>🔄</button>
            </>
          )}
          {onRemove && !isLoading && (
            <button onClick={(e) => { e.stopPropagation(); onRemove(id); }} className="remove-btn" title={`Remove ${id}`}>×</button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="container" style={{ '--notam-card-size': `${cardSize}px` }}>
      <ModernHeader />
      
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
              <Tab key={icao} id={icao} label={isLoading ? `${icao}` : `${icao} (${count})`} onRemove={handleRemoveIcao} onRefresh={handleRefreshIcao} timeToRefresh={timeToNextRefresh} />
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

const ModernHeader = () => {
  const [utcTime, setUtcTime] = useState('');
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
    const tick = () => {
      const now = new Date();
      const timeString = now.toUTCString().slice(5, -4);
      setUtcTime(timeString + ' UTC');
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className={`modern-header ${mounted ? 'mounted' : ''}`}>
      <h1>NOTAM Console</h1>
      <p>{utcTime}</p>
    </header>
  );
};

export default App;
