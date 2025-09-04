import React, { useState, useEffect } from 'react';
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

  const {
    headClass,
    headTitle,
    runways,
    timeStatus,
    displayValidFrom,
    displayValidTo,
    icaoFormattedText
  } = notam.cardData;
  
  const cardClasses = `notam-card ${isVisible ? 'visible' : ''} ${notam.isNew ? 'is-new' : ''} auto-sized`;

  const copyToClipboard = async (e) => {
    e.stopPropagation();
    setCopyStatus('⏳');
    try {
      await navigator.clipboard.writeText(icaoFormattedText);
      setCopyStatus('✅');
      setTimeout(() => setCopyStatus('📋'), 2000);
    } catch (err) {
      console.error('❌ Failed to copy NOTAM to clipboard:', err);
      setCopyStatus('❌');
      setTimeout(() => setCopyStatus('📋'), 2000);
    }
  };

  const highlightedText = keywordHighlightEnabled 
    ? highlightNotamKeywords(icaoFormattedText, keywordCategories, true)
    : icaoFormattedText;

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
            <span>{timeStatus}</span>
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
            {icaoFormattedText}
          </pre>
        )}
        
        <div className="notam-meta">
          <div className="validity-info">
            <div className="validity-row">
              <span className="validity-label">From:</span>
              <span className="validity-value">{displayValidFrom}</span>
            </div>
            <div className="validity-row">
              <span className="validity-label">To:</span>
              <span className="validity-value">{displayValidTo}</span>
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