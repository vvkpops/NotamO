import React, { useRef, useCallback } from 'react';
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

  const handleBackdropClick = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const handleModalClick = useCallback((e) => {
    e.stopPropagation();
  }, []);

  const handleCloseClick = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    onClose();
  }, [onClose]);

  const handleDragStart = useCallback((type) => {
    setDragState(prev => ({ ...prev, draggedItem: type }));
  }, [setDragState]);

  const handleDragEnd = useCallback(() => {
    setDragState({ draggedItem: null, draggedOver: null });
  }, [setDragState]);

  const handleDragOver = useCallback((type) => {
    if (dragState.draggedItem && dragState.draggedItem !== type) {
      setDragState(prev => ({ ...prev, draggedOver: type }));
    }
  }, [dragState.draggedItem, setDragState]);

  const handleDrop = useCallback((draggedType, dropTargetType) => {
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
  }, [setFilterOrder, setDragState]);

  // Enhanced drag and drop with proper event handling
  const DraggableFilterChip = ({ 
    label, 
    type, 
    isActive, 
    onClick, 
    count = 0
  }) => {
    const chipRef = useRef(null);
    const touchStartRef = useRef(null);
    const dragStartTimeRef = useRef(null);

    const handleClick = useCallback((e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Only trigger click if it wasn't a drag operation
      const now = Date.now();
      if (!dragStartTimeRef.current || (now - dragStartTimeRef.current) < 200) {
        onClick();
      }
    }, [onClick]);

    const handleDragStartInternal = useCallback((e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', type);
      dragStartTimeRef.current = Date.now();
      handleDragStart(type);
      
      if (chipRef.current) {
        chipRef.current.classList.add('dragging');
      }
    }, [type, handleDragStart]);

    const handleDragEndInternal = useCallback((e) => {
      e.preventDefault(); // Add this to fix the drag issue
      handleDragEnd();
      
      if (chipRef.current) {
        chipRef.current.classList.remove('dragging');
      }
    }, [handleDragEnd]);

    const handleDragOverInternal = useCallback((e) => {
      e.preventDefault();
      e.stopPropagation(); // Add this to fix drag over issues
      e.dataTransfer.dropEffect = 'move';
      handleDragOver(type);
    }, [type, handleDragOver]);

    const handleDragLeave = useCallback((e) => {
      e.preventDefault();
      // Only clear drag-over if we're actually leaving this element
      if (!e.currentTarget.contains(e.relatedTarget)) {
        setDragState(prev => ({ ...prev, draggedOver: null }));
      }
    }, [setDragState]);

    const handleDropInternal = useCallback((e) => {
      e.preventDefault();
      e.stopPropagation();
      const draggedType = e.dataTransfer.getData('text/plain');
      if (draggedType && draggedType !== type) {
        handleDrop(draggedType, type);
      }
    }, [type, handleDrop]);

    // Enhanced touch event handlers for mobile devices
    const handleTouchStart = useCallback((e) => {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now()
      };
    }, []);

    const handleTouchMove = useCallback((e) => {
      if (!touchStartRef.current) return;
      
      const touch = e.touches[0];
      const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
      const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);
      
      // If significant movement, prevent click and start drag behavior
      if (deltaX > 10 || deltaY > 10) {
        dragStartTimeRef.current = Date.now();
        e.preventDefault(); // Prevent scrolling
      }
    }, []);

    const handleTouchEnd = useCallback(() => {
      touchStartRef.current = null;
    }, []);

    return (
      <button
        ref={chipRef}
        className={`filter-chip filter-chip-${type} ${isActive ? 'active' : ''} ${dragState.draggedItem === type ? 'dragging' : ''} ${dragState.draggedOver === type ? 'drag-over' : ''} draggable-chip`}
        onClick={handleClick}
        draggable={true}
        onDragStart={handleDragStartInternal}
        onDragEnd={handleDragEndInternal}
        onDragOver={handleDragOverInternal}
        onDragLeave={handleDragLeave}
        onDrop={handleDropInternal}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        title={`Drag to reorder | ${label}: ${count} NOTAMs`}
        type="button"
      >
        <span className="drag-handle">⋮⋮</span>
        <span className="chip-label">{label}</span>
        {count > 0 && <span className="chip-count">{count}</span>}
      </button>
    );
  };

  const FilterChip = ({ label, type, isActive, onClick, count = 0 }) => {
    const handleClick = useCallback((e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    }, [onClick]);

    return (
      <button
        className={`filter-chip filter-chip-${type} ${isActive ? 'active' : ''}`}
        onClick={handleClick}
        type="button"
      >
        <span className="chip-label">{label}</span>
        {count > 0 && <span className="chip-count">{count}</span>}
      </button>
    );
  };

  // Updated filter configuration with DOM filter
  const filterConfig = [
    { key: 'rwy', label: 'Runway' }, 
    { key: 'twy', label: 'Taxiway' }, 
    { key: 'rsc', label: 'Surface' },
    { key: 'crfi', label: 'Friction' }, 
    { key: 'ils', label: 'ILS/Nav' }, 
    { key: 'fuel', label: 'Fuel' },
    { key: 'dom', label: 'Domestic' }, // Add DOM filter here
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
      <div className="filter-modal" ref={modalRef} onClick={handleModalClick}>
        <div className="filter-modal-header">
          <h3>🎯 Filter & Sort NOTAMs</h3>
          <button className="filter-modal-close" onClick={handleCloseClick} type="button">
            ✕
          </button>
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
          <button className="clear-all-btn" onClick={onClearAll} type="button">
            Clear All Selections
          </button>
          <button className="apply-filters-btn" onClick={handleCloseClick} type="button">
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
      <button className="retry-btn" onClick={onRetry} type="button">
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
      <button className="clear-filters-btn" onClick={onClearFilters} type="button">
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