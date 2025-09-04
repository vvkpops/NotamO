import React, { useState, useMemo, useEffect } from 'react';
import NotamCard from './NotamCard';
import { getFIRForICAO } from './FIRUtils';

const ICAOTabPanel = ({
  icao,
  notamData,
  loading,
  error,
  keywordHighlightEnabled = false,
  keywordCategories = {},
  firDataStore = {}
}) => {
  const [activeSubTab, setActiveSubTab] = useState('AERODROME');
  
  // Get the FIR code for this ICAO
  const firCode = useMemo(() => {
    if (!icao || !notamData || notamData.length === 0) return null;
    return getFIRForICAO(icao, notamData);
  }, [icao, notamData]);
  
  // Get FIR data from the store
  const firData = useMemo(() => {
    if (!firCode) return null;
    return firDataStore[firCode];
  }, [firCode, firDataStore]);
  
  // Determine if we should show FIR tab
  const shouldShowFIRTab = useMemo(() => {
    // Show FIR tab if:
    // 1. We have a FIR code AND
    // 2. Either we have FIR data OR FIR is loading
    return firCode && (firData?.data?.length > 0 || firData?.loading);
  }, [firCode, firData]);
  
  // Count NOTAMs for each tab
  const aerodromeCount = notamData?.length || 0;
  const firCount = firData?.data?.length || 0;
  
  // Auto-switch to aerodrome if FIR tab is hidden and FIR was selected
  useEffect(() => {
    if (activeSubTab === 'FIR' && !shouldShowFIRTab) {
      setActiveSubTab('AERODROME');
    }
  }, [activeSubTab, shouldShowFIRTab]);
  
  // Loading state
  if (loading && (!notamData || notamData.length === 0)) {
    return (
      <div className="notam-tab-content">
        <div className="loading-state">
          <div className="loading-spinner-large"></div>
          <h3>Loading NOTAMs for {icao}...</h3>
          <p>Fetching latest aviation notices</p>
        </div>
      </div>
    );
  }
  
  // Error state
  if (error) {
    return (
      <div className="notam-tab-content">
        <div className="error-state">
          <div className="error-icon">⚠️</div>
          <h3>Failed to Load NOTAMs</h3>
          <p>{error}</p>
        </div>
      </div>
    );
  }
  
  // Determine which data to show based on active sub-tab
  const displayData = activeSubTab === 'FIR' ? (firData?.data || []) : notamData;
  const isLoadingData = activeSubTab === 'FIR' ? firData?.loading : false;
  
  return (
    <div className="notam-tab-content">
      {/* Sub-tabs for Aerodrome/FIR */}
      <div className="icao-subtabs">
        <button 
          className={`icao-subtab ${activeSubTab === 'AERODROME' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('AERODROME')}
        >
          <span className="subtab-icon">✈️</span>
          <span>Aerodrome ({aerodromeCount})</span>
        </button>
        
        {shouldShowFIRTab && (
          <button 
            className={`icao-subtab ${activeSubTab === 'FIR' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('FIR')}
          >
            <span className="subtab-icon">🌐</span>
            <span>
              FIR {firCode} ({firCount})
              {firData?.loading && <span className="fir-loading-spinner"></span>}
            </span>
          </button>
        )}
      </div>
      
      {/* Content based on active sub-tab */}
      <div className="notam-results">
        {isLoadingData ? (
          <div className="loading-state">
            <div className="loading-spinner-large"></div>
            <h3>Loading FIR NOTAMs for {firCode}...</h3>
            <p>Fetching Flight Information Region notices</p>
          </div>
        ) : displayData && displayData.length > 0 ? (
          <div className="notam-grid">
            {displayData.map((notam) => (
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
            <div className="empty-icon">
              {activeSubTab === 'FIR' ? '🌐' : '✈️'}
            </div>
            <h3>No {activeSubTab === 'FIR' ? 'FIR' : 'Aerodrome'} NOTAMs found</h3>
            <p>
              There are currently no active {activeSubTab === 'FIR' ? `FIR NOTAMs for ${firCode}` : `NOTAMs for ${icao}`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ICAOTabPanel;