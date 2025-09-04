import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

const NotamModal = ({ isOpen, onClose, icao, notamData, loading, error }) => {
  const modalRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.classList.add('modal-open');
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.body.classList.remove('modal-open');
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const formatDate = (dateStr) => {
    if (!dateStr || dateStr === 'PERMANENT') return dateStr || 'N/A';
    try {
      return new Date(dateStr).toLocaleString('en-GB', { timeZone: 'UTC' }) + ' UTC';
    } catch { return dateStr; }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).catch(err => console.error('Failed to copy:', err));
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-gray-900 bg-opacity-70 backdrop-blur-sm flex justify-center items-center z-50 p-4">
      <div ref={modalRef} className="bg-gray-800 rounded-xl shadow-2xl border border-gray-600 w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-gray-700">
          <h3 className="text-2xl font-bold text-cyan-400">NOTAMs for {icao}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-4xl">&times;</button>
        </div>
        <div className="overflow-y-auto p-6 space-y-4">
          {loading ? <p>Loading...</p> :
           error ? <p className="text-red-400">Error: {error}</p> :
           notamData && notamData.length > 0 ? (
            notamData.map((notam, index) => (
              <div key={notam.id || index} className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="font-bold text-orange-400">{notam.number} <span className="text-xs text-gray-500">({notam.source || 'FAA'})</span></p>
                        <p className="text-xs text-gray-400">Valid: {formatDate(notam.validFrom)} to {formatDate(notam.validTo)}</p>
                    </div>
                    <button onClick={() => copyToClipboard(notam.summary)} className="text-xs bg-gray-600 px-2 py-1 rounded hover:bg-gray-500">Copy</button>
                </div>
                <p className="mt-2 text-sm whitespace-pre-wrap font-mono">{notam.summary}</p>
              </div>
            ))
           ) : <p>No NOTAMs found for {icao}.</p>
          }
        </div>
        <div className="p-4 border-t border-gray-700 text-center text-xs text-gray-500">
          Always verify with official sources before flight.
        </div>
      </div>
    </div>,
    document.getElementById('modal-root')
  );
};

export default NotamModal;
