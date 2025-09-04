// Enhanced NotamCard.jsx with better date handling and debugging
import React, { useState, useEffect } from 'react';
import { getHeadClass, getHeadTitle, extractRunways } from './NotamUtils';
import { highlightNotamKeywords } from './NotamKeywordHighlight.jsx';

const NotamCard = ({ 
  notam, 
  keywordHighlightEnabled = false, 
  keywordCategories = {} 
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [copyStatus, setCopyStatus] = useState('📋');
  const [dateDebugInfo, setDateDebugInfo] = useState(null);

  useEffect(() => {
    // Trigger entrance animation
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Enhanced date debugging
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const debugInfo = {
        notamNumber: notam.number,
        rawValidFrom: notam.validFrom,
        rawValidTo: notam.validTo,
        source: notam.source,
        hasRawText: !!notam.rawText,
        rawTextPreview: notam.rawText?.substring(0, 100) + '...'
      };
      setDateDebugInfo(debugInfo);
      console.log(`🐛 NOTAM ${notam.number} date debug:`, debugInfo);
    }
  }, [notam]);

  const headClass = getHeadClass(notam);
  const headTitle = getHeadTitle(notam);
  
  // Use rawText for runway extraction to be consistent
  const runways = extractRunways(notam.rawText);
  
  // Enhanced date formatting with better error handling and null safety
  const formatDate = (dateStr, context = 'unknown') => {
    // Handle null, undefined, or empty strings
    if (!dateStr || dateStr === '' || dateStr === 'null' || dateStr === 'undefined') {
      console.warn(`⚠️ formatDate received invalid input: "${dateStr}" for context: ${context}`);
      return 'N/A';
    }

    // Handle PERMANENT variations
    if (dateStr === 'PERMANENT' || dateStr === 'PERM' || dateStr.toString().toUpperCase().includes('PERM')) {
      return 'PERM';
    }

    try {
      const date = new Date(dateStr);
      
      // Check if the date is valid
      if (isNaN(date.getTime())) {
        console.warn(`⚠️ Invalid date created from: "${dateStr}" (context: ${context})`);
        return dateStr; // Return original string if can't format
      }

      const formatted = date.toLocaleString('en-GB', { 
        timeZone: 'UTC', 
        year: 'numeric', 
        month: 'short', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit' 
      }) + 'Z';

      console.log(`✅ Successfully formatted date: "${dateStr}" -> "${formatted}" (context: ${context})`);
      return formatted;
      
    } catch (error) { 
      console.error(`❌ Error formatting date: "${dateStr}" (context: ${context}):`, error);
      return dateStr; // Return original string as fallback
    }
  };

  // Enhanced time status calculation with better null handling
  const getTimeStatus = () => {
    const now = new Date();
    
    // Handle cases where validFrom or validTo might be null/undefined
    if (!notam.validFrom) {
      console.warn(`⚠️ NOTAM ${notam.number} has no validFrom date`);
      return 'unknown';
    }

    // Handle PERM dates properly
    if (notam.validTo === 'PERMANENT' || notam.validTo === 'PERM' || !notam.validTo) {
      try {
        const validFrom = new Date(notam.validFrom);
        if (isNaN(validFrom.getTime())) {
          console.warn(`⚠️ NOTAM ${notam.number} has invalid validFrom for PERM NOTAM`);
          return 'unknown';
        }
        return validFrom > now ? 'future' : 'active';
      } catch (error) {
        console.error(`❌ Error processing PERM NOTAM ${notam.number}:`, error);
        return 'unknown';
      }
    }
    
    try {
      const validFrom = new Date(notam.validFrom);
      const validTo = new Date(notam.validTo);
      
      if (isNaN(validFrom.getTime()) || isNaN(validTo.getTime())) {
        console.warn(`⚠️ NOTAM ${notam.number} has invalid date(s):`, {
          validFrom: notam.validFrom,
          validTo: notam.validTo,
          validFromValid: !isNaN(validFrom.getTime()),
          validToValid: !isNaN(validTo.getTime())
        });
        return 'unknown';
      }
      
      if (validFrom > now) return 'future';
      if (validTo < now) return 'expired';
      return 'active';
      
    } catch (error) {
      console.error(`❌ Error calculating time status for NOTAM ${notam.number}:`, error);
      return 'unknown';
    }
  };

  const timeStatus = getTimeStatus();
  
  // Enhanced card classes with new NOTAM detection
  const cardClasses = `notam-card ${isVisible ? 'visible' : ''} ${notam.isNew ? 'is-new' : ''} auto-sized`;

  const copyToClipboard = async (e) => {
    e.stopPropagation();
    setCopyStatus('⏳');
    
    try {
      // Always copy the rawText which should now be in ICAO format
      const textToCopy = notam.rawText || notam.summary || 'NOTAM text not available';
      await navigator.clipboard.writeText(textToCopy);
      
      setCopyStatus('✅');
      console.log(`📋 Copied NOTAM ${notam.number} to clipboard`);
      
      setTimeout(() => {
        setCopyStatus('📋');
      }, 2000);
    } catch (err) {
      console.error('❌ Failed to copy NOTAM to clipboard:', err);
      setCopyStatus('❌');
      
      setTimeout(() => {
        setCopyStatus('📋');
      }, 2000);
    }
  };

  // Ensure we have the ICAO formatted text to display
  const displayText = notam.rawText || notam.summary || 'NOTAM text not available';
  
  // Apply keyword highlighting if enabled
  const highlightedText = keywordHighlightEnabled 
    ? highlightNotamKeywords(displayText, keywordCategories, true)
    : displayText;

  // Enhanced new NOTAM indicator with better animation
  const newNotamIndicator = notam.isNew && (
    <div className="new-notam-indicator">
      <span className="new-badge-text">NEW</span>
      <span className="new-badge-glow"></span>
    </div>
  );

  // Enhanced time status badge with unknown status handling
  const getTimeStatusDisplay = (status) => {
    switch (status) {
      case 'active': return { label: 'Active', class: 'active' };
      case 'future': return { label: 'Future', class: 'future' };
      case 'expired': return { label: 'Expired', class: 'expired' };
      case 'unknown': return { label: 'Unknown', class: 'unknown' };
      default: return { label: 'Unknown', class: 'unknown' };
    }
  };

  const statusDisplay = getTimeStatusDisplay(timeStatus);

  return (
    <div className={cardClasses} data-notam-id={notam.id} data-notam-number={notam.number}>
      {newNotamIndicator}
      
      {/* Debug panel for development */}
      {process.env.NODE_ENV === 'development' && dateDebugInfo && (
        <div className="notam-debug-panel" style={{
          position: 'absolute',
          top: '5px',
          right: '5px',
          background: 'rgba(0,0,0,0.8)',
          color: '#00ff00',
          fontSize: '10px',
          padding: '5px',
          borderRadius: '3px',
          zIndex: 100,
          fontFamily: 'monospace',
          maxWidth: '200px',
          overflow: 'hidden'
        }}>
          <div>Src: {dateDebugInfo.source}</div>
          <div>From: {dateDebugInfo.rawValidFrom}</div>
          <div>To: {dateDebugInfo.rawValidTo}</div>
          <div>Status: {timeStatus}</div>
        </div>
      )}
      
      <div className={`card-head ${headClass}`}>
        <div className="head-content">
          <span className="head-title">{headTitle}</span>
          {runways && (
            <span className="runway-info">
              <span className="runway-label">RWY</span>
              <span className="runway-numbers">{runways}</span>
            </span>
          )}
        </div>
        <div className="head-actions">
          <div className={`time-status-badge ${statusDisplay.class}`}>
            <div className={`status-dot ${statusDisplay.class}`}></div>
            <span>{statusDisplay.label}</span>
          </div>
          <button 
            className="copy-btn" 
            onClick={copyToClipboard}
            title="Copy ICAO formatted NOTAM"
            disabled={copyStatus !== '📋'}
          >
            {copyStatus}
          </button>
        </div>
      </div>

      <div className="notam-card-content">
        {/* Display the ICAO formatted text with keyword highlighting */}
        {keywordHighlightEnabled ? (
          <pre 
            className="notam-raw-text"
            dangerouslySetInnerHTML={{ __html: highlightedText }}
          />
        ) : (
          <pre className="notam-raw-text">
            {displayText}
          </pre>
        )}
        
        <div className="notam-meta">
          <div className="validity-info">
            <div className="validity-row">
              <span className="validity-label">From:</span>
              <span className="validity-value">{formatDate(notam.validFrom, 'display-from')}</span>
            </div>
            <div className="validity-row">
              <span className="validity-label">To:</span>
              <span className="validity-value">{formatDate(notam.validTo, 'display-to')}</span>
            </div>
            <div className="validity-row">
              <span className="validity-label">Source:</span>
              <span className="validity-value">{notam.source}</span>
            </div>
            {notam.number && notam.number !== 'N/A' && (
              <div className="validity-row">
                <span className="validity-label">Number:</span>
                <span className="validity-value">{notam.number}</span>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="card-glow"></div>
    </div>
  );
};

export default NotamCard;
