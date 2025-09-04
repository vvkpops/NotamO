import React, { useState, useEffect, useCallback, useRef } from 'react';
import NotamCard from './NotamCard';
import { getFIRForICAO, getCachedFIRData, setCachedFIRData, extractFIRFromNotam } from './FIRUtils';

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
  
  // New NOTAM detection for FIR
  const [previousFirSignatures, setPreviousFirSignatures] = useState(new Set());
  const [newFirNotamCount, setNewFirNotamCount] = useState(0);
  const firNotamsRef = useRef([]);

  // Create NOTAM signature for comparison
  const createNotamSignature = useCallback((notam) => {
    const number = notam.number || 'unknown';
    const validFrom = notam.validFrom || 'unknown';
    const validTo = notam.validTo || 'unknown';
    const source = notam.source || 'unknown';
    const summary = (notam.summary || '').replace(/\s+/g, ' ').trim();
    const rawText = (notam.rawText || '').replace(/\s+/g, ' ').trim();
    const text = summary || rawText;
    const contentHash = text.slice(0, 200);
    
    return `${number}-${validFrom}-${validTo}-${source}-${contentHash}`;
  }, []);

  // Smart FIR NOTAM detection
  const detectNewFirNotams = useCallback((existingNotams, newNotams) => {
    if (!existingNotams || existingNotams.length === 0) {
      // First fetch - none are "new" from user perspective
      return newNotams.map(n => ({ ...n, isNew: false, userViewed: false }));
    }

    // Create signature sets for comparison
    const existingSignatures = new Set(existingNotams.map(n => createNotamSignature(n)));
    const processedNotams = [];
    let newCount = 0;

    newNotams.forEach(notam => {
      const signature = createNotamSignature(notam);
      const isNew = !existingSignatures.has(signature);
      
      if (isNew) {
        console.log(`🆕 New FIR NOTAM detected: ${notam.number} for FIR ${firCode}`);
        newCount++;
      }

      processedNotams.push({
        ...notam,
        isNew: isNew,
        userViewed: false,
        firstSeenAt: isNew ? Date.now() : null
      });
    });

    if (newCount > 0) {
      console.log(`✨ Found ${newCount} new FIR NOTAMs for ${firCode}`);
      setNewFirNotamCount(prev => prev + newCount);
    }

    return processedNotams;
  }, [createNotamSignature, firCode]);

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
      
      // Apply new NOTAM detection to cached data
      const processedCached = detectNewFirNotams(firNotamsRef.current, cached);
      setFirNotams(processedCached);
      firNotamsRef.current = processedCached;
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
      
      // Apply new NOTAM detection
      const processedNotams = detectNewFirNotams(firNotamsRef.current, firWideNotams);
      
      // Cache the results
      setCachedFIRData(fir, firWideNotams);
      setFirNotams(processedNotams);
      firNotamsRef.current = processedNotams;
      
    } catch (error) {
      console.error(`❌ Error fetching FIR NOTAMs:`, error);
      setFirError(error.message);
    } finally {
      setFirLoading(false);
    }
  }, [detectNewFirNotams]);

  // Clear new status when FIR tab is viewed
  const handleSubTabClick = useCallback((tabId) => {
    setActiveSubTab(tabId);
    
    if (tabId === 'fir' && newFirNotamCount > 0) {
      console.log(`👁️ User viewed FIR tab, clearing ${newFirNotamCount} new NOTAM indicators`);
      
      // Mark all FIR NOTAMs as viewed
      const viewedNotams = firNotams.map(n => ({
        ...n,
        isNew: false,
        userViewed: true
      }));
      
      setFirNotams(viewedNotams);
      firNotamsRef.current = viewedNotams;
      setNewFirNotamCount(0);
      
      // Update cache with viewed status
      if (firCode) {
        setCachedFIRData(firCode, viewedNotams);
      }
    }
  }, [newFirNotamCount, firNotams, firCode]);

  const SubTabButton = ({ id, label, count, isActive, onClick, hasNew = false }) => (
    <button
      className={`icao-subtab ${isActive ? 'active' : ''} ${hasNew ? 'has-new-fir' : ''}`}
      onClick={onClick}
    >
      <span>{label}</span>
      {count !== undefined && <span className="subtab-count">({count})</span>}
      {hasNew && !isActive && <span className="new-fir-indicator"></span>}
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
          onClick={() => handleSubTabClick('aerodrome')}
        />
        {showFirTab && (
          <SubTabButton
            id="fir"
            label={`🌐 ${firCode} FIR`}
            count={firLoading ? '...' : firNotams.length}
            isActive={activeSubTab === 'fir'}
            onClick={() => handleSubTabClick('fir')}
            hasNew={newFirNotamCount > 0}
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
