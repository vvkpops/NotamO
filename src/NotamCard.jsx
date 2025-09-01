import React from 'react';

const NotamCard = ({ notam }) => {

  const formatDate = (dateStr) => {
    if (!dateStr || dateStr === 'PERMANENT') return dateStr || 'N/A';
    try {
      return new Date(dateStr).toLocaleString('en-GB', { timeZone: 'UTC' }) + ' UTC';
    } catch { return dateStr; }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
      .then(() => alert('NOTAM summary copied to clipboard!'))
      .catch(err => console.error('Failed to copy:', err));
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 h-full flex flex-col">
      <div className="flex justify-between items-start mb-2">
        <div>
          <p className="font-bold text-lg text-orange-400">{notam.number}</p>
          <p className="text-xs text-gray-500">Source: {notam.source || 'FAA'}</p>
        </div>
        <button 
          onClick={() => copyToClipboard(notam.summary)} 
          className="text-xs bg-gray-600 px-2 py-1 rounded hover:bg-gray-500 transition-colors"
          title="Copy summary to clipboard"
        >
          Copy
        </button>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        From: {formatDate(notam.validFrom)}<br/>
        To: {formatDate(notam.validTo)}
      </p>
      <p className="text-sm whitespace-pre-wrap font-mono flex-grow">{notam.summary}</p>
    </div>
  );
};

export default NotamCard;
