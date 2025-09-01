import React, { useState, useEffect, useRef, useCallback } from 'react';
import './index.css';
import NotamModal from './NotamModal';

// --- Main Application Component -----
const App = () => {
  // State Management
  const [icaos, setIcaos] = useState(() => JSON.parse(localStorage.getItem("notamIcaos") || "[]"));
  const [minimized, setMinimized] = useState(() => JSON.parse(localStorage.getItem("notamCardsMinimized") || "false"));
  const [icaoFilter, setIcaoFilter] = useState("");
  const [showFilteredOnly, setShowFilteredOnly] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null);

  // Refs for direct DOM access
  const icaoInputRef = useRef(null);
  const filterInputRef = useRef(null);

  // Persist state to localStorage whenever it changes
  useEffect(() => { localStorage.setItem("notamIcaos", JSON.stringify(icaos)); }, [icaos]);
  useEffect(() => { localStorage.setItem("notamCardsMinimized", JSON.stringify(minimized)); }, [minimized]);

  // --- Handler Functions ---
  const handleAddIcao = useCallback(() => {
    if (!icaoInputRef.current) return;
    const inputValue = icaoInputRef.current.value.toUpperCase();
    const newIcaoInputs = inputValue.split(/[,\s]+/).map(s => s.trim()).filter(s => s.length === 4 && /^[A-Z0-9]{4}$/.test(s));
    
    setIcaos(prevIcaos => {
        const addedIcaos = newIcaoInputs.filter(icao => !prevIcaos.includes(icao));
        return [...prevIcaos, ...addedIcaos];
    });
    
    icaoInputRef.current.value = "";
    icaoInputRef.current.focus();
  }, []);

  const handleRemoveIcao = useCallback((icaoToRemove) => {
    setIcaos(prev => prev.filter(i => i !== icaoToRemove));
  }, []);

  const handleIcaoInputKeyPress = (e) => {
    if (e.key === "Enter") handleAddIcao();
  };

  // --- Filtering Logic ---
  const filteredIcaos = React.useMemo(() => {
    if (!showFilteredOnly || !icaoFilter.trim()) return icaos;
    const filterTerms = icaoFilter.toUpperCase().split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
    if (filterTerms.length === 0) return icaos;
    return icaos.filter(icao => filterTerms.some(term => icao.includes(term)));
  }, [icaos, icaoFilter, showFilteredOnly]);

  const handleToggleFilter = () => {
    setShowFilteredOnly(prev => !prev);
    if (!showFilteredOnly) {
      setTimeout(() => filterInputRef.current?.focus(), 100);
    }
  };
  const handleClearFilter = () => { setIcaoFilter(""); setShowFilteredOnly(false); };

  // --- Drag and Drop Logic ---
  const handleDragStart = (icao) => setDraggedItem(icao);
  const handleDragEnd = () => setDraggedItem(null);
  const handleReorder = (targetIcao) => {
    if (!draggedItem || draggedItem === targetIcao) return;
    setIcaos(prev => {
        const newOrder = prev.filter(i => i !== draggedItem);
        const targetIndex = newOrder.indexOf(targetIcao);
        newOrder.splice(targetIndex, 0, draggedItem);
        return newOrder;
    });
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200">
      <Header />
      
      {/* Controls Section */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 mb-6">
        <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-2 mb-4 items-center bg-gray-800 rounded-lg p-4">
          <input ref={icaoInputRef} placeholder="Enter ICAOs (e.g. CYYT,EGLL,KJFK)" className="bg-gray-700 p-2 rounded text-center w-full sm:w-72 text-white placeholder-gray-400 text-sm" onKeyPress={handleIcaoInputKeyPress} />
          <div className="flex gap-2 flex-wrap">
            <button onClick={handleAddIcao} className="bg-blue-600 px-4 py-2 rounded text-white hover:bg-blue-700 transition-colors text-sm">Add ICAO(s)</button>
            <button onClick={() => setMinimized(p => !p)} className={`px-4 py-2 rounded text-white transition-colors text-sm ${minimized ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-gray-600 hover:bg-gray-500'}`} title={minimized ? 'Expand all' : 'Minimize all'}>
              {minimized ? 'Expand All' : 'Minimize All'}
            </button>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-2 items-center bg-gray-700 rounded-lg p-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-cyan-300 font-semibold text-sm">🔍 Filter:</span>
            <input ref={filterInputRef} value={icaoFilter} onChange={(e) => setIcaoFilter(e.target.value)} placeholder="Filter ICAOs..." className="bg-gray-800 p-2 rounded text-center w-full sm:w-64 text-white placeholder-gray-400 border border-gray-600 focus:border-cyan-400 focus:outline-none transition-colors text-sm" />
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={handleToggleFilter} className={`px-4 py-2 rounded text-white transition-colors font-medium text-sm ${showFilteredOnly ? 'bg-cyan-600 hover:bg-cyan-700' : 'bg-gray-600 hover:bg-gray-500'}`}>{showFilteredOnly ? 'Filter Active' : 'Apply Filter'}</button>
            {(icaoFilter || showFilteredOnly) && <button onClick={handleClearFilter} className="bg-red-600 hover:bg-red-700 px-3 py-2 rounded text-white transition-colors text-sm">Clear</button>}
          </div>
          <div className="text-sm text-gray-400 text-center sm:text-left">Showing {filteredIcaos.length} of {icaos.length} stations</div>
        </div>
      </div>
      
      {/* NOTAM Tiles Grid */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 pb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 sm:gap-6">
          {filteredIcaos.map(icao => (
            <NotamTile key={icao} icao={icao} removeIcao={handleRemoveIcao} globalMinimized={minimized} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onReorder={handleReorder} isDragging={draggedItem === icao} />
          ))}
        </div>
        {filteredIcaos.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-lg">
            {icaos.length > 0 ? 'No stations match your filter.' : 'No stations added yet.'}
          </div>
        )}
      </div>
    </div>
  );
};

// --- Child Components ---

const Header = () => {
  const [utcTime, setUtcTime] = useState('');
  useEffect(() => {
    const tick = () => setUtcTime(new Date().toUTCString().slice(0, -4)); // Full UTC string without GMT
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <header className="p-4 mb-6 max-w-screen-2xl mx-auto text-center">
      <h1 className="text-2xl sm:text-3xl font-bold text-cyan-300">NOTAM Console</h1>
      <p className="mt-2 text-lg sm:text-xl font-mono text-cyan-400 font-semibold">{utcTime} UTC</p>
    </header>
  );
};

const NotamTile = ({ icao, removeIcao, globalMinimized, onDragStart, onDragEnd, onReorder, isDragging }) => {
  const [notams, setNotams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [minimized, setMinimized] = useState(() => localStorage.getItem(`notamTileMin_${icao}`) === '1');
  const effectiveMinimized = globalMinimized || minimized;

  const dragRef = useRef(null);

  useEffect(() => { localStorage.setItem(`notamTileMin_${icao}`, minimized ? '1' : '0'); }, [minimized, icao]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/notams?icao=${icao}`);
        const data = await response.json();
        if (!response.ok || data.error) throw new Error(data.error || `Network error: ${response.status}`);
        setNotams(data);
      } catch (err) {
        setError(err.message);
        setNotams([]);
      } finally { setLoading(false); }
    };
    fetchData();
    const interval = setInterval(fetchData, 10 * 60 * 1000); // Refresh every 10 minutes
    return () => clearInterval(interval);
  }, [icao]);

  const handleDragOver = (e) => { e.preventDefault(); onReorder(icao); };
  const getBorderClass = () => {
    if (error) return "border-red-600";
    if (loading) return "border-yellow-600 animate-pulse";
    const hasClosure = notams.some(n => n.summary.toLowerCase().includes('clsd') || n.summary.toLowerCase().includes('closed'));
    if (hasClosure) return "border-red-500";
    if (notams.length > 0) return "border-cyan-500";
    return "border-gray-600";
  };

  return (
    <>
      <div ref={dragRef} draggable onDragStart={() => onDragStart(icao)} onDragEnd={onDragEnd} onDragOver={handleDragOver} className={`relative bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl shadow-lg p-4 border-2 select-none cursor-grab active:cursor-grabbing ${getBorderClass()} ${isDragging ? 'opacity-30 scale-95' : 'hover:scale-[1.02] hover:shadow-xl hover:shadow-cyan-500/10'} transition-all duration-300 ease-out`}>
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-2xl font-bold text-center bg-gradient-to-br from-cyan-400 to-cyan-600 bg-clip-text text-transparent tracking-wider">{icao}</h2>
          <button onClick={() => removeIcao(icao)} className="bg-red-600 hover:bg-red-700 text-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg border-2 border-red-400 hover:scale-110 transition-all" title={`Remove ${icao}`}>
            <span className="text-lg font-bold">&times;</span>
          </button>
        </div>
        <div className="flex justify-center gap-4 mt-2">
          <button onClick={() => setModalOpen(true)} className="bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white px-3 py-1.5 rounded-md text-xs font-medium transition-colors border border-gray-600 shadow-sm">View ({loading ? '...' : notams.length})</button>
          {!globalMinimized && <button onClick={() => setMinimized(p => !p)} className="bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white px-3 py-1.5 rounded-md text-xs font-medium transition-colors border border-gray-600 shadow-sm">{effectiveMinimized ? 'Expand' : 'Collapse'}</button>}
        </div>
        {!effectiveMinimized && (
          <div className="mt-4 text-xs space-y-2 font-mono">
            {loading ? <p>Loading...</p> :
             error ? <p className="text-red-400">Error fetching data.</p> :
             notams.length > 0 ? (notams.slice(0, 3).map((n, i) => <p key={i} className="truncate text-gray-400"><span className="font-bold text-orange-400">{n.number}:</span> {n.summary}</p>)) : <p className="text-gray-500">No active NOTAMs.</p>}
            {notams.length > 3 && <p className="text-cyan-400 text-center font-bold">...and {notams.length - 3} more</p>}
          </div>
        )}
      </div>
      <NotamModal isOpen={modalOpen} onClose={() => setModalOpen(false)} icao={icao} notamData={notams} loading={loading} error={error} />
    </>
  );
};

export default App;
