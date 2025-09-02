import React, { useState, useEffect } from 'react';
import { getHeadClass, getHeadTitle, extractRunways } from './NotamUtils';

const NotamCard = ({ notam }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const headClass = getHeadClass(notam);
  const headTitle = getHeadTitle(notam);
  
  // Use rawText for runway extraction to be consistent
  const runways = extractRunways(notam.rawText);
  
  const formatDate = (dateStr) => {
    if (!dateStr || dateStr === 'PERMANENT' || dateStr === 'PERM') return 'PERM';
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('en-GB', { 
        timeZone: 'UTC', 
        year: 'numeric', 
        month: 'short', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit' 
      }) + 'Z';
    } catch { 
      return dateStr; 
    }
  };

  const getTimeStatus = () => {
    const now = new Date();
    
    // Handle PERM dates properly
    if (notam.validTo === 'PERMANENT' || notam.validTo === 'PERM') {
      const validFrom = new Date(notam.validFrom);
      return validFrom > now ? 'future' : 'active';
    }
    
    const validFrom = new Date(notam.validFrom);
    const validTo = new Date(notam.validTo);
    
    if (validFrom > now) return 'future';
    if (validTo < now) return 'expired';
    return 'active';
  };

  const timeStatus = getTimeStatus();
  const cardClasses = `notam-card ${isVisible ? 'visible' : ''} auto-sized`;

  const copyToClipboard = async (e) => {
    e.stopPropagation();
    try {
      // Always copy the rawText which should now be in ICAO format
      await navigator.clipboard.writeText(notam.rawText);
      e.target.textContent = '✓ Copied!';
      setTimeout(() => {
        e.target.textContent = '📋';
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      e.target.textContent = '❌';
      setTimeout(() => {
        e.target.textContent = '📋';
      }, 2000);
    }
  };

  // Ensure we have the ICAO formatted text to display
  const displayText = notam.rawText || notam.summary || 'NOTAM text not available';

  return (
    <div className={cardClasses}>
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
          <div className={`time-status-badge ${timeStatus}`}>
            <div className={`status-dot ${timeStatus}`}></div>
            <span>{timeStatus === 'active' ? 'Active' : timeStatus === 'future' ? 'Future' : 'Expired'}</span>
          </div>
          <button 
            className="copy-btn" 
            onClick={copyToClipboard}
            title="Copy ICAO formatted NOTAM"
          >
            📋
          </button>
        </div>
      </div>

      <div className="notam-card-content">
        {/* Display the ICAO formatted text */}
        <pre className="notam-raw-text">
          {displayText}
        </pre>
        
        <div className="notam-meta">
          <div className="validity-info">
            <div className="validity-row">
              <span className="validity-label">From:</span>
              <span className="validity-value">{formatDate(notam.validFrom)}</span>
            </div>
            <div className="validity-row">
              <span className="validity-label">To:</span>
              <span className="validity-value">{formatDate(notam.validTo)}</span>
            </div>
            <div className="validity-row">
              <span className="validity-label">Source:</span>
              <span className="validity-value">{notam.source}</span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="card-glow"></div>
    </div>
  );
};

export default NotamCard;
