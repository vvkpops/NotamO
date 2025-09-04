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

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const headClass = getHeadClass(notam);
  const headTitle = getHeadTitle(notam);
  const runways = extractRunways(notam.rawText);

  // Formats a date string, prioritizing the raw value from the NOTAM text.
  const formatDisplayDate = (rawDate, fallbackDate) => {
    if (rawDate) {
      const upperRawDate = rawDate.toUpperCase();
      // Check if a known timezone is already in the string
      const hasTimeZone = /\b(UTC|GMT|Z|ZULU|EST|EDT|CST|CDT|MST|MDT|PST|PDT)\b/.test(upperRawDate);
      if (upperRawDate === 'PERM' || upperRawDate === 'PERMANENT') {
        return 'PERM';
      }
      // If it's just the 10 digits, it's Zulu. Append 'ZULU'.
      if (/^\d{10}$/.test(rawDate)) {
        return `${rawDate} ZULU`;
      }
      // If no explicit timezone, assume Zulu.
      if (!hasTimeZone) {
        return `${rawDate} ZULU`;
      }
      return rawDate;
    }

    // Fallback for FAA NOTAMs or if raw parsing fails
    if (!fallbackDate || fallbackDate === 'PERMANENT' || fallbackDate === 'PERM') return 'PERM';
    try {
      const date = new Date(fallbackDate);
      return date.toLocaleString('en-GB', { 
        timeZone: 'UTC', 
        year: 'numeric', 
        month: 'short', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit' 
      }) + 'Z';
    } catch { 
      return fallbackDate; 
    }
  };

  const getTimeStatus = () => {
    const now = new Date();

    // Treat PERM/missing validTo as non-expiring
    if (!notam.validTo || notam.validTo === 'PERMANENT' || notam.validTo === 'PERM') {
      const vf = new Date(notam.validFrom);
      if (!notam.validFrom || isNaN(vf.getTime())) return 'active';
      return vf > now ? 'future' : 'active';
    }

    const validFrom = new Date(notam.validFrom);
    const validTo = new Date(notam.validTo);

    if (!isNaN(validFrom.getTime()) && validFrom > now) return 'future';
    // If validTo is invalid/missing, don't mark as expired
    if (isNaN(validTo.getTime())) return 'active';
    if (validTo < now) return 'expired';
    return 'active';
  };

  const timeStatus = getTimeStatus();
  const cardClasses = `notam-card ${isVisible ? 'visible' : ''} ${notam.isNew ? 'is-new' : ''} auto-sized`;

  const copyToClipboard = async (e) => {
    e.stopPropagation();
    setCopyStatus('⏳');
    try {
      const textToCopy = notam.rawText || notam.summary || 'NOTAM text not available';
      await navigator.clipboard.writeText(textToCopy);
      setCopyStatus('✅');
      setTimeout(() => setCopyStatus('📋'), 2000);
    } catch (err) {
      console.error('❌ Failed to copy NOTAM to clipboard:', err);
      setCopyStatus('❌');
      setTimeout(() => setCopyStatus('📋'), 2000);
    }
  };

  const displayText = notam.rawText || notam.summary || 'NOTAM text not available';
  const highlightedText = keywordHighlightEnabled 
    ? highlightNotamKeywords(displayText, keywordCategories, true)
    : displayText;

  const newNotamIndicator = notam.isNew && (
    <div className="new-notam-indicator">
      <span className="new-badge-text">NEW</span>
      <span className="new-badge-glow"></span>
    </div>
  );

  return (
    <div className={cardClasses} data-notam-id={notam.id} data-notam-number={notam.number}>
      {newNotamIndicator}
      
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
            disabled={copyStatus !== '📋'}
          >
            {copyStatus}
          </button>
        </div>
      </div>

      <div className="notam-card-content">
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
              <span className="validity-value">{formatDisplayDate(notam.validFromRaw, notam.validFrom)}</span>
            </div>
            <div className="validity-row">
              <span className="validity-label">To:</span>
              <span className="validity-value">{formatDisplayDate(notam.validToRaw, notam.validTo)}</span>
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
