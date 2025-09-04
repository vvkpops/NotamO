import React, { useState, useEffect } from 'react';
import { 
  getHeadClass, 
  getHeadTitle, 
  extractRunways, 
  parseDate, 
  formatDateForDisplay,
  getRelativeTime,
  getNotamTimeStatus,
  isNotamCurrent,
  isNotamFuture,
  isNotamExpired
} from './NotamUtils';
import { highlightNotamKeywords } from './NotamKeywordHighlight.jsx';

const NotamCard = ({ 
  notam, 
  keywordHighlightEnabled = false, 
  keywordCategories = {} 
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [copyStatus, setCopyStatus] = useState('📋');
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    // Trigger entrance animation
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Update current time every minute for accurate status
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  const headClass = getHeadClass(notam);
  const headTitle = getHeadTitle(notam);
  
  // Use rawText for runway extraction to be consistent
  const runways = extractRunways(notam.rawText);
  
  /**
   * Enhanced date formatting with comprehensive handling
   */
  const formatDate = (dateStr, options = {}) => {
    const {
      showRelative = false,
      showSeconds = false,
      compact = false
    } = options;

    if (!dateStr) return 'N/A';
    
    // Handle permanent dates
    const upperDate = String(dateStr).toUpperCase();
    if (['PERM', 'PERMANENT', 'PERMAMENT'].includes(upperDate)) {
      return 'PERMANENT';
    }

    try {
      // Parse the date using our enhanced parser
      const parsedDate = parseDate(dateStr);
      if (!parsedDate) {
        // Fallback: try to display original string if parsing fails
        return String(dateStr);
      }

      // Show relative time if requested and date is within reasonable range
      if (showRelative) {
        const now = new Date();
        const diffHours = Math.abs(parsedDate - now) / (1000 * 60 * 60);
        
        if (diffHours < 48) { // Show relative for dates within 48 hours
          const relative = getRelativeTime(parsedDate, now);
          if (relative && relative !== '') {
            return relative;
          }
        }
      }

      // Standard formatting
      return formatDateForDisplay(parsedDate, {
        showSeconds,
        showTimezone: true,
        format: compact ? 'compact' : 'standard'
      });

    } catch (error) {
      console.warn(`Error formatting date: ${dateStr}`, error);
      return String(dateStr);
    }
  };

  /**
   * Get comprehensive time status with enhanced logic
   */
  const getTimeStatus = () => {
    try {
      // Use the enhanced time status function
      const status = getNotamTimeStatus(notam, currentTime);
      
      // Additional validation for edge cases
      if (status === 'unknown') {
        // Try to determine status with basic checks
        if (!notam.validFrom) return 'unknown';
        
        const validFrom = parseDate(notam.validFrom);
        if (!validFrom) return 'unknown';
        
        if (currentTime < validFrom) return 'future';
        
        // If no valid-to date, assume active if started
        if (!notam.validTo || notam.validTo === 'PERMANENT') {
          return 'active';
        }
        
        const validTo = parseDate(notam.validTo);
        if (validTo && currentTime > validTo) return 'expired';
        
        return 'active';
      }
      
      return status;
    } catch (error) {
      console.warn('Error determining time status:', error);
      return 'unknown';
    }
  };

  const timeStatus = getTimeStatus();
  
  // Enhanced card classes with new NOTAM detection and status
  const cardClasses = `notam-card ${isVisible ? 'visible' : ''} ${notam.isNew ? 'is-new' : ''} ${timeStatus} auto-sized`;

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

  /**
   * Get status badge properties
   */
  const getStatusBadgeProps = () => {
    const baseProps = {
      className: `time-status-badge ${timeStatus}`,
    };

    switch (timeStatus) {
      case 'active':
        return {
          ...baseProps,
          title: `Active NOTAM - Valid from ${formatDate(notam.validFrom)} to ${formatDate(notam.validTo)}`,
          text: 'Active',
          icon: '🟢'
        };
      case 'future':
        return {
          ...baseProps,
          title: `Future NOTAM - Starts ${formatDate(notam.validFrom, { showRelative: true })}`,
          text: 'Future',
          icon: '🔵'
        };
      case 'expired':
        return {
          ...baseProps,
          title: `Expired NOTAM - Ended ${formatDate(notam.validTo, { showRelative: true })}`,
          text: 'Expired',
          icon: '🔴'
        };
      default:
        return {
          ...baseProps,
          title: 'NOTAM status unknown',
          text: 'Unknown',
          icon: '⚪'
        };
    }
  };

  const statusBadge = getStatusBadgeProps();

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
          <div className={statusBadge.className} title={statusBadge.title}>
            <div className={`status-dot ${timeStatus}`}></div>
            <span>{statusBadge.text}</span>
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
              <span 
                className="validity-value" 
                title={formatDate(notam.validFrom, { showRelative: true })}
              >
                {formatDate(notam.validFrom)}
              </span>
            </div>
            <div className="validity-row">
              <span className="validity-label">To:</span>
              <span 
                className="validity-value"
                title={notam.validTo === 'PERMANENT' ? 'This NOTAM has no expiration date' : formatDate(notam.validTo, { showRelative: true })}
              >
                {formatDate(notam.validTo)}
              </span>
            </div>
            <div className="validity-row">
              <span className="validity-label">Source:</span>
              <span className="validity-value">{notam.source || 'Unknown'}</span>
            </div>
            {notam.number && notam.number !== 'N/A' && (
              <div className="validity-row">
                <span className="validity-label">Number:</span>
                <span className="validity-value">{notam.number}</span>
              </div>
            )}
            {/* Show additional status information */}
            <div className="validity-row">
              <span className="validity-label">Status:</span>
              <span className={`validity-value status-${timeStatus}`}>
                {timeStatus.charAt(0).toUpperCase() + timeStatus.slice(1)}
                {timeStatus === 'active' && notam.validTo !== 'PERMANENT' && (
                  <span className="status-detail">
                    {' '}({getRelativeTime(parseDate(notam.validTo), currentTime)} remaining)
                  </span>
                )}
                {timeStatus === 'future' && (
                  <span className="status-detail">
                    {' '}(starts {getRelativeTime(parseDate(notam.validFrom), currentTime)})
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
      
      <div className="card-glow"></div>
    </div>
  );
};

export default NotamCard;
