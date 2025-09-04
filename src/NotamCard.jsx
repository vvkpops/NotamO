import React, { useState, useEffect } from 'react';
import { getHeadClass, getHeadTitle, extractRunways, parseNotamForDisplay } from './NotamUtils';
import { highlightNotamKeywords } from './NotamKeywordHighlight.jsx';

const NotamCard = ({ 
  notam, 
  keywordHighlightEnabled = false, 
  keywordCategories = {} 
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [copyStatus, setCopyStatus] = useState('📋');

  useEffect(() => {
    // Trigger entrance animation
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const headClass = getHeadClass(notam);
  const headTitle = getHeadTitle(notam);
  const runways = extractRunways(notam.rawText);
  
  // Use the new parser for display
  const parsedNotam = parseNotamForDisplay(notam.rawText);

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

  const newNotamIndicator = notam.isNew && (
    <div className="new-notam-indicator">
      <span className="new-badge-text">NEW</span>
      <span className="new-badge-glow"></span>
    </div>
  );

  const renderField = (label, value) => {
    if (!value) return null;
    const highlightedValue = keywordHighlightEnabled 
      ? highlightNotamKeywords(value, keywordCategories, true)
      : value;

    return (
      <div className="notam-field">
        <div className="notam-field-label">{label}</div>
        {keywordHighlightEnabled ? (
          <div className="notam-field-value" dangerouslySetInnerHTML={{ __html: highlightedValue }}></div>
        ) : (
          <div className="notam-field-value">{value}</div>
        )}
      </div>
    );
  };

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

      <div className="notam-card-content structured">
        <div className="structured-notam-display">
          {renderField('Q', parsedNotam.qLine)}
          {renderField('A', parsedNotam.aerodrome)}
          {renderField('B', parsedNotam.validFromRaw)}
          {renderField('C', parsedNotam.validToRaw)}
          {renderField('D', parsedNotam.schedule)}
          {renderField('E', parsedNotam.body)}
        </div>
        
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
