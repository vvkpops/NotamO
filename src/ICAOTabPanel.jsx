import React, { useState, useEffect, useCallback } from 'react';
import NotamCard from './NotamCard';
import { getFIRForICAO, getCachedFIRData, setCachedFIRData, categorizeNotams } from './FIRUtils';

const ICAOTabPanel = ({ 
  icao, 
  notamData, 
  loading, 
  error,
  keywordHighlightEnabled,
  keywordCategories,
  onRefresh 
}) => {
  const [activeSubTab, setActiveSubTab] = useState('aerodrome');
  const [firCode, setFirCode] = useState(null);
  const [firNotams, setFirNotams] = useState([]);
  const [firLoading, setFirLoading] = useState(false);
  const [firError, setFirError] = useState(null);
  const [categorizedNotams, setCategorizedNotams] = useState({
    aerodromeNotams: [],
    firNotams: []
  });

  // Extract FIR and fetch FIR NOTAMs - only for FAA sources
  useEffect(() => {
    if (!notamData || notamData.length === 0) return;
    
    // Check if this is Canadian CFPS data (it already includes FIR NOTAMs)
    const isCanadianSource = notamData.some(n => n.source === 'NAV CANADA');
    if (isCanadianSource) {
      console.log(`🍁 Canadian source detected for ${icao}, skipping FIR fetch`);
      setCategorizedNotams({
        aerodromeNotams: notamData,
        firNotams: []
      });
      setFirCode(null);
      return;
    }
    
    // Extract FIR code from FAA NOTAMs
    const extractedFIR = getFIRForICAO(icao, notamData);
    if (extractedFIR && extractedFIR !== firCode) {
      setFirCode(extractedFIR);
      fetchFIRNotams(extractedFIR);
    }
    
    // For now, all existing NOTAMs are aerodrome NOTAMs
    setCategorizedNotams({
      aerodromeNotams: notamData,
      firNotams: []
    });
  }, [icao, notamData]);

  const fetchFIRNotams = useCallback(async (fir) => {
    if (!fir) return;
    
    // Check cache first
    const cached = getCachedFIRData(fir);
    if (cached) {
      console.log(`📦 Using cached FIR data for ${fir}`);
      setFirNotams(cached);
      return;
    }
    
    setFirLoading(true);
    setFirError(null);
    
    try {
      console.log(`🌐 Fetching FIR NOTAMs for ${fir}`);
      const response = await fetch(`/api/notams?fir=${fir}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      // Filter to only include FIR-wide NOTAMs (not specific airports)
      const firWideNotams = data.filter(notam => {
        // Exclude NOTAMs that are specific to an airport
        const isAirportSpecific = /^[A-Z]{4}$/.test(notam.icao) && notam.icao !== fir;
        return !isAirportSpecific;
      });
      
      console.log(`✅ Loaded ${firWideNotams.length} FIR-wide NOTAMs for ${fir}`);
      
      // Cache the results
      setCachedFIRData(fir, firWideNotams);
      setFirNotams(firWideNotams);
      
    } catch (error) {
      console.error(`❌ Error fetching FIR NOTAMs:`, error);
      setFirError(error.message);
    } finally {
      setFirLoading(false);
    }
  }, []);

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
    : firNotams;

  // Check if we should show FIR tab (only for FAA sources)
  const showFirTab = firCode && notamData && notamData.some(n => n.source === 'FAA');

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
            count={firLoading ? '...' : firNotams.length}
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
            <button className="retry-btn" onClick={() => fetchFIRNotams(firCode)}>
              🔄 Retry
            </button>
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

export default ICAOTabPanel;