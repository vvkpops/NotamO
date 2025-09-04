import React, { useRef } from 'react';
import NotamCard from './NotamCard';
import { getNotamType } from './NotamUtils';

export const FilterModal = ({ 
  isOpen, 
  onClose, 
  filters, 
  onFilterChange, 
  typeCounts, 
  onClearAll,
  filterOrder,
  setFilterOrder,
  dragState,
  setDragState 
}) => {
  const modalRef = useRef(null);

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

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

    const handleDragStartInternal = (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', type);
      handleDragStart(type);
      
      if (chipRef.current) {
        chipRef.current.style.transform = 'rotate(5deg) scale(1.05)';
        chipRef.current.style.opacity = '0.7';
      }
    };

    const handleDragEndInternal = () => {
      handleDragEnd();
      
      if (chipRef.current) {
        chipRef.current.style.transform = '';
        chipRef.current.style.opacity = '';
      }
    };

    const handleDragOverInternal = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      handleDragOver(type);
    };

    const handleDropInternal = (e) => {
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
        onDragStart={handleDragStartInternal}
        onDragEnd={handleDragEndInternal}
        onDragOver={handleDragOverInternal}
        onDrop={handleDropInternal}
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
            Clear All Selections
          </button>
          <button className="apply-filters-btn" onClick={onClose}>
            Apply & Close
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
        ? 'Try adjusting your search criteria or clearing filters to see more results.'
        : 'There are currently no active NOTAMs for this airport, or you can try adding an ICAO code above.'
      }
    </p>
    {hasFilters && (
      <button className="clear-filters-btn" onClick={onClearFilters}>
        Clear All Filters
      </button>
    )}
  </div>
);

const NotamTabContent = ({ 
  icao, 
  notams, 
  loading, 
  error, 
  hasActiveFilters, 
  onClearFilters, 
  filterOrder,
  keywordHighlightEnabled = false,
  keywordCategories = {}
}) => {
  if (loading) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState error={error} />;
  }

  const renderNotamItem = (notam) => {
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
    
    return (
      <NotamCard 
        key={notam.id} 
        notam={notam} 
        keywordHighlightEnabled={keywordHighlightEnabled}
        keywordCategories={keywordCategories}
      />
    );
  };

  return (
    <div className="notam-tab-content">
      <div className="notam-results">
        {notams.length > 0 ? (
          <div className="notam-grid">
            {notams.map((item) => renderNotamItem(item))}
          </div>
        ) : (
          <EmptyState 
            hasFilters={hasActiveFilters}
            onClearFilters={onClearFilters}
          />
        )}
      </div>
    </div>
  );
};

export default NotamTabContent;
