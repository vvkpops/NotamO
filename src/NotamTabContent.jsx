import React, { useState, useMemo, useRef } from 'react';
import NotamCard from './NotamCard';
import { getNotamType, isNotamCurrent, isNotamFuture } from './NotamUtils';

const DraggableFilterChip = ({ 
  label, 
  type, 
  isActive, 
  onClick, 
  count = 0, 
  onDragStart, 
  onDragEnd, 
  onDragOver, 
  onDrop, 
  isDragging,
  draggedOver 
}) => {
  const chipRef = useRef(null);

  const handleDragStart = (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', type);
    onDragStart(type);
    
    // Add visual feedback
    if (chipRef.current) {
      chipRef.current.style.transform = 'rotate(5deg) scale(1.05)';
      chipRef.current.style.opacity = '0.7';
    }
  };

  const handleDragEnd = () => {
    onDragEnd();
    
    // Reset visual feedback
    if (chipRef.current) {
      chipRef.current.style.transform = '';
      chipRef.current.style.opacity = '';
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    onDragOver(type);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const draggedType = e.dataTransfer.getData('text/plain');
    onDrop(draggedType, type);
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    onDragOver(type);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    // Only clear if we're actually leaving the element
    if (!e.currentTarget.contains(e.relatedTarget)) {
      // Don't clear here, let the parent handle it
    }
  };

  return (
    <button
      ref={chipRef}
      className={`filter-chip filter-chip-${type} ${isActive ? 'active' : ''} ${isDragging ? 'dragging' : ''} ${draggedOver ? 'drag-over' : ''} draggable-chip`}
      onClick={onClick}
      draggable={true}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      title={`Drag to reorder | ${label}: ${count} NOTAMs`}
    >
      <span className="drag-handle">⋮⋮</span>
      <span className="chip-label">{label}</span>
      {count > 0 && <span className="chip-count">{count}</span>}
    </button>
  );
};

const FilterChip = ({ label, type, isActive, onClick, count = 0 }) => (
  <button
    className={`filter-chip filter-chip-${type} ${isActive ? 'active' : ''}`}
    onClick={onClick}
  >
    <span className="chip-label">{label}</span>
    {count > 0 && <span className="chip-count">{count}</span>}
  </button>
);

const SearchInput = ({ value, onChange, placeholder, icon = "🔍" }) => (
  <div className="search-input-wrapper">
    <span className="search-icon">{icon}</span>
    <input
      type="text"
      placeholder={placeholder}
      className="search-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
    {value && (
      <button 
        className="clear-search-btn"
        onClick={() => onChange('')}
        title="Clear search"
      >
        ✕
      </button>
    )}
  </div>
);

const StatsDisplay = ({ stats }) => (
  <div className="stats-display">
    <div className="stat-item">
      <span className="stat-value active">{stats.active}</span>
      <span className="stat-label">Active</span>
    </div>
    <div className="stat-item">
      <span className="stat-value future">{stats.future}</span>
      <span className="stat-label">Future</span>
    </div>
    <div className="stat-item">
      <span className="stat-value runway">{stats.runway}</span>
      <span className="stat-label">Runway</span>
    </div>
  </div>
);

const LoadingState = () => (
  <div className="loading-state">
    <div className="loading-spinner-large"></div>
    <h3>Loading NOTAMs...</h3>
    <p>Fetching latest aviation notices</p>
  </div>
);

const ErrorState = ({ error, onRetry }) => (
  <div className="error-state">
    <div className="error-icon">⚠️</div>
    <h3>Failed to Load NOTAMs</h3>
    <p>{error}</p>
    {onRetry && (
      <button className="retry-btn" onClick={onRetry}>
        🔄 Retry
      </button>
    )}
  </div>
);

const EmptyState = ({ hasFilters, onClearFilters }) => (
  <div className="empty-state">
    <div className="empty-icon">
      {hasFilters ? '🔍' : '✈️'}
    </div>
    <h3>{hasFilters ? 'No NOTAMs match your filters' : 'No NOTAMs found'}</h3>
    <p>
      {hasFilters 
        ? 'Try adjusting your search criteria to see more results.'
        : 'There are currently no active NOTAMs for this airport.'
      }
    </p>
    {hasFilters && (
      <button className="clear-filters-btn" onClick={onClearFilters}>
        Clear All Filters
      </button>
    )}
  </div>
);

const NotamTabContent = ({ icao, notams, loading, error }) => {
  const [keywordFilter, setKeywordFilter] = useState('');
  
  // Default filter order - this determines card sorting priority
  const [filterOrder, setFilterOrder] = useState([
    'rwy', 'twy', 'rsc', 'crfi', 'ils', 'fuel', 'other', 'cancelled'
  ]);
  
  const [filters, setFilters] = useState({
    rwy: true, twy: true, rsc: true, crfi: true, ils: true,
    fuel: true, other: true, cancelled: false, current: true, future: true,
  });

  // Drag and drop state
  const [dragState, setDragState] = useState({
    draggedItem: null,
    draggedOver: null
  });

  const handleFilterChange = (filterKey) => {
    setFilters(prev => ({ ...prev, [filterKey]: !prev[filterKey] }));
  };

  const clearAllFilters = () => {
    setFilters({
      rwy: true, twy: true, rsc: true, crfi: true, ils: true,
      fuel: true, other: true, cancelled: false, current: true, future: true,
    });
    setKeywordFilter('');
  };

  // Drag and drop handlers
  const handleDragStart = (type) => {
    setDragState(prev => ({ ...prev, draggedItem: type }));
  };

  const handleDragEnd = () => {
    setDragState({ draggedItem: null, draggedOver: null });
  };

  const handleDragOver = (type) => {
    if (dragState.draggedItem && dragState.draggedItem !== type) {
      setDragState(prev => ({ ...prev, draggedOver: type }));
    }
  };

  const handleDrop = (draggedType, dropTargetType) => {
    if (draggedType === dropTargetType) return;

    setFilterOrder(prev => {
      const newOrder = [...prev];
      const draggedIndex = newOrder.indexOf(draggedType);
      const targetIndex = newOrder.indexOf(dropTargetType);
      
      if (draggedIndex === -1 || targetIndex === -1) return prev;
      
      // Remove the dragged item
      const [draggedItem] = newOrder.splice(draggedIndex, 1);
      
      // Insert it at the target position
      newOrder.splice(targetIndex, 0, draggedItem);
      
      return newOrder;
    });
    
    setDragState({ draggedItem: null, draggedOver: null });
  };

  // Container-level drag handlers for better cross-element dragging
  const handleContainerDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleContainerDrop = (e) => {
    e.preventDefault();
    // This will be handled by individual chips
  };

  const { filteredNotams, stats, typeCounts } = useMemo(() => {
    if (!notams) return { filteredNotams: [], stats: {}, typeCounts: {} };
    
    // Calculate type counts and stats from all NOTAMs
    const counts = {
      rwy: 0, twy: 0, rsc: 0, crfi: 0, ils: 0,
      fuel: 0, other: 0, cancelled: 0, current: 0, future: 0
    };
    
    const allStats = {
      total: 0,
      active: 0,
      future: 0,
      runway: 0
    };

    notams.forEach(notam => {
      if (notam.isIcaoHeader) return;
      
      const type = getNotamType(notam);
      counts[type]++;
      allStats.total++;
      
      if (isNotamCurrent(notam)) {
        counts.current++;
        allStats.active++;
      }
      if (isNotamFuture(notam)) {
        counts.future++;
        allStats.future++;
      }
      if (type === 'rwy') {
        allStats.runway++;
      }
    });
    
    // Filter NOTAMs
    let results = notams.filter(notam => {
      if (notam.isIcaoHeader) return true;

      const type = getNotamType(notam);
      const text = (notam.summary || '').toLowerCase();

      if (keywordFilter && !text.includes(keywordFilter.toLowerCase())) return false;
      if (!filters.current && isNotamCurrent(notam)) return false;
      if (!filters.future && isNotamFuture(notam)) return false;
      if (filters[type] === false) return false;

      return true;
    });

    // Sort NOTAMs based on filter order - this is the key enhancement!
    results.sort((a, b) => {
      if (a.isIcaoHeader && b.isIcaoHeader) return 0;
      if (a.isIcaoHeader) return -1;
      if (b.isIcaoHeader) return 1;

      const aType = getNotamType(a);
      const bType = getNotamType(b);
      const aPriority = filterOrder.indexOf(aType);
      const bPriority = filterOrder.indexOf(bType);
      
      // If same type, sort by date (newest first)
      if (aPriority === bPriority) {
        const aDate = new Date(a.validFrom);
        const bDate = new Date(b.validFrom);
        return bDate - aDate;
      }
      
      return aPriority - bPriority;
    });

    // Clean up empty ICAO headers in ALL view
    if (icao === 'ALL') {
      const finalResult = [];
      for (let i = 0; i < results.length; i++) {
        if (results[i].isIcaoHeader) {
          if (i + 1 >= results.length || results[i+1].isIcaoHeader) {
            continue; 
          }
        }
        finalResult.push(results[i]);
      }
      results = finalResult;
    }

    return { 
      filteredNotams: results, 
      stats: allStats, 
      typeCounts: counts 
    };
  }, [notams, keywordFilter, filters, icao, filterOrder]);

  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState error={error} />;
  }

  const filterConfig = [
    { key: 'rwy', label: 'Runway' }, 
    { key: 'twy', label: 'Taxiway' }, 
    { key: 'rsc', label: 'Surface' },
    { key: 'crfi', label: 'Friction' }, 
    { key: 'ils', label: 'ILS/Nav' }, 
    { key: 'fuel', label: 'Fuel' },
    { key: 'other', label: 'Other' }, 
    { key: 'cancelled', label: 'Cancelled' },
  ];
  
  const timeFilterConfig = [
    { key: 'current', label: 'Current' }, 
    { key: 'future', label: 'Future' }
  ];

  // Reorder filter config based on current filter order
  const orderedFilterConfig = filterOrder.map(type => 
    filterConfig.find(config => config.key === type)
  ).filter(Boolean);

  const hasActiveFilters = keywordFilter || Object.values(filters).some((value, index) => {
    const defaultFilters = [true, true, true, true, true, true, true, false, true, true];
    return value !== defaultFilters[index];
  });

  const renderNotamItem = (notam, index) => {
    if (notam.isIcaoHeader) {
      return (
        <div key={`header-${notam.icao}`} className="icao-header-card">
          <div className="icao-header-content">
            <h3>{notam.icao}</h3>
            <div className="icao-header-stats">
              <span className="header-stat">
                {notams.filter(n => n.icao === notam.icao && !n.isIcaoHeader).length} NOTAMs
              </span>
            </div>
          </div>
        </div>
      );
    }

    // Calculate visual priority for the card (for subtle effects)
    const typePriority = filterOrder.indexOf(getNotamType(notam));
    
    return (
      <div key={notam.id} style={{
        order: typePriority,
        transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
        transform: `translateY(${typePriority * 1}px)` // Subtle staggered effect
      }}>
        <NotamCard notam={notam} />
      </div>
    );
  };

  return (
    <div className="notam-tab-content">
      {/* Stats Display */}
      {notams && notams.length > 0 && (
        <StatsDisplay stats={stats} />
      )}

      {/* Enhanced Filter System */}
      <div className="modern-filter-container">
        <div className="filter-header">
          <h3>🎯 Drag Filters to Reorder Cards</h3>
          {hasActiveFilters && (
            <button className="clear-all-btn" onClick={clearAllFilters}>
              Clear All
            </button>
          )}
        </div>

        <SearchInput
          value={keywordFilter}
          onChange={setKeywordFilter}
          placeholder="Search NOTAMs by content..."
          icon="🔍"
        />

        <div className="filter-section">
          <h4>NOTAM Types (Drag to reorder card priority)</h4>
          <div 
            className="filter-chips draggable-chips"
            onDragOver={handleContainerDragOver}
            onDrop={handleContainerDrop}
          >
            {orderedFilterConfig.map(({ key, label }) => (
              <DraggableFilterChip 
                key={key} 
                label={label} 
                type={key} 
                isActive={filters[key]} 
                onClick={() => handleFilterChange(key)}
                count={typeCounts[key] || 0}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                isDragging={dragState.draggedItem === key}
                draggedOver={dragState.draggedOver === key}
              />
            ))}
          </div>
        </div>

        <div className="filter-section">
          <h4>Time Status</h4>
          <div className="filter-chips">
            {timeFilterConfig.map(({ key, label }) => (
              <FilterChip 
                key={key} 
                label={label} 
                type={key} 
                isActive={filters[key]} 
                onClick={() => handleFilterChange(key)}
                count={typeCounts[key] || 0}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="notam-results">
        {filteredNotams.length > 0 ? (
          <div className="notam-grid">
            {filteredNotams.map((item, index) => renderNotamItem(item, index))}
          </div>
        ) : (
          <EmptyState 
            hasFilters={hasActiveFilters}
            onClearFilters={clearAllFilters}
          />
        )}
      </div>
    </div>
  );
};

export default NotamTabContent;
