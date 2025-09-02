import React, { useState, useMemo, useRef } from 'react';
import NotamCard from './NotamCard';
import { getNotamType, isNotamCurrent, isNotamFuture } from './NotamUtils';

const FilterModal = ({ 
  isOpen, 
  onClose, 
  filters, 
  onFilterChange, 
  keywordFilter, 
  onKeywordChange, 
  typeCounts, 
  onClearAll,
  filterOrder,
  setFilterOrder,
  dragState,
  setDragState 
}) => {
  const modalRef = useRef(null);

  // Close modal when clicking outside
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
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
      
      const [draggedItem] = newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetIndex, 0, draggedItem);
      
      return newOrder;
    });
    
    setDragState({ draggedItem: null, draggedOver: null });
  };

  const DraggableFilterChip = ({ 
    label, 
    type, 
    isActive, 
    onClick, 
    count = 0
  }) => {
    const chipRef = useRef(null);

    const handleDragStart = (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', type);
      handleDragStart(type);
      
      if (chipRef.current) {
        chipRef.current.style.transform = 'rotate(5deg) scale(1.05)';
        chipRef.current.style.opacity = '0.7';
      }
    };

    const handleDragEnd = () => {
      handleDragEnd();
      
      if (chipRef.current) {
        chipRef.current.style.transform = '';
        chipRef.current.style.opacity = '';
      }
    };

    const handleDragOver = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      handleDragOver(type);
    };

    const handleDrop = (e) => {
      e.preventDefault();
      const draggedType = e.dataTransfer.getData('text/plain');
      handleDrop(draggedType, type);
    };

    return (
      <button
        ref={chipRef}
        className={`filter-chip filter-chip-${type} ${isActive ? 'active' : ''} ${dragState.draggedItem === type ? 'dragging' : ''} ${dragState.draggedOver === type ? 'drag-over' : ''} draggable-chip`}
        onClick={onClick}
        draggable={true}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
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

  const orderedFilterConfig = filterOrder.map(type => 
    filterConfig.find(config => config.key === type)
  ).filter(Boolean);

  if (!isOpen) return null;

  return (
    <div className="filter-modal-backdrop" onClick={handleBackdropClick}>
      <div className="filter-modal" ref={modalRef}>
        <div className="filter-modal-header">
          <h3>🎯 Filter & Sort NOTAMs</h3>
          <button className="filter-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="filter-modal-content">
          {/* Search */}
          <div className="filter-section">
            <h4>Search</h4>
            <div className="search-input-wrapper">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Search keywords..."
                className="search-input"
                value={keywordFilter}
                onChange={(e) => onKeywordChange(e.target.value)}
              />
              {keywordFilter && (
                <button 
                  className="clear-search-btn"
                  onClick={() => onKeywordChange('')}
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* NOTAM Types */}
          <div className="filter-section">
            <h4>NOTAM Types (Drag to reorder card priority)</h4>
            <div className="filter-chips draggable-chips">
              {orderedFilterConfig.map(({ key, label }) => (
                <DraggableFilterChip 
                  key={key} 
                  label={label} 
                  type={key} 
                  isActive={filters[key]} 
                  onClick={() => onFilterChange(key)}
                  count={typeCounts[key] || 0}
                />
              ))}
            </div>
          </div>

          {/* Time Status */}
          <div className="filter-section">
            <h4>Time Status</h4>
            <div className="filter-chips">
              {timeFilterConfig.map(({ key, label }) => (
                <FilterChip 
                  key={key} 
                  label={label} 
                  type={key} 
                  isActive={filters[key]} 
                  onClick={() => onFilterChange(key)}
                  count={typeCounts[key] || 0}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="filter-modal-footer">
          <button className="clear-all-btn" onClick={onClearAll}>
            Clear All Filters
          </button>
          <button className="apply-filters-btn" onClick={onClose}>
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
};

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
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  
  const [filterOrder, setFilterOrder] = useState([
    'rwy', 'twy', 'rsc', 'crfi', 'ils', 'fuel', 'other', 'cancelled'
  ]);
  
  const [filters, setFilters] = useState({
    rwy: true, twy: true, rsc: true, crfi: true, ils: true,
    fuel: true, other: true, cancelled: false, current: true, future: true,
  });

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

  const { filteredNotams, typeCounts } = useMemo(() => {
    if (!notams) return { filteredNotams: [], typeCounts: {} };
    
    const counts = {
      rwy: 0, twy: 0, rsc: 0, crfi: 0, ils: 0,
      fuel: 0, other: 0, cancelled: 0, current: 0, future: 0
    };

    notams.forEach(notam => {
      if (notam.isIcaoHeader) return;
      
      const type = getNotamType(notam);
      counts[type]++;
      
      if (isNotamCurrent(notam)) {
        counts.current++;
      }
      if (isNotamFuture(notam)) {
        counts.future++;
      }
    });
    
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

    results.sort((a, b) => {
      if (a.isIcaoHeader && b.isIcaoHeader) return 0;
      if (a.isIcaoHeader) return -1;
      if (b.isIcaoHeader) return 1;

      const aType = getNotamType(a);
      const bType = getNotamType(b);
      const aPriority = filterOrder.indexOf(aType);
      const bPriority = filterOrder.indexOf(bType);
      
      if (aPriority === bPriority) {
        const aDate = new Date(a.validFrom);
        const bDate = new Date(b.validFrom);
        return bDate - aDate;
      }
      
      return aPriority - bPriority;
    });

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
      typeCounts: counts 
    };
  }, [notams, keywordFilter, filters, icao, filterOrder]);

  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState error={error} />;
  }

  const hasActiveFilters = keywordFilter || Object.values(filters).some((value, index) => {
    const defaultFilters = [true, true, true, true, true, true, true, false, true, true];
    return value !== defaultFilters[index];
  });

  // Count active filters for badge
  const activeFilterCount = Object.keys(filters).filter(key => {
    const defaultFilters = {
      rwy: true, twy: true, rsc: true, crfi: true, ils: true,
      fuel: true, other: true, cancelled: false, current: true, future: true,
    };
    return filters[key] !== defaultFilters[key];
  }).length + (keywordFilter ? 1 : 0);

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

    const typePriority = filterOrder.indexOf(getNotamType(notam));
    
    return (
      <div key={notam.id} style={{
        order: typePriority,
        transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
        transform: `translateY(${typePriority * 1}px)`
      }}>
        <NotamCard notam={notam} />
      </div>
    );
  };

  return (
    <div className="notam-tab-content">
      {/* Compact Filter Button */}
      <div className="compact-filter-container">
        <button 
          className="filter-toggle-btn"
          onClick={() => setIsFilterModalOpen(true)}
        >
          <span className="filter-icon">🎯</span>
          <span className="filter-text">FILTER</span>
          {activeFilterCount > 0 && (
            <span className="filter-badge">{activeFilterCount}</span>
          )}
        </button>
        
        {hasActiveFilters && (
          <button className="quick-clear-btn" onClick={clearAllFilters}>
            Clear All
          </button>
        )}
      </div>

      {/* Filter Modal */}
      <FilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        filters={filters}
        onFilterChange={handleFilterChange}
        keywordFilter={keywordFilter}
        onKeywordChange={setKeywordFilter}
        typeCounts={typeCounts}
        onClearAll={clearAllFilters}
        filterOrder={filterOrder}
        setFilterOrder={setFilterOrder}
        dragState={dragState}
        setDragState={setDragState}
      />

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
