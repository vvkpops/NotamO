/**
 * Enhanced NotamCard with integrated translation
 * Drop-in replacement for your existing NotamCard
 */

import React, { useState, useEffect } from 'react';
import { getHeadClass, getHeadTitle, extractRunways } from '../NotamUtils';
import { highlightNotamKeywords } from '../NotamKeywordHighlight.jsx';
import NotamTranslationButton from './NotamTranslationButton.jsx';

const NotamCardWithTranslation = ({ 
  notam, 
  keywordHighlightEnabled = false, 
  keywordCategories = {},
  enableTranslation = true 
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

  // Your existing date formatting and status logic...
  const formatDisplayDate = (rawDate, fallbackDate) => {
    // ... (same as your existing implementation)
  };

  const getTimeStatus = () => {
    // ... (same as your existing implementation)
  };

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

  const timeStatus = getTimeStatus();
  const cardClasses = `notam-card ${isVisible ? 'visible' : ''} ${notam.isNew ? 'is-new' : ''} auto-sized`;

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
        
        {/* Translation Component */}
        {enableTranslation && (
          <NotamTranslationButton 
            notam={notam}
            className="card-translate-btn"
          />
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

export default NotamCardWithTranslation;