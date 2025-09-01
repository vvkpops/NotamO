import React, { useState, useEffect, useRef, useCallback } from 'react';
import './index.css';
import NotamTabContent from './NotamTabContent';

// --- Main Application Component -----
const App = () => {
  // State Management
  const [icaos, setIcaos] = useState(() => JSON.parse(localStorage.getItem("notamIcaos") || "[]"));
  const [activeTab, setActiveTab] = useState('ALL');
  const [notamDataStore, setNotamDataStore] = useState({});

  const icaoInputRef = useRef(null);

  const fetchNotams = useCallback(async (icao) => {
    setNotamDataStore(prev => ({ ...prev, [icao]: { ...prev[icao], loading: true, error: null } }));
    try {
      const response = await fetch(`/api/notams?icao=${icao}`);
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || `Network error`);
      setNotamDataStore(prev => ({ ...prev, [icao]: { data: data.map(n => ({...n, icao})), loading: false, error: null } }));
    } catch (err) {
      setNotamDataStore(prev => ({ ...prev, [icao]: { ...prev[icao], loading: false, error: err.message } }));
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
  
  const handleAddIcao = useCallback(() => {
    if (!icaoInputRef.current) return;
    const newIcaoInputs = icaoInputRef.current.value.toUpperCase().split(/[,\s]+/)
      .map(s => s.trim()).filter(s => s.length === 4 && /^[A-Z0-9]{4}$/.test(s));
    
    if (newIcaoInputs.length > 0) {
      const addedIcaos = newIcaoInputs.filter(icao => !icaos.includes(icao));
      if (addedIcaos.length > 0) {
        setIcaos(prev => [...prev, ...addedIcaos]);
        setActiveTab(addedIcaos[0]);
      }
    }
    icaoInputRef.current.value = "";
    icaoInputRef.current.focus();
  }, [icaos]);

  const handleRemoveIcao = useCallback((icaoToRemove) => {
    setIcaos(prev => prev.filter(i => i !== icaoToRemove));
    setNotamDataStore(prev => {
      const newStore = {...prev};
      delete newStore[icaoToRemove];
      return newStore;
    });
  }, []);

  const handleIcaoInputKeyPress = (e) => {
    if (e.key === "Enter") handleAddIcao();
  };

  // Consolidate data for the "ALL" tab
  const allNotamsData = useMemo(() => {
    let combined = [];
    let isLoading = false;
    let anyError = null;

    // Sort ICAOs alphabetically for consistent order
    const sortedIcaos = [...icaos].sort();

    sortedIcaos.forEach(icao => {
      const storeEntry = notamDataStore[icao];
      if (storeEntry) {
        if (storeEntry.loading) isLoading = true;
        if (storeEntry.error) anyError = anyError || storeEntry.error;
        if (storeEntry.data && storeEntry.data.length > 0) {
          // Add a header for each ICAO group
          combined.push({ isIcaoHeader: true, icao: icao, id: `header-${icao}` });
          combined = combined.concat(storeEntry.data);
        }
      } else {
        isLoading = true; // If an ICAO hasn't even started fetching
      }
    });
    return { data: combined, loading: isLoading, error: anyError };
  }, [notamDataStore, icaos]);

  const activeNotamData = activeTab === 'ALL' 
    ? allNotamsData 
    : notamDataStore[activeTab] || { data: [], loading: true, error: null };

  const Tab = ({ id, label, onRemove }) => (
    <div className={`icao-tab ${activeTab === id ? 'active' : ''}`} onClick={() => setActiveTab(id)}>
      <span>{label}</span>
      {onRemove && (
        <button onClick={(e) => { e.stopPropagation(); onRemove(id); }} className="remove-btn ml-2">&times;</button>
      )}
    </div>
  );

  return (
    <div className="container mx-auto px-2 py-6">
      <Header />
      
      <div className="glass p-4 flex flex-col sm:flex-row items-center gap-4 mb-4">
        <input ref={icaoInputRef} placeholder="Enter ICAOs (e.g. CYYT, KJFK)" className="px-4 py-2 rounded-lg bg-[#21263b] border border-[#283057] text-lg outline-cyan-300 font-mono tracking-widest uppercase" onKeyPress={handleIcaoInputKeyPress} />
        <button onClick={handleAddIcao} className="bg-cyan-500 hover:bg-cyan-400 px-4 py-2 rounded-lg font-bold text-[#131926] transition shadow">Add ICAO(s)</button>
      </div>
      
      <div className="glass p-4">
        <div className="icao-tabs">
          <Tab id="ALL" label="ALL" />
          {icaos.map(icao => (
            <Tab key={icao} id={icao} label={icao} onRemove={handleRemoveIcao} />
          ))}
        </div>
        
        <div>
          <NotamTabContent icao={activeTab} notams={activeNotamData.data} loading={activeNotamData.loading} error={activeNotamData.error} />
        </div>
      </div>
    </div>
  );
};

const Header = () => {
  const [utcTime, setUtcTime] = useState('');
  useEffect(() => {
    const tick = () => setUtcTime(new Date().toUTCString().slice(5, -4)); // Cleaner format
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <header className="p-4 mb-2 text-center">
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-cyan-300">NOTAM Console</h1>
      <p className="mt-2 text-lg sm:text-xl font-mono text-cyan-400 font-semibold">{utcTime} UTC</p>
    </header>
  );
};

export default App;
