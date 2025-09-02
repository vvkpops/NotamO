import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import NotamTabContent from './NotamTabContent';
import { getNotamType, isNotamCurrent, isNotamFuture } from './NotamUtils';
import { FilterModal } from './NotamTabContent';
import NotamKeywordHighlightManager, { DEFAULT_NOTAM_KEYWORDS } from './NotamKeywordHighlight.jsx';

const App = () => {
  // State Management
  const [icaos, setIcaos] = useState(() => JSON.parse(localStorage.getItem("notamIcaos") || "[]"));
  const [activeTab, setActiveTab] = useState('ALL');
  const [notamDataStore, setNotamDataStore] = useState({});
  const [isAdding, setIsAdding] = useState(false);

  // Filter states moved from NotamTabContent
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

  // Save keyword highlighting settings to localStorage
  useEffect(() => {
    localStorage.setItem('notamKeywordHighlightEnabled', JSON.stringify(keywordHighlightEnabled));
  }, [keywordHighlightEnabled]);

  useEffect(() => {
    localStorage.setItem('notamKeywordCategories', JSON.stringify(keywordCategories));
  }, [keywordCategories]);

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
      
      setNotamDataStore(prev => ({ 
        ...prev, 
        [icao]: { 
          data: data.map(n => ({...n, icao})), 
          loading: false, 
          error: null 
        } 
      }));
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

  useEffect(() => {
    icaos.forEach(icao => {
      if (!notamDataStore[icao]) {
        fetchNotams(icao);
      }
    });
  }, [icaos, notamDataStore, fetchNotams]);

  useEffect(() => {
    localStorage.setItem("notamIcaos", JSON.stringify(icaos));
    if (!icaos.includes(activeTab) && activeTab !== 'ALL') {
      setActiveTab(icaos.length > 0 ? icaos[0] : 'ALL');
    }
  }, [icaos, activeTab]);
  
  const handleAddIcao = useCallback(async () => {
    if (!icaoInputRef.current || isAdding) return;
    
    const input = icaoInputRef.current.value.toUpperCase().trim();
    const newIcaoInputs = input.split(/[,\s]+/)
      .map(s => s.trim())
      .filter(s => s.length === 4 && /^[A-Z0-9]{4}$/.test(s));
    
    if (newIcaoInputs.length === 0) {
      icaoInputRef.current.style.animation = 'shake 0.5s ease-in-out';
      setTimeout(() => {
        if (icaoInputRef.current) {
          icaoInputRef.current.style.animation = '';
        }
      }, 500);
      return;
    }

    setIsAdding(true);
    
    const addedIcaos = newIcaoInputs.filter(icao => !icaos.includes(icao));
    
    if (addedIcaos.length > 0) {
      setIcaos(prev => [...prev, ...addedIcaos]);
      setActiveTab(addedIcaos[0]);
      
      icaoInputRef.current.classList.add('success-flash');
      setTimeout(() => {
        if (icaoInputRef.current) {
          icaoInputRef.current.classList.remove('success-flash');
        }
      }, 500);
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

  const handleIcaoInputKeyPress = (e) => {
    if (e.key === "Enter") {
      handleAddIcao();
    }
  };

  const allNotamsData = useMemo(() => {
    let combined = [];
    let isLoading = false;
    let anyError = null;

    const sortedIcaos = [...icaos].sort();

    sortedIcaos.forEach(icao => {
      const storeEntry = notamDataStore[icao];
      if (storeEntry) {
        if (storeEntry.loading) isLoading = true;
        if (storeEntry.error) anyError = anyError || storeEntry.error;
        if (storeEntry.data && storeEntry.data.length > 0) {
          combined.push({ isIcaoHeader: true, icao: icao, id: `header-${icao}` });
          combined = combined.concat(storeEntry.data);
        }
      } else {
        isLoading = true;
      }
    });
    
    return { data: combined, loading: isLoading, error: anyError };
  }, [notamDataStore, icaos]);

  const activeNotamData = activeTab === 'ALL' 
    ? allNotamsData 
    : notamDataStore[activeTab] || { data: [], loading: true, error: null };

  // Filter logic moved from NotamTabContent
  const { filteredNotams, typeCounts, hasActiveFilters, activeFilterCount } = useMemo(() => {
    const notams = activeNotamData.data;
    if (!notams) return { filteredNotams: [], typeCounts: {}, hasActiveFilters: false, activeFilterCount: 0 };
    
    const counts = {
      rwy: 0, twy: 0, rsc: 0, crfi: 0, ils: 0,
      fuel: 0, other: 0, cancelled: 0, current: 0, future: 0
    };

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
      const text = (notam.summary || '').toLowerCase();

      if (keywordFilter && !text.includes(keywordFilter.toLowerCase())) return false;
      if (!filters.current && isNotamCurrent(notam)) return false;
      if (!filters.future && isNotamFuture(notam)) return false;
      if (filters[type] === false) return false;

      return true;
    });

    results.sort((a, b) => {
      if (a.isIcaoHeader && b.isIcaoHeader) return 0;
      if (a.isIcaoHeader) return -1;
      if (b.isIcaoHeader) return 1;

      const aType = getNotamType(a);
      const bType = getNotamType(b);
      const aPriority = filterOrder.indexOf(aType);
      const bPriority = filterOrder.indexOf(bType);
      
      if (aPriority === bPriority) {
        const aDate = new Date(a.validFrom);
        const bDate = new Date(b.validFrom);
        return bDate - aDate;
      }
      
      return aPriority - bPriority;
    });

    if (activeTab === 'ALL') {
      const finalResult = [];
      for (let i = 0; i < results.length; i++) {
        if (results[i].isIcaoHeader) {
          if (i + 1 >= results.length || results[i+1].isIcaoHeader) {
            continue; 
          }
        }
        finalResult.push(results[i]);
      }
      results = finalResult;
    }
    
    const defaultFilters = {
      rwy: true, twy: true, rsc: true, crfi: true, ils: true,
      fuel: true, other: true, cancelled: false, current: true, future: true,
    };

    const hasFilters = keywordFilter || Object.keys(filters).some(key => filters[key] !== defaultFilters[key]);
    const filterCount = Object.keys(filters).filter(key => filters[key] !== defaultFilters[key]).length + (keywordFilter ? 1 : 0);

    return { 
      filteredNotams: results, 
      typeCounts: counts,
      hasActiveFilters: hasFilters,
      activeFilterCount: filterCount
    };
  }, [activeNotamData.data, keywordFilter, filters, activeTab, filterOrder]);

  const handleFilterChange = (filterKey) => {
    setFilters(prev => ({ ...prev, [filterKey]: !prev[filterKey] }));
  };

  const clearAllFilters = () => {
    setFilters({
      rwy: true, twy: true, rsc: true, crfi: true, ils: true,
      fuel: true, other: true, cancelled: false, current: true, future: true,
    });
    setKeywordFilter('');
  };

  const Tab = ({ id, label, onRemove }) => (
    <div 
      className={`icao-tab ${activeTab === id ? 'active' : ''}`} 
      onClick={() => setActiveTab(id)}
    >
      <span>{label}</span>
      {onRemove && (
        <button 
          onClick={(e) => { 
            e.stopPropagation(); 
            onRemove(id); 
          }} 
          className="remove-btn"
          title={`Remove ${id}`}
        >
          ×
        </button>
      )}
    </div>
  );

  return (
    <div className="container">
      <ModernHeader />
      
      <div className="glass icao-input-container">
        <div className="top-controls">
          <div className="icao-input-wrapper">
            <input 
              ref={icaoInputRef} 
              placeholder="ICAO codes (e.g., CYYT, KJFK)" 
              className="icao-input compact" 
              onKeyPress={handleIcaoInputKeyPress}
              disabled={isAdding}
            />
            <button 
              onClick={handleAddIcao} 
              className={`add-button ${isAdding ? 'loading' : ''}`}
              disabled={isAdding}
            >
              {isAdding ? (
                <>
                  <span className="loading-spinner"></span>
                  Adding...
                </>
              ) : (
                'Add ICAO'
              )}
            </button>
          </div>
          
          <div className="filter-controls">
            <button 
              className="filter-toggle-btn"
              onClick={() => setIsFilterModalOpen(true)}
            >
              <span className="filter-icon">🎯</span>
              <span className="filter-text">FILTER</span>
              {activeFilterCount > 0 && (
                <span className="filter-badge">{activeFilterCount}</span>
              )}
            </button>
            
            <button 
              className="filter-toggle-btn"
              onClick={() => setIsHighlightModalOpen(true)}
              style={{
                background: keywordHighlightEnabled 
                  ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                  : 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)'
              }}
            >
              <span className="filter-icon">🎯</span>
              <span className="filter-text">HIGHLIGHT</span>
              {keywordHighlightEnabled && (
                <span className="filter-badge">ON</span>
              )}
            </button>
          </div>
        </div>

        <div className="bottom-controls">
          <div className="search-input-wrapper">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Filter current results by keyword..."
              className="search-input"
              value={keywordFilter}
              onChange={(e) => setKeywordFilter(e.target.value)}
            />
            {keywordFilter && (
              <button 
                className="clear-search-btn"
                onClick={() => setKeywordFilter('')}
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>
          {hasActiveFilters && (
            <button className="quick-clear-btn" onClick={clearAllFilters}>
              Clear All Filters
            </button>
          )}
        </div>
      </div>
      
      <div className="glass">
        <div className="icao-tabs">
          <Tab id="ALL" label={`ALL (${icaos.length})`} />
          {icaos.map(icao => {
            const count = notamDataStore[icao]?.data?.length || 0;
            return (
              <Tab 
                key={icao} 
                id={icao} 
                label={`${icao} (${count})`} 
                onRemove={handleRemoveIcao} 
              />
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
      setUtcTime(timeString);
    };
    
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className={`modern-header ${mounted ? 'mounted' : ''}`}>
      <h1>NOTAM Console</h1>
      <p>{utcTime} UTC</p>
      <div className="header-decoration">
        <div className="decoration-line"></div>
        <div className="decoration-dot"></div>
        <div className="decoration-line"></div>
      </div>
    </header>
  );
};

export default App;
