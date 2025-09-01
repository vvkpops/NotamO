import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './modern-styles.css'; // The new CSS file
import NotamTabContent from './NotamTabContent';

const App = () => {
  // State Management
  const [icaos, setIcaos] = useState(() => JSON.parse(localStorage.getItem("notamIcaos") || "[]"));
  const [activeTab, setActiveTab] = useState('ALL');
  const [notamDataStore, setNotamDataStore] = useState({});
  const [isAdding, setIsAdding] = useState(false);

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
      // Add shake animation for invalid input
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
      
      // Add success animation
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

  // Consolidate data for the "ALL" tab
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
        <div className="icao-input-wrapper">
          <input 
            ref={icaoInputRef} 
            placeholder="Enter ICAO codes (e.g., CYYT, KJFK, EGLL)" 
            className="icao-input" 
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
          notams={activeNotamData.data} 
          loading={activeNotamData.loading} 
          error={activeNotamData.error} 
        />
      </div>
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
