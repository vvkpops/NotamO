/**
 * Minimal NOTAM Translation Button - integrates seamlessly with existing design
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notamText: notam.rawText || notam.summary }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

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

  return (
    <>
      {/* Small translate button in card header - matches copy button style */}
      <button 
        onClick={translateNotam}
        disabled={isLoading}
        className={`copy-btn ${className}`}
        title={translation ? `Toggle translation (${Math.round((translation.confidence || 0.8) * 100)}% confidence)` : 'Translate to plain English'}
        style={{ marginLeft: '0.5rem' }}
      >
        {isLoading ? '⏳' : showTranslation ? '📄' : '🌐'}
      </button>

      {/* Translation overlay - only shows when toggled */}
      {showTranslation && translation && (
        <div className="translation-overlay">
          <div className="translation-content">
            <div className="translation-header">
              <span className="translation-label">Plain English:</span>
              <div className="translation-badges">
                <span className={`method-badge method-${translation.method || 'ai'}`}>
                  {(translation.method || 'AI').toUpperCase()}
                </span>
                {translation.confidence && (
                  <span className="confidence-badge">
                    {Math.round(translation.confidence * 100)}%
                  </span>
                )}
              </div>
            </div>
            <div className="translation-text">
              {translation.translation}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="translation-error-mini">
          <p>⚠️ {error}</p>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}
    </>
  );
};

export default NotamTranslationButton;