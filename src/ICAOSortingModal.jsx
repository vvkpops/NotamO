import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

const ICAOSortingModal = ({ 
  isOpen, 
  onClose, 
  icaos, 
  onReorder 
}) => {
  const [sortableIcaos, setSortableIcaos] = useState([]);
  const [draggedItem, setDraggedItem] = useState(null);
  const [draggedOver, setDraggedOver] = useState(null);
  const modalRef = useRef(null);

  // Initialize sortable ICAOs when modal opens
  useEffect(() => {
    if (isOpen && icaos.length > 0) {
      // Load custom order from localStorage or use current order
      const savedOrder = localStorage.getItem('icaoCustomOrder');
      if (savedOrder) {
        try {
          const parsedOrder = JSON.parse(savedOrder);
          // Ensure all current ICAOs are included and new ones are added
          const orderedIcaos = [...parsedOrder.filter(icao => icaos.includes(icao))];
          const newIcaos = icaos.filter(icao => !orderedIcaos.includes(icao));
          setSortableIcaos([...orderedIcaos, ...newIcaos]);
        } catch {
          setSortableIcaos([...icaos]);
        }
      } else {
        setSortableIcaos([...icaos]);
      }
    }
  }, [isOpen, icaos]);

  // Handle backdrop click to close
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'auto';
    };
  }, [isOpen, onClose]);

  // Drag and drop handlers
  const handleDragStart = (e, icao, index) => {
    setDraggedItem({ icao, index });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', icao);
    
    // Add visual feedback
    e.target.style.opacity = '0.5';
  };

  const handleDragEnd = (e) => {
    e.target.style.opacity = '1';
    setDraggedItem(null);
    setDraggedOver(null);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e, index) => {
    e.preventDefault();
    setDraggedOver(index);
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    
    if (!draggedItem || draggedItem.index === dropIndex) {
      return;
    }

    const newOrder = [...sortableIcaos];
    const draggedIcao = newOrder[draggedItem.index];
    
    // Remove dragged item from its original position
    newOrder.splice(draggedItem.index, 1);
    
    // Insert it at the new position
    const adjustedDropIndex = draggedItem.index < dropIndex ? dropIndex - 1 : dropIndex;
    newOrder.splice(adjustedDropIndex, 0, draggedIcao);
    
    setSortableIcaos(newOrder);
    setDraggedItem(null);
    setDraggedOver(null);
  };

  // Save the new order
  const handleSaveOrder = () => {
    // Save to localStorage
    localStorage.setItem('icaoCustomOrder', JSON.stringify(sortableIcaos));
    
    // Apply the new order to the main app
    onReorder(sortableIcaos);
    
    // Show success feedback
    const saveBtn = document.querySelector('.sort-save-btn');
    if (saveBtn) {
      const originalText = saveBtn.textContent;
      saveBtn.textContent = '✅ Saved!';
      saveBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
      
      setTimeout(() => {
        saveBtn.textContent = originalText;
        saveBtn.style.background = '';
      }, 2000);
    }
    
    // Close modal after a brief delay
    setTimeout(() => {
      onClose();
    }, 1000);
  };

  // Reset to default order
  const handleResetOrder = () => {
    setSortableIcaos([...icaos]);
    localStorage.removeItem('icaoCustomOrder');
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="icao-sort-backdrop" onClick={handleBackdropClick}>
      <div className="icao-sort-modal" ref={modalRef}>
        <div className="icao-sort-header">
          <div className="icao-sort-title">
            <span className="icao-sort-icon">↕️</span>
            <div>
              <h3>Sort ICAO Codes</h3>
              <p>Drag to reorder your ICAO tabs as you prefer</p>
            </div>
          </div>
          <button className="icao-sort-close" onClick={onClose}>✕</button>
        </div>

        <div className="icao-sort-content">
          <div className="icao-sort-instructions">
            <div className="instruction-item">
              <span className="instruction-icon">🖱️</span>
              <span>Drag any ICAO code to reorder</span>
            </div>
            <div className="instruction-item">
              <span className="instruction-icon">💾</span>
              <span>Changes are saved automatically</span>
            </div>
            <div className="instruction-item">
              <span className="instruction-icon">🔄</span>
              <span>Reset to restore default order</span>
            </div>
          </div>

          <div className="icao-sort-list">
            {sortableIcaos.map((icao, index) => (
              <div
                key={icao}
                className={`icao-sort-item ${draggedOver === index ? 'drag-over' : ''} ${draggedItem?.index === index ? 'dragging' : ''}`}
                draggable
                onDragStart={(e) => handleDragStart(e, icao, index)}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDragEnter={(e) => handleDragEnter(e, index)}
                onDrop={(e) => handleDrop(e, index)}
              >
                <div className="icao-drag-handle">
                  <span className="drag-dots">⋮⋮</span>
                </div>
                <div className="icao-code-display">
                  <span className="icao-code">{icao}</span>
                  <span className="icao-position">Position #{index + 1}</span>
                </div>
                <div className="icao-drag-indicator">
                  <span className="drag-arrow">↕️</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="icao-sort-footer">
          <button className="icao-sort-reset" onClick={handleResetOrder}>
            🔄 Reset Order
          </button>
          <div className="icao-sort-actions">
            <button className="icao-sort-cancel" onClick={onClose}>
              Cancel
            </button>
            <button className="icao-sort-save sort-save-btn" onClick={handleSaveOrder}>
              💾 Save Order
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.getElementById('modal-root')
  );
};

export default ICAOSortingModal;