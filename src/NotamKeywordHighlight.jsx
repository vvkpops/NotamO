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
    keywords: ['CLOSED', 'CLO', 'CLSD', 'OUT OF SERVICE', 'U/S', 'UNSERVICEABLE', 'DANGEROUS', 'HAZARD', 'OBSTRUCTION', 'OBST'],
    enabled: true,
    custom: false
  },
  runway: {
    name: 'Runway Operations',
    color: 'notam-highlight-orange',
    keywords: ['RWY', 'RUNWAY', 'DISPLACED', 'DISPL', 'THR', 'THRESHOLD', 'TODA', 'TORA', 'ASDA', 'LDA', 'STOP', 'STOPWAY'],
    enabled: true,
    custom: false
  },
  navigation: {
    name: 'Navigation & ILS',
    color: 'notam-highlight-blue',
    keywords: ['ILS', 'LOC', 'LOCALIZER', 'GS', 'GLIDESLOPE', 'VOR', 'DME', 'NDB', 'TACAN', 'GPS', 'RNAV', 'WAAS', 'PAPI', 'VASI'],
    enabled: true,
    custom: false
  },
  lighting: {
    name: 'Lighting Systems',
    color: 'notam-highlight-green',
    keywords: ['LGT', 'LIGHTS', 'LIGHTING', 'ALS', 'ALSF', 'MALSR', 'ODALS', 'RAIL', 'REIL', 'HIRL', 'MIRL', 'LIRL', 'EDGE'],
    enabled: true,
    custom: false
  },
  surface: {
    name: 'Surface Conditions',
    color: 'notam-highlight-purple',
    keywords: ['RSC', 'CRFI', 'FRICTION', 'ICE', 'SNOW', 'SLUSH', 'WET', 'DRY', 'COMPACTED', 'BRAKING', 'SURFACE', 'CONTAMINATED'],
    enabled: true,
    custom: false
  },
  construction: {
    name: 'Construction & Maintenance',
    color: 'notam-highlight-yellow',
    keywords: ['WORK', 'CONSTRUCTION', 'CONST', 'MAINT', 'MAINTENANCE', 'REPAIR', 'EQUIPMENT', 'VEHICLE', 'CRANE', 'MACHINERY'],
    enabled: true,
    custom: false
  },
  taxiway: {
    name: 'Taxiway Operations',
    color: 'notam-highlight-cyan',
    keywords: ['TWY', 'TAXIWAY', 'TAXI', 'APRON', 'RAMP', 'GATE', 'STAND', 'PUSHBACK', 'TOW', 'GROUND'],
    enabled: true,
    custom: false
  },
  fuel: {
    name: 'Fuel Services',
    color: 'notam-highlight-pink',
    keywords: ['FUEL', 'AVGAS', 'JET A', 'JET A1', '100LL', 'REFUEL', 'BOWSER', 'HYDRANT', 'PUMP', 'TANK'],
    enabled: true,
    custom: false
  }
};

const HighlightColorChip = ({ colorClass, text }) => {
    const style = {
        backgroundColor: colorClass.includes('red') ? '#ef4444' :
                      colorClass.includes('orange') ? '#f97316' :
                      colorClass.includes('yellow') ? '#eab308' :
                      colorClass.includes('green') ? '#22c55e' :
                      colorClass.includes('blue') ? '#3b82f6' :
                      colorClass.includes('purple') ? '#a855f7' :
                      colorClass.includes('pink') ? '#ec4899' :
                      colorClass.includes('cyan') ? '#06b6d4' :
                      colorClass.includes('gray') ? '#6b7280' :
                      colorClass.includes('indigo') ? '#6366f1' : '#6b7280',
        color: colorClass.includes('yellow') || colorClass.includes('cyan') ? '#000' : '#fff'
    };
    return (
      <span className="px-3 py-1 rounded-full text-sm font-bold" style={style}>
        {text}
      </span>
    );
};

const CategoryItem = ({ categoryId, category, onToggle, onUpdateKeywords, onDelete }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [keywords, setKeywords] = useState(category.keywords.join(' '));
  
    const handleSave = () => {
      onUpdateKeywords(categoryId, keywords);
      setIsEditing(false);
    };
  
    return (
      <div className="hm-category-item">
        <div className="hm-category-header">
          <div className="hm-category-title">
            <label className="hm-switch">
              <input type="checkbox" checked={category.enabled} onChange={() => onToggle(categoryId)} />
              <span className="hm-slider"></span>
            </label>
            <HighlightColorChip colorClass={category.color} text={category.name} />
            <span className="hm-keyword-count">{category.keywords.length} keywords</span>
          </div>
          <div className="hm-category-actions">
            {isEditing ? (
              <button onClick={handleSave} className="hm-btn hm-btn-save">Save</button>
            ) : (
              <button onClick={() => setIsEditing(true)} className="hm-btn hm-btn-edit">Edit</button>
            )}
            {category.custom && <button onClick={() => onDelete(categoryId)} className="hm-btn hm-btn-delete">Delete</button>}
          </div>
        </div>
        {isEditing && (
          <div className="hm-category-editor">
            <textarea
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              className="hm-textarea"
              rows="2"
            />
          </div>
        )}
      </div>
    );
};
  
const AddCategoryForm = ({ onAdd }) => {
    const [name, setName] = useState('');
    const [color, setColor] = useState(COLOR_OPTIONS[0]);
    const [keywords, setKeywords] = useState('');
  
    const handleSubmit = (e) => {
      e.preventDefault();
      if (!name.trim() || !keywords.trim()) return;
      onAdd({ name, color, keywords });
      setName('');
      setKeywords('');
      setColor(COLOR_OPTIONS[0]);
    };
  
    return (
      <form onSubmit={handleSubmit} className="hm-add-category-form">
        <h4 className="hm-section-title">Add Custom Category</h4>
        <div className="hm-form-grid">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="hm-input"
            placeholder="Category Name"
          />
          <select
            value={COLOR_OPTIONS.findIndex(c => c.css === color.css)}
            onChange={(e) => setColor(COLOR_OPTIONS[parseInt(e.target.value)])}
            className="hm-select"
          >
            {COLOR_OPTIONS.map((c, idx) => (
              <option key={idx} value={idx}>{c.name}</option>
            ))}
          </select>
        </div>
        <textarea
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          className="hm-textarea"
          rows="3"
          placeholder="Keywords (space or comma separated)"
        />
        <div className="hm-form-footer">
          <button type="submit" className="hm-btn hm-btn-add" disabled={!name.trim() || !keywords.trim()}>
            Add Category
          </button>
          {(name || keywords) && (
            <div className="hm-preview">
              <span className="hm-preview-label">Preview:</span>
              <HighlightColorChip colorClass={color.css} text={name || '...'} />
            </div>
          )}
        </div>
      </form>
    );
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

  const handleAddCategory = ({ name, color, keywords }) => {
    const categoryId = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const keywordArray = keywords.split(/[,\s]+/).map(k => k.trim().toUpperCase()).filter(k => k.length > 0);

    setKeywordCategories(prev => ({
      ...prev,
      [categoryId]: {
        name: name.trim(),
        color: color.css,
        keywords: keywordArray,
        enabled: true,
        custom: true
      }
    }));
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
    const keywords = keywordsString.split(/[,\s]+/).map(k => k.trim().toUpperCase()).filter(k => k.length > 0);
    setKeywordCategories(prev => ({
      ...prev,
      [categoryId]: { ...prev[categoryId], keywords }
    }));
  };

  const handleResetToDefaults = () => {
    setKeywordCategories({ ...DEFAULT_NOTAM_KEYWORDS });
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="hm-backdrop">
      <div ref={modalRef} className="hm-modal">
        <div className="hm-header">
          <div className="hm-header-title">
            <span className="hm-header-icon">🎯</span>
            <div>
              <h3>Keyword Highlighting</h3>
              <p>Manage how keywords are highlighted in NOTAMs</p>
            </div>
          </div>
          <button onClick={onClose} className="hm-close-btn">✕</button>
        </div>

        <div className="hm-content">
          <div className="hm-master-toggle">
            <h4>Enable Highlighting</h4>
            <label className="hm-switch hm-switch-large">
              <input
                type="checkbox"
                checked={keywordHighlightEnabled}
                onChange={(e) => setKeywordHighlightEnabled(e.target.checked)}
              />
              <span className="hm-slider"></span>
            </label>
          </div>

          <div className="hm-section">
            <div className="hm-section-header">
                <h4 className="hm-section-title">Categories</h4>
                <button onClick={handleResetToDefaults} className="hm-btn hm-btn-secondary">Reset to Defaults</button>
            </div>
            <div className="hm-category-list">
              {Object.entries(keywordCategories).map(([id, cat]) => (
                <CategoryItem
                  key={id}
                  categoryId={id}
                  category={cat}
                  onToggle={handleToggleCategory}
                  onUpdateKeywords={handleUpdateKeywords}
                  onDelete={handleDeleteCategory}
                />
              ))}
            </div>
          </div>
          
          <div className="hm-section">
            <AddCategoryForm onAdd={handleAddCategory} />
          </div>
        </div>

        <div className="hm-footer">
          <button onClick={onClose} className="hm-btn hm-btn-primary">Done</button>
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

  const allKeywords = Object.values(keywordCategories)
    .filter(category => category.enabled && category.keywords.length > 0)
    .flatMap(category => 
      category.keywords.map(keyword => ({
        keyword: keyword.toUpperCase(),
        category: category
      }))
    );
  
  allKeywords.sort((a, b) => b.keyword.length - a.keyword.length);

  if (allKeywords.length === 0) {
    return text;
  }

  const escapedKeywords = allKeywords.map(k => k.keyword.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'));
  const regex = new RegExp(`\\b(${escapedKeywords.join('|')})\\b`, 'gi');
  
  const keywordMap = allKeywords.reduce((acc, { keyword, category }) => {
    if (!acc[keyword]) acc[keyword] = category;
    return acc;
  }, {});
  
  return text.replace(regex, (match) => {
    const category = keywordMap[match.toUpperCase()];
    if (category) {
      return `<span class="notam-keyword-highlight ${category.color}" title="Category: ${category.name}">${match}</span>`;
    }
    return match;
  });
};

export default NotamKeywordHighlightManager;
