// NotamKeywordHighlight.jsx - Keyword highlighting feature for NOTAM data
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

// Color options for custom categories
const COLOR_OPTIONS = [
  { name: 'Red', bg: 'bg-red-500', text: 'text-white', css: 'notam-highlight-red' },
  { name: 'Orange', bg: 'bg-orange-500', text: 'text-white', css: 'notam-highlight-orange' },
  { name: 'Yellow', bg: 'bg-yellow-500', text: 'text-black', css: 'notam-highlight-yellow' },
  { name: 'Green', bg: 'bg-green-500', text: 'text-white', css: 'notam-highlight-green' },
  { name: 'Blue', bg: 'bg-blue-500', text: 'text-white', css: 'notam-highlight-blue' },
  { name: 'Purple', bg: 'bg-purple-500', text: 'text-white', css: 'notam-highlight-purple' },
  { name: 'Pink', bg: 'bg-pink-500', text: 'text-white', css: 'notam-highlight-pink' },
  { name: 'Cyan', bg: 'bg-cyan-500', text: 'text-black', css: 'notam-highlight-cyan' },
  { name: 'Gray', bg: 'bg-gray-500', text: 'text-white', css: 'notam-highlight-gray' },
  { name: 'Indigo', bg: 'bg-indigo-500', text: 'text-white', css: 'notam-highlight-indigo' }
];

// Default NOTAM keyword categories
export const DEFAULT_NOTAM_KEYWORDS = {
  critical: {
    name: 'Critical Operations',
    color: 'notam-highlight-red',
    textColor: 'text-white',
    keywords: ['CLOSED', 'CLO', 'CLSD', 'OUT OF SERVICE', 'U/S', 'UNSERVICEABLE', 'DANGEROUS', 'HAZARD', 'OBSTRUCTION', 'OBST'],
    enabled: true,
    custom: false
  },
  runway: {
    name: 'Runway Operations',
    color: 'notam-highlight-orange',
    textColor: 'text-white',
    keywords: ['RWY', 'RUNWAY', 'DISPLACED', 'DISPL', 'THR', 'THRESHOLD', 'TODA', 'TORA', 'ASDA', 'LDA', 'STOP', 'STOPWAY'],
    enabled: true,
    custom: false
  },
  navigation: {
    name: 'Navigation & ILS',
    color: 'notam-highlight-blue',
    textColor: 'text-white',
    keywords: ['ILS', 'LOC', 'LOCALIZER', 'GS', 'GLIDESLOPE', 'VOR', 'DME', 'NDB', 'TACAN', 'GPS', 'RNAV', 'WAAS', 'PAPI', 'VASI'],
    enabled: true,
    custom: false
  },
  lighting: {
    name: 'Lighting Systems',
    color: 'notam-highlight-green',
    textColor: 'text-white',
    keywords: ['LGT', 'LIGHTS', 'LIGHTING', 'ALS', 'ALSF', 'MALSR', 'ODALS', 'RAIL', 'REIL', 'HIRL', 'MIRL', 'LIRL', 'EDGE'],
    enabled: true,
    custom: false
  },
  surface: {
    name: 'Surface Conditions',
    color: 'notam-highlight-purple',
    textColor: 'text-white',
    keywords: ['RSC', 'CRFI', 'FRICTION', 'ICE', 'SNOW', 'SLUSH', 'WET', 'DRY', 'COMPACTED', 'BRAKING', 'SURFACE', 'CONTAMINATED'],
    enabled: true,
    custom: false
  },
  construction: {
    name: 'Construction & Maintenance',
    color: 'notam-highlight-yellow',
    textColor: 'text-black',
    keywords: ['WORK', 'CONSTRUCTION', 'CONST', 'MAINT', 'MAINTENANCE', 'REPAIR', 'EQUIPMENT', 'VEHICLE', 'CRANE', 'MACHINERY'],
    enabled: true,
    custom: false
  },
  taxiway: {
    name: 'Taxiway Operations',
    color: 'notam-highlight-cyan',
    textColor: 'text-black',
    keywords: ['TWY', 'TAXIWAY', 'TAXI', 'APRON', 'RAMP', 'GATE', 'STAND', 'PUSHBACK', 'TOW', 'GROUND'],
    enabled: true,
    custom: false
  },
  fuel: {
    name: 'Fuel Services',
    color: 'notam-highlight-pink',
    textColor: 'text-white',
    keywords: ['FUEL', 'AVGAS', 'JET A', 'JET A1', '100LL', 'REFUEL', 'BOWSER', 'HYDRANT', 'PUMP', 'TANK'],
    enabled: true,
    custom: false
  }
};

// Main NotamKeywordHighlightManager component
const NotamKeywordHighlightManager = ({ 
  isOpen, 
  onClose, 
  keywordCategories, 
  setKeywordCategories,
  keywordHighlightEnabled,
  setKeywordHighlightEnabled
}) => {
  const modalRef = useRef(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(COLOR_OPTIONS[0]);
  const [newKeywords, setNewKeywords] = useState('');

  // Modal event handlers
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
      document.body.classList.add('modal-open');
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      document.body.classList.remove('modal-open');
    };
  }, [isOpen, onClose]);

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) return;

    const categoryId = newCategoryName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const keywords = newKeywords
      .split(/[,\s]+/)
      .map(k => k.trim().toUpperCase())
      .filter(k => k.length > 0);

    if (keywords.length === 0) return;

    setKeywordCategories(prev => ({
      ...prev,
      [categoryId]: {
        name: newCategoryName.trim(),
        color: newCategoryColor.css,
        textColor: newCategoryColor.text,
        keywords: keywords,
        enabled: true,
        custom: true
      }
    }));

    setNewCategoryName('');
    setNewKeywords('');
    setNewCategoryColor(COLOR_OPTIONS[0]);
  };

  const handleDeleteCategory = (categoryId) => {
    setKeywordCategories(prev => {
      const newCategories = { ...prev };
      delete newCategories[categoryId];
      return newCategories;
    });
  };

  const handleToggleCategory = (categoryId) => {
    setKeywordCategories(prev => ({
      ...prev,
      [categoryId]: {
        ...prev[categoryId],
        enabled: !prev[categoryId].enabled
      }
    }));
  };

  const handleUpdateKeywords = (categoryId, keywordsString) => {
    const keywords = keywordsString
      .split(/[,\s]+/)
      .map(k => k.trim().toUpperCase())
      .filter(k => k.length > 0);

    setKeywordCategories(prev => ({
      ...prev,
      [categoryId]: {
        ...prev[categoryId],
        keywords: keywords
      }
    }));
  };

  const handleResetToDefaults = () => {
    setKeywordCategories({ ...DEFAULT_NOTAM_KEYWORDS });
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="filter-modal-backdrop">
      <div ref={modalRef} className="filter-modal">
        {/* Header */}
        <div className="filter-modal-header">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full flex items-center justify-center" 
                 style={{background: 'linear-gradient(135deg, #00d4ff 0%, #8b5cf6 100%)'}}>
              <span className="text-white font-bold text-lg">🎯</span>
            </div>
            <div>
              <h3 className="text-xl font-bold text-cyan-400">NOTAM Keyword Highlighting</h3>
              <p className="text-gray-400 text-sm">Highlight important aviation terms in NOTAM text</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="filter-modal-close"
          >
            ✕
          </button>
        </div>

        <div className="filter-modal-content">
          {/* Master Toggle */}
          <div className="filter-section">
            <div className="bg-gray-900 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-lg font-semibold text-cyan-300 mb-1">Enable NOTAM Keyword Highlighting</h4>
                  <p className="text-sm text-gray-400">Turn on/off all keyword highlighting in NOTAM text</p>
                </div>
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={keywordHighlightEnabled}
                    onChange={(e) => setKeywordHighlightEnabled(e.target.checked)}
                    className="sr-only"
                  />
                  <div className={`relative w-14 h-8 rounded-full transition-colors duration-200 ${
                    keywordHighlightEnabled ? 'bg-green-500' : 'bg-gray-600'
                  }`}>
                    <div className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform duration-200 ${
                      keywordHighlightEnabled ? 'translate-x-6' : 'translate-x-0'
                    }`} />
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Current Categories */}
          <div className="filter-section">
            <div className="bg-gray-900 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-semibold text-cyan-300">Keyword Categories</h4>
                <button
                  onClick={handleResetToDefaults}
                  className="bg-gray-600 hover:bg-gray-500 text-white px-3 py-1 rounded text-sm transition-colors"
                >
                  Reset to Defaults
                </button>
              </div>
              
              <div className="space-y-4">
                {Object.entries(keywordCategories).map(([categoryId, category]) => (
                  <div key={categoryId} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <label className="inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={category.enabled}
                            onChange={() => handleToggleCategory(categoryId)}
                            className="sr-only"
                          />
                          <div className={`relative w-10 h-6 rounded-full transition-colors duration-200 ${
                            category.enabled ? 'bg-green-500' : 'bg-gray-600'
                          }`}>
                            <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200 ${
                              category.enabled ? 'translate-x-4' : 'translate-x-0'
                            }`} />
                          </div>
                        </label>
                        <span className={`px-3 py-1 rounded-full text-sm font-bold ${category.color}`} 
                              style={{
                                backgroundColor: category.color.includes('red') ? '#ef4444' :
                                              category.color.includes('orange') ? '#f97316' :
                                              category.color.includes('yellow') ? '#eab308' :
                                              category.color.includes('green') ? '#22c55e' :
                                              category.color.includes('blue') ? '#3b82f6' :
                                              category.color.includes('purple') ? '#a855f7' :
                                              category.color.includes('pink') ? '#ec4899' :
                                              category.color.includes('cyan') ? '#06b6d4' :
                                              category.color.includes('gray') ? '#6b7280' :
                                              category.color.includes('indigo') ? '#6366f1' : '#6b7280',
                                color: category.color.includes('yellow') || category.color.includes('cyan') ? '#000' : '#fff'
                              }}>
                          {category.name}
                        </span>
                        <span className="text-gray-400 text-sm">
                          {category.keywords.length} keywords
                        </span>
                      </div>
                      {category.custom && (
                        <button
                          onClick={() => handleDeleteCategory(categoryId)}
                          className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    
                    <div className="mb-2">
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        Keywords (space or comma separated):
                      </label>
                      <textarea
                        value={category.keywords.join(' ')}
                        onChange={(e) => handleUpdateKeywords(categoryId, e.target.value)}
                        className="w-full bg-gray-700 text-white p-2 rounded text-sm font-mono"
                        rows="2"
                      />
                    </div>
                    
                    <div className="flex flex-wrap gap-1">
                      {category.keywords.slice(0, 10).map((keyword, idx) => (
                        <span
                          key={idx}
                          className={`px-2 py-1 rounded text-xs font-mono ${category.color}`}
                          style={{
                            backgroundColor: category.color.includes('red') ? '#ef4444' :
                                          category.color.includes('orange') ? '#f97316' :
                                          category.color.includes('yellow') ? '#eab308' :
                                          category.color.includes('green') ? '#22c55e' :
                                          category.color.includes('blue') ? '#3b82f6' :
                                          category.color.includes('purple') ? '#a855f7' :
                                          category.color.includes('pink') ? '#ec4899' :
                                          category.color.includes('cyan') ? '#06b6d4' :
                                          category.color.includes('gray') ? '#6b7280' :
                                          category.color.includes('indigo') ? '#6366f1' : '#6b7280',
                            color: category.color.includes('yellow') || category.color.includes('cyan') ? '#000' : '#fff'
                          }}
                        >
                          {keyword}
                        </span>
                      ))}
                      {category.keywords.length > 10 && (
                        <span className="text-gray-400 text-xs px-2 py-1">
                          +{category.keywords.length - 10} more
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Add New Category */}
          <div className="filter-section">
            <div className="bg-gray-900 rounded-lg p-4">
              <h4 className="text-lg font-semibold text-cyan-300 mb-4">Add Custom Category</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Category Name:
                  </label>
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    className="w-full bg-gray-700 text-white p-2 rounded"
                    placeholder="e.g., Custom NOTAM Alerts"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Color:
                  </label>
                  <select
                    value={COLOR_OPTIONS.findIndex(c => c.css === newCategoryColor.css)}
                    onChange={(e) => setNewCategoryColor(COLOR_OPTIONS[parseInt(e.target.value)])}
                    className="w-full bg-gray-700 text-white p-2 rounded"
                  >
                    {COLOR_OPTIONS.map((color, idx) => (
                      <option key={idx} value={idx}>{color.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Keywords (space or comma separated):
                </label>
                <textarea
                  value={newKeywords}
                  onChange={(e) => setNewKeywords(e.target.value)}
                  className="w-full bg-gray-700 text-white p-2 rounded font-mono"
                  rows="3"
                  placeholder="e.g., LLWS WS PIREP TURB MOD SEV"
                />
              </div>
              
              <div className="flex items-center gap-4">
                <button
                  onClick={handleAddCategory}
                  disabled={!newCategoryName.trim() || !newKeywords.trim()}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded transition-colors"
                >
                  Add Category
                </button>
                
                {newCategoryName && newKeywords && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-sm">Preview:</span>
                    <span className={`px-3 py-1 rounded text-sm font-bold`}
                          style={{
                            backgroundColor: newCategoryColor.css.includes('red') ? '#ef4444' :
                                          newCategoryColor.css.includes('orange') ? '#f97316' :
                                          newCategoryColor.css.includes('yellow') ? '#eab308' :
                                          newCategoryColor.css.includes('green') ? '#22c55e' :
                                          newCategoryColor.css.includes('blue') ? '#3b82f6' :
                                          newCategoryColor.css.includes('purple') ? '#a855f7' :
                                          newCategoryColor.css.includes('pink') ? '#ec4899' :
                                          newCategoryColor.css.includes('cyan') ? '#06b6d4' :
                                          newCategoryColor.css.includes('gray') ? '#6b7280' :
                                          newCategoryColor.css.includes('indigo') ? '#6366f1' : '#6b7280',
                            color: newCategoryColor.css.includes('yellow') || newCategoryColor.css.includes('cyan') ? '#000' : '#fff'
                          }}>
                      {newCategoryName}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Usage Instructions */}
          <div className="filter-section">
            <div className="bg-gray-900 rounded-lg p-4">
              <h4 className="text-lg font-semibold text-cyan-300 mb-3">How It Works</h4>
              <div className="text-sm text-gray-400 space-y-2">
                <p>• Keywords are highlighted in NOTAM text displayed on cards</p>
                <p>• Keywords are case-insensitive and match whole words or phrases</p>
                <p>• Multiple categories can be enabled simultaneously with different colors</p>
                <p>• Custom categories are saved automatically and persist between sessions</p>
                <p>• Default categories include common aviation NOTAM terms</p>
                <p>• Hover over highlighted keywords to see their category</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="filter-modal-footer">
          <button
            onClick={handleResetToDefaults}
            className="clear-all-btn"
          >
            Reset All Categories
          </button>
          <button
            onClick={onClose}
            className="apply-filters-btn"
          >
            Apply & Close
          </button>
        </div>
      </div>
    </div>,
    document.getElementById('modal-root')
  );
};

// Utility function to highlight text with NOTAM keywords
export const highlightNotamKeywords = (text, keywordCategories, enabled) => {
  if (!enabled || !text || typeof text !== 'string' || !keywordCategories) {
    return text;
  }

  // Get all enabled categories and their keywords
  const allKeywords = Object.values(keywordCategories)
    .filter(category => category.enabled && category.keywords.length > 0)
    .flatMap(category => 
      category.keywords.map(keyword => ({
        keyword: keyword.toUpperCase(),
        category: category
      }))
    );
  
  // Sort by keyword length (descending) to match longer keywords first
  allKeywords.sort((a, b) => b.keyword.length - a.keyword.length);

  if (allKeywords.length === 0) {
    return text;
  }

  // Create a regex that finds any of the keywords as whole words or phrases
  const escapedKeywords = allKeywords.map(k => k.keyword.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'));
  const regex = new RegExp(`\\b(${escapedKeywords.join('|')})\\b`, 'gi');
  
  // Create a map for quick lookup of keyword to category
  const keywordMap = allKeywords.reduce((acc, { keyword, category }) => {
    if (!acc[keyword]) {
      acc[keyword] = category;
    }
    return acc;
  }, {});
  
  return text.replace(regex, (match) => {
    const category = keywordMap[match.toUpperCase()];
    if (category) {
      const backgroundColor = category.color.includes('red') ? '#ef4444' :
                            category.color.includes('orange') ? '#f97316' :
                            category.color.includes('yellow') ? '#eab308' :
                            category.color.includes('green') ? '#22c55e' :
                            category.color.includes('blue') ? '#3b82f6' :
                            category.color.includes('purple') ? '#a855f7' :
                            category.color.includes('pink') ? '#ec4899' :
                            category.color.includes('cyan') ? '#06b6d4' :
                            category.color.includes('gray') ? '#6b7280' :
                            category.color.includes('indigo') ? '#6366f1' : '#6b7280';
      
      const textColor = category.color.includes('yellow') || category.color.includes('cyan') ? '#000' : '#fff';
      
      return `<span class="notam-keyword-highlight" style="background-color: ${backgroundColor}; color: ${textColor}; padding: 2px 4px; border-radius: 4px; font-weight: 600; font-size: 0.9em;" title="Category: ${category.name}">${match}</span>`;
    }
    return match;
  });
};

export default NotamKeywordHighlightManager;
