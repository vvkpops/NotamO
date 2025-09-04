import React, { useState, useEffect, useCallback, useRef } from 'react';
import NotamCard from './NotamCard';

const ICAOTabPanel = ({ 
  icao, 
  notamData, 
  loading, 
  error,
  keywordHighlightEnabled,
  keywordCategories,
  onRefresh,
  firDataStore 
}) => {
  const [activeSubTab, setActiveSubTab] = useState('aerodrome');
  const [categorizedNotams, setCategorizedNotams] = useState({
    aerodromeNotams: [],
    firNotams: []
  });
  const [firCode, setFirCode] = useState(null);
  
  // Reset state when ICAO changes
  useEffect(() => {
    setActiveSubTab('aerodrome');
  }, [icao]);

  // Extract FIR code and categorize NOTAMs
  useEffect(() => {
    if (!notamData || notamData.length === 0) return;
    
    // Check if this is Canadian CFPS data (it already includes FIR NOTAMs)
    const isCanadianSource = notamData.some(n => n.source === 'NAV CANADA');
    if (isCanadianSource) {
      console.log(`🍁 Canadian source detected for ${icao}, FIR NOTAMs included`);
      setCategorizedNotams({
        aerodromeNotams: notamData,
        firNotams: []
      });
      setFirCode(null);
      return;
    }
    
    // Extract FIR code from FAA NOTAMs
    const extractedFIR = getFIRForICAO(icao, notamData);
    setFirCode(extractedFIR);
    
    // All existing NOTAMs are aerodrome NOTAMs
    setCategorizedNotams({
      aerodromeNotams: notamData,
      firNotams: []
    });
  }, [icao, notamData]);

  // Get FIR NOTAMs from the shared store
  useEffect(() => {
    if (!firCode || !firDataStore[firCode]) {
      return;
    }
    
    const firData = firDataStore[firCode];
    if (firData.data) {
      setCategorizedNotams(prev => ({
        ...prev,
        firNotams: firData.data
      }));
    }
  }, [firCode, firDataStore]);

  const SubTabButton = ({ id, label, count, isActive, onClick }) => (
    <button
      className={`icao-subtab ${isActive ? 'active' : ''}`}
      onClick={onClick}
    >
      <span>{label}</span>
      {count !== undefined && <span className="subtab-count">({count})</span>}
    </button>
  );

  if (loading && (!notamData || notamData.length === 0)) {
    return (
      <div className="loading-state">
        <div className="loading-spinner-large"></div>
        <h3>Loading NOTAMs...</h3>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-state">
        <div className="error-icon">⚠️</div>
        <h3>Failed to Load NOTAMs</h3>
        <p>{error}</p>
      </div>
    );
  }

  const displayNotams = activeSubTab === 'aerodrome' 
    ? categorizedNotams.aerodromeNotams 
    : categorizedNotams.firNotams;

  // Check if we should show FIR tab (only for FAA sources)
  const showFirTab = firCode && notamData && notamData.some(n => n.source === 'FAA');
  const firLoading = firCode && firDataStore[firCode]?.loading;
  const firError = firCode && firDataStore[firCode]?.error;

  return (
    <div className="icao-tab-panel">
      <div className="icao-subtabs">
        <SubTabButton
          id="aerodrome"
          label={`✈️ ${icao} Aerodrome`}
          count={categorizedNotams.aerodromeNotams.length}
          isActive={activeSubTab === 'aerodrome'}
          onClick={() => setActiveSubTab('aerodrome')}
        />
        {showFirTab && (
          <SubTabButton
            id="fir"
            label={`🌐 ${firCode} FIR`}
            count={firLoading ? '...' : categorizedNotams.firNotams.length}
            isActive={activeSubTab === 'fir'}
            onClick={() => setActiveSubTab('fir')}
          />
        )}
      </div>

      <div className="subtab-content">
        {activeSubTab === 'fir' && firLoading ? (
          <div className="loading-state">
            <div className="loading-spinner-large"></div>
            <h3>Loading FIR NOTAMs...</h3>
          </div>
        ) : activeSubTab === 'fir' && firError ? (
          <div className="error-state">
            <div className="error-icon">⚠️</div>
            <h3>Failed to Load FIR NOTAMs</h3>
            <p>{firError}</p>
          </div>
        ) : displayNotams.length > 0 ? (
          <div className="notam-grid">
            {displayNotams.map(notam => (
              <NotamCard
                key={notam.id}
                notam={notam}
                keywordHighlightEnabled={keywordHighlightEnabled}
                keywordCategories={keywordCategories}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <h3>No {activeSubTab === 'fir' ? 'FIR' : 'Aerodrome'} NOTAMs</h3>
            <p>No active NOTAMs found for this {activeSubTab === 'fir' ? 'FIR' : 'aerodrome'}.</p>
          </div>
        )}
      </div>
    </div>
  );
};

// Helper function to extract FIR code from ICAO and NOTAMs
const getFIRForICAO = (icao, notams) => {
  // US FIR mapping
  const US_FIR_MAP = {
    'K': {
      // Alaska
      'PA': 'PAZA', // Alaska
      // Caribbean
      'TJ': 'TJZS', // San Juan
      // Continental US examples
      'JFK': 'KZNY', // New York
      'LAX': 'KZLA', // Los Angeles
      'ORD': 'KZAU', // Chicago
      'ATL': 'KZTL', // Atlanta
      'DFW': 'KZFW', // Fort Worth
      'DEN': 'KZDV', // Denver
      'SEA': 'KZSE', // Seattle
      'BOS': 'KZBW', // Boston
      'MIA': 'KZMA', // Miami
    }
  };

  // Try to extract from Q line in NOTAMs
  if (notams && notams.length > 0) {
    for (const notam of notams) {
      if (notam.rawText) {
        const qLineMatch = notam.rawText.match(/Q\)\s*([A-Z]{4})\//);
        if (qLineMatch) {
          console.log(`🔍 Found FIR ${qLineMatch[1]} in Q line for ${icao}`);
          return qLineMatch[1];
        }
      }
    }
  }

  // Fallback to mapping
  if (icao.startsWith('K')) {
    // Check specific mappings
    if (icao.startsWith('PA')) return 'PAZA';
    if (icao.startsWith('TJ')) return 'TJZS';
    
    // Check known airports
    const airportFir = US_FIR_MAP.K[icao.substring(1)];
    if (airportFir) return airportFir;
    
    // For other US airports, we'd need a more complete mapping
    console.log(`⚠️ No FIR mapping found for ${icao}`);
  }

  return null;
};

export default ICAOTabPanel;
export { getFIRForICAO };