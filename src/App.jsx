import React, { useState, useEffect, useRef, useCallback } from 'react';
import './index.css';
import NotamTabContent from './NotamTabContent';

// --- Main Application Component -----
const App = () => {
  // State Management
  const [icaos, setIcaos] = useState(() => JSON.parse(localStorage.getItem("notamIcaos") || "[]"));
  const [activeIcao, setActiveIcao] = useState(null);

  // Refs for direct DOM access
  const icaoInputRef = useRef(null);

  // Persist ICAOs to localStorage
  useEffect(() => {
    localStorage.setItem("notamIcaos", JSON.stringify(icaos));
    // If there's no active ICAO, or the active one was removed, set a new one.
    if ((!activeIcao || !icaos.includes(activeIcao)) && icaos.length > 0) {
      setActiveIcao(icaos[0]);
    } else if (icaos.length === 0) {
      setActiveIcao(null);
    }
  }, [icaos, activeIcao]);
  
  // --- Handler Functions ---
  const handleAddIcao = useCallback(() => {
    if (!icaoInputRef.current) return;
    const inputValue = icaoInputRef.current.value.toUpperCase();
    const newIcaoInputs = inputValue.split(/[,\s]+/)
      .map(s => s.trim())
      .filter(s => s.length === 4 && /^[A-Z0-9]{4}$/.test(s));
    
    if (newIcaoInputs.length > 0) {
        setIcaos(prevIcaos => {
            const addedIcaos = newIcaoInputs.filter(icao => !prevIcaos.includes(icao));
            return [...prevIcaos, ...addedIcaos];
        });
        // Set the first new ICAO as the active one
        setActiveIcao(newIcaoInputs[0]);
    }
    
    icaoInputRef.current.value = "";
    icaoInputRef.current.focus();
  }, []);

  const handleRemoveIcao = useCallback((icaoToRemove) => {
    setIcaos(prev => prev.filter(i => i !== icaoToRemove));
  }, []);

  const handleIcaoInputKeyPress = (e) => {
    if (e.key === "Enter") handleAddIcao();
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200">
      <Header />
      
      {/* Controls Section */}
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 mb-6">
        <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-2 mb-4 items-center bg-gray-800 rounded-lg p-4">
          <input ref={icaoInputRef} placeholder="Enter ICAOs (e.g. CYYT,EGLL,KJFK)" className="bg-gray-700 p-2 rounded text-center w-full sm:w-72 text-white placeholder-gray-400 text-sm" onKeyPress={handleIcaoInputKeyPress} />
          <button onClick={handleAddIcao} className="bg-blue-600 px-4 py-2 rounded text-white hover:bg-blue-700 transition-colors text-sm">Add ICAO(s)</button>
        </div>
      </div>
      
      {/* NOTAM Tabs */}
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 pb-8">
        {icaos.length > 0 ? (
            <div className="bg-gray-800/50 rounded-lg border border-gray-700 shadow-lg">
                {/* Tab Navigation */}
                <div className="flex items-center border-b border-gray-700 p-2 flex-wrap">
                    {icaos.map(icao => (
                        <div key={icao} className={`relative flex items-center px-4 py-2 cursor-pointer transition-colors duration-200 ${activeIcao === icao ? 'text-cyan-400' : 'text-gray-400 hover:text-white'}`} onClick={() => setActiveIcao(icao)}>
                            <span className="font-medium">{icao}</span>
                            {activeIcao === icao && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400"></div>}
                            <button onClick={(e) => { e.stopPropagation(); handleRemoveIcao(icao); }} className="ml-2 text-red-500 hover:text-red-300 text-lg leading-none">&times;</button>
                        </div>
                    ))}
                </div>
                {/* Tab Content */}
                <div>
                    {activeIcao && <NotamTabContent icao={activeIcao} />}
                </div>
            </div>
        ) : (
            <div className="text-center py-12 text-gray-400 text-lg">
                No stations added yet. Start by entering an ICAO code above.
            </div>
        )}
      </div>
    </div>
  );
};

// --- Header Component ---
const Header = () => {
  const [utcTime, setUtcTime] = useState('');
  useEffect(() => {
    const tick = () => setUtcTime(new Date().toUTCString().slice(0, -4));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <header className="p-4 mb-2 max-w-screen-xl mx-auto text-center">
      <h1 className="text-2xl sm:text-3xl font-bold text-cyan-300">NOTAM Console</h1>
      <p className="mt-2 text-lg sm:text-xl font-mono text-cyan-400 font-semibold">{utcTime} UTC</p>
    </header>
  );
};

export default App;
