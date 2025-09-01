import React, { useState, useEffect } from 'react';
import { getHeadClass, getHeadTitle, extractRunways, needsExpansion, getNotamType } from './NotamUtils';

const NotamCard = ({ notam }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const headClass = getHeadClass(notam);
  const headTitle = getHeadTitle(notam);
  const notamType = getNotamType(notam);
  const runways = notamType === "rwy" ? extractRunways(notam.summary) : "";
  const canExpand = needsExpansion(notam.summary);

  const toggleExpand = () => {
    if (canExpand) {
      setIsExpanded(!isExpanded);
    }
  };
  
  const formatDate = (dateStr) => {
    if (!dateStr || dateStr === 'PERMANENT') return dateStr || 'N/A';
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
    const validFrom = new Date(notam.validFrom);
    const validTo = notam.validTo === 'PERMANENT' ? null : new Date(notam.validTo);
    
    if (validFrom > now) return 'future';
    if (validTo && validTo < now) return 'expired';
    return 'active';
  };

  const timeStatus = getTimeStatus();
  const cardClasses = `notam-card ${notamType} ${isExpanded ? 'expanded-card' : ''} ${!canExpand ? 'auto-sized' : ''} ${isVisible ? 'visible' : ''} time-${timeStatus}`;

  const copyToClipboard = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(notam.summary);
      // Show success feedback
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

  return (
    <div className={cardClasses} onClick={toggleExpand}>
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
          <span className={`time-badge time-${timeStatus}`}>
            {timeStatus === 'active' ? '🟢' : timeStatus === 'future' ? '🟡' : '🔴'}
          </span>
          <button 
            className="copy-btn" 
            onClick={copyToClipboard}
            title="Copy NOTAM text"
          >
            📋
          </button>
        </div>
      </div>

      <div className="notam-card-content">
        <div className="notam-header-info">
          <div className="notam-id">
            <span className="notam-number">{notam.number || "N/A"}</span>
            <span className="notam-source">{notam.source}</span>
          </div>
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
          </div>
        </div>
        
        <div className={isExpanded || !canExpand ? "notam-full-text" : "notam-summary"}>
          {notam.summary}
        </div>
        
        {canExpand && (
          <button 
            className={`card-expand-btn ${isExpanded ? 'expanded' : ''}`}
            title={isExpanded ? 'Collapse' : 'Expand'}
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand();
            }}
          >
            <svg 
              className="expand-icon" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
            >
              <polyline points={isExpanded ? "18,15 12,9 6,15" : "6,9 12,15 18,9"}></polyline>
            </svg>
          </button>
        )}
      </div>
      
      <div className="card-glow"></div>
    </div>
  );
};

export default NotamCard;
