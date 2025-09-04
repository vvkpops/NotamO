import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

const NotamHistoryModal = ({ isOpen, onClose, history, onClearHistory }) => {
  const modalRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        onClose();
      }
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'auto';
    };
  }, [isOpen, onClose]);

  const formatDate = (dateStr) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    } catch {
      return 'Invalid Date';
    }
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="nh-backdrop">
      <div ref={modalRef} className="nh-modal">
        <div className="nh-header">
          <div className="nh-title">
            <span className="nh-icon">📜</span>
            <div>
              <h3>New NOTAM History</h3>
              <p>A log of newly detected NOTAMs from recent fetches.</p>
            </div>
          </div>
          <button onClick={onClose} className="nh-close-btn">✕</button>
        </div>

        <div className="nh-content">
          {history.length > 0 ? (
            <div className="nh-list">
              {history.map(item => (
                <div key={item.id} className="nh-item">
                  <div className="nh-item-header">
                    <span className="nh-item-icao">{item.icao}</span>
                    <span className="nh-item-timestamp">{formatDate(item.timestamp)}</span>
                    <span className="nh-item-count">{item.count} new</span>
                  </div>
                  <div className="nh-item-body">
                    {item.notams.map((notam, index) => (
                      <div key={index} className="nh-notam-preview">
                        <span className="nh-notam-number">{notam.number}</span>
                        <p className="nh-notam-summary">{notam.summary}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="nh-empty-state">
              <span className="nh-empty-icon">📭</span>
              <h4>No New NOTAMs Logged</h4>
              <p>This history will populate when new NOTAMs are detected during a refresh.</p>
            </div>
          )}
        </div>

        <div className="nh-footer">
          <button 
            onClick={onClearHistory} 
            className="nh-clear-btn" 
            disabled={history.length === 0}
          >
            Clear History
          </button>
          <button onClick={onClose} className="nh-done-btn">
            Done
          </button>
        </div>
      </div>
    </div>,
    document.getElementById('modal-root')
  );
};

export default NotamHistoryModal;