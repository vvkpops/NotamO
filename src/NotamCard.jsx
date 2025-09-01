import React, { useState } from 'react';
import { getHeadClass, getHeadTitle, extractRunways, needsExpansion, getNotamType } from './NotamUtils';

const NotamCard = ({ notam }) => {
  const [isExpanded, setIsExpanded] = useState(false);

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
      return new Date(dateStr).toLocaleString('en-GB', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + 'Z';
    } catch { return dateStr; }
  };

  const cardClasses = `glass notam-card notam-animate ${notamType} ${isExpanded ? 'expanded-card' : ''} ${!canExpand ? 'auto-sized' : ''}`;

  return (
    <div className={cardClasses} onClick={toggleExpand}>
      <div className={`card-head ${headClass}`}>
        <span>{headTitle}</span>
        {runways && <span className="text-lg font-extrabold tracking-widest">{runways}</span>}
      </div>

      <div className="notam-card-content">
        <div className="notam-head">
          {notam.number || "N/A"}
          <span className="text-base font-normal text-cyan-300 ml-2">{notam.source}</span>
        </div>
        
        <div className="notam-meta">
          <span><b>Valid:</b> {formatDate(notam.validFrom)} → {formatDate(notam.validTo)}</span>
        </div>
        
        <div className={isExpanded || !canExpand ? "notam-full-text" : "notam-summary"}>
          {notam.summary}
        </div>
        
        {canExpand && (
          <button 
            className="card-expand-btn" 
            title={isExpanded ? 'Collapse' : 'Expand'}
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand();
            }}
          >
            <i className="fa fa-angle-down"></i>
          </button>
        )}
      </div>
    </div>
  );
};

export default NotamCard;
