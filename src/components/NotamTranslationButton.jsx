/**
 * NOTAM Translation Button Component
 * Integrates with existing NotamCard for plain English translation
 */

import React, { useState } from 'react';

const NotamTranslationButton = ({ notam, className = '' }) => {
  const [translation, setTranslation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [error, setError] = useState(null);

  const translateNotam = async () => {
    if (translation) {
      setShowTranslation(!showTranslation);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/translate-notam', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notamText: notam.rawText || notam.summary,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      setTranslation(result);
      setShowTranslation(true);

    } catch (err) {
      console.error('Translation failed:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const getButtonText = () => {
    if (isLoading) return '🔄 Translating...';
    if (showTranslation) return '📄 Technical';
    return '🌐 Plain English';
  };

  const getButtonClass = () => {
    let baseClass = `translate-btn ${className}`;
    
    if (isLoading) baseClass += ' loading';
    if (error) baseClass += ' error';
    if (showTranslation) baseClass += ' active';
    
    return baseClass;
  };

  return (
    <div className="notam-translation-wrapper">
      <button 
        onClick={translateNotam}
        disabled={isLoading}
        className={getButtonClass()}
        title={translation ? `Confidence: ${Math.round(translation.confidence * 100)}%` : 'Translate to plain English'}
      >
        {getButtonText()}
      </button>

      {showTranslation && translation && (
        <div className="translation-result">
          <div className="translation-header">
            <h4>Plain English:</h4>
            <div className="translation-meta">
              <span className={`method-badge method-${translation.method}`}>
                {translation.method?.toUpperCase() || 'AI'}
              </span>
              {translation.confidence && (
                <span className="confidence-badge">
                  {Math.round(translation.confidence * 100)}% confidence
                </span>
              )}
              {translation.severity && (
                <span className={`severity-badge severity-${translation.severity}`}>
                  {translation.severity.toUpperCase()}
                </span>
              )}
            </div>
          </div>
          
          <div className="translation-text">
            {translation.translation || translation.result}
          </div>

          {translation.processingTime && (
            <div className="translation-footer">
              <small>Processed in {translation.processingTime}ms</small>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="translation-error">
          <p>⚠️ Translation failed: {error}</p>
          <button 
            onClick={() => setError(null)}
            className="error-dismiss-btn"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
};

export default NotamTranslationButton;
