// Key updates to App.jsx for better date handling and time status management

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import NotamTabContent, { FilterModal } from './NotamTabContent';
import { 
  getNotamType, 
  isNotamCurrent, 
  isNotamFuture, 
  parseDate,
  formatDateForDisplay,
  getNotamTimeStatus,
  validateNotam
} from './NotamUtils';
import NotamKeywordHighlightManager, { DEFAULT_NOTAM_KEYWORDS } from './NotamKeywordHighlight.jsx';
import ICAOSortingModal from './ICAOSortingModal.jsx';
import NotamHistoryModal from './NotamHistoryModal.jsx';

const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

const App = () => {
  // Existing state management...
  const [icaos, setIcaos] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("notamIcaos") || "[]");
    } catch {
      return [];
    }
  });
  
  const [activeTab, setActiveTab] = useState('ALL');
  const [notamDataStore, setNotamDataStore] = useState({});
  const [isAdding, setIsAdding] = useState(false);
  const [cardSize, setCardSize] = useState(() => {
    try {
      const saved = localStorage.getItem('notamCardSize');
      return saved ? JSON.parse(saved) : 420;
    } catch {
      return 420;
    }
  });

  // Enhanced time tracking for better status updates
  const [currentTime, setCurrentTime] = useState(new Date());
  const [fetchQueue, setFetchQueue] = useState([]);
  const [newNotamIcaos, setNewNotamIcaos] = useState(new Set());
  const [timeToNextRefresh, setTimeToNextRefresh] = useState(AUTO_REFRESH_INTERVAL);

  // Filter states
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

  // Keyword highlighting states (existing)
  const [keywordHighlightEnabled, setKeywordHighlightEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem('notamKeywordHighlightEnabled');
      return saved ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });
  
  const [keywordCategories, setKeywordCategories] = useState(() => {
    try {
      const saved = localStorage.getItem('notamKeywordCategories');
      return saved ? JSON.parse(saved) : DEFAULT_NOTAM_KEYWORDS;
    } catch {
      return DEFAULT_NOTAM_KEYWORDS;
    }
  });
  
  const [isHighlightModalOpen, setIsHighlightModalOpen] = useState(false);
  const [isSortModalOpen, setIsSortModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [notamHistory, setNotamHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('notamHistory');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Refs for stable callbacks
  const icaosRef = useRef([]);
  const isProcessingQueue = useRef(false);
  const queueTimerRef = useRef(null);
  const icaoInputRef = useRef(null);

  // Update current time every minute for accurate status displays
  useEffect(() => {
    const timeUpdateInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(timeUpdateInterval);
  }, []);

  // Update ref whenever icaos changes
  useEffect(() => {
    icaosRef.current = icaos;
  }, [icaos]);

  // Enhanced NOTAM signature generation for better detection
  const createNotamSignature = useCallback((notam) => {
    const number = notam.number || 'unknown';
    const validFrom = notam.validFrom || 'unknown';
    const validTo = notam.validTo || 'unknown';
    const source = notam.source || 'unknown';
    
    // Create content hash from summary/rawText
    const summary = (notam.summary || '').replace(/\s+/g, ' ').trim();
    const rawText = (notam.rawText || '').replace(/\s+/g, ' ').trim();
    const text = summary || rawText;
    const contentHash = text.slice(0, 200);
    
    return `${number}-${validFrom}-${validTo}-${source}-${contentHash}`;
  }, []);

  // Enhanced NOTAM processing with validation and time status
  const processNotamData = useCallback((rawNotams, isInitialFetch = false) => {
    const processedNotams = rawNotams.map(notam => {
      // Validate NOTAM structure
      const validation = validateNotam(notam);
      if (!validation.isValid) {
        console.warn(`Invalid NOTAM structure:`, validation.errors, notam);
      }

      // Determine time status using current time
      const timeStatus = getNotamTimeStatus(notam, currentTime);

      return {
        ...notam,
        timeStatus,
        isValid: validation.isValid,
        validationErrors: validation.errors,
        processedAt: currentTime.toISOString()
      };
    });

    return processedNotams;
  }, [currentTime]);

  // Smart incremental NOTAM detection and merging with enhanced time handling
  const smartNotamMerge = useCallback((oldData, newData, isInitialFetch) => {
    if (isInitialFetch || oldData.length === 0) {
      console.log(`📋 Initial fetch: ${newData.length} NOTAMs loaded`);
      const processedData = processNotamData(newData, true).map(n => ({ 
        ...n, 
        isNew: false, 
        userViewed: false,
        firstSeenAt: currentTime.toISOString()
      }));
      
      return { 
        processedData, 
        hasNewNotams: false,
        newNotamsList: [],
        stats: {
          new: newData.length,
          expired: 0,
          existing: 0,
          total: newData.length
        }
      };
    }

    // Create signature maps for efficient lookup
    const oldNotamMap = new Map();
    const oldSignatures = new Set();
    
    oldData.forEach(notam => {
      const signature = createNotamSignature(notam);
      oldNotamMap.set(signature, notam);
      oldSignatures.add(signature);
    });

    // Process new data with enhanced time status
    const processedNewData = processNotamData(newData);
    const newNotamMap = new Map();
    const newSignatures = new Set();
    
    processedNewData.forEach(notam => {
      const signature = createNotamSignature(notam);
      newNotamMap.set(signature, notam);
      newSignatures.add(signature);
    });

    // Find genuinely new NOTAMs
    const genuinelyNewSignatures = [...newSignatures].filter(sig => !oldSignatures.has(sig));
    const expiredSignatures = [...oldSignatures].filter(sig => !newSignatures.has(sig));
    const existingSignatures = [...newSignatures].filter(sig => oldSignatures.has(sig));

    console.log(`🔄 NOTAM Analysis:`, {
      total: processedNewData.length,
      new: genuinelyNewSignatures.length,
      expired: expiredSignatures.length,
      existing: existingSignatures.length
    });

    // Build merged result
    const mergedNotams = [];
    const newNotamsList = [];
    let hasNewNotams = false;

    // 1. Add existing NOTAMs (preserve user state, update time status)
    existingSignatures.forEach(signature => {
      const existingNotam = oldNotamMap.get(signature);
      const updatedNotam = newNotamMap.get(signature);
      
      // Update time status but preserve user interaction state
      mergedNotams.push({
        ...updatedNotam,
        isNew: existingNotam.isNew,
        userViewed: existingNotam.userViewed,
        firstSeenAt: existingNotam.firstSeenAt,
        timeStatus: getNotamTimeStatus(updatedNotam, currentTime), // Update status
      });
    });

    // 2. Add genuinely new NOTAMs
    genuinelyNewSignatures.forEach(signature => {
      const newNotam = newNotamMap.get(signature);
      hasNewNotams = true;
      
      console.log(`🆕 New NOTAM detected: ${newNotam.number} (${newNotam.timeStatus})`);
      
      const newNotamObject = {
        ...newNotam,
        isNew: true,
        userViewed: false,
        firstSeenAt: currentTime.toISOString(),
        timeStatus: getNotamTimeStatus(newNotam, currentTime),
      };
      mergedNotams.push(newNotamObject);
      newNotamsList.push(newNotamObject);
    });

    // 3. Log expired NOTAMs
    if (expiredSignatures.length > 0) {
      console.log(`🗑️ Expired NOTAMs removed: ${expiredSignatures.length}`);
      expiredSignatures.forEach(signature => {
        const expiredNotam = oldNotamMap.get(signature);
        console.log(`   - ${expiredNotam.number} (was ${expiredNotam.timeStatus || 'unknown'})`);
      });
    }

    // Sort merged NOTAMs by validity date and status priority
    mergedNotams.sort((a, b) => {
      // Prioritize by time status (active > future > expired)
      const statusPriority = { active: 3, future: 2, expired: 1, unknown: 0 };
      const aStatus = statusPriority[a.timeStatus] || 0;
      const bStatus = statusPriority[b.timeStatus] || 0;
      
      if (aStatus !== bStatus) {
        return bStatus - aStatus;
      }
      
      // Then by validity date (newest first)
      const dateA = parseDate(a.validFrom) || new Date(0);
      const dateB = parseDate(b.validFrom) || new Date(0);
      return dateB - dateA;
    });

    return { 
      processedData: mergedNotams, 
      hasNewNotams,
      newNotamsList,
      stats: {
        new: genuinelyNewSignatures.length,
        expired: expiredSignatures.length,
        existing: existingSignatures.length,
        total: mergedNotams.length
      }
    };
  }, [createNotamSignature, processNotamData, currentTime]);

  // Enhanced filtering with time status awareness
  const { filteredNotams, typeCounts, hasActiveFilters, activeFilterCount } = useMemo(() => {
    const notams = activeTab === 'ALL' ? 
      allNotamsData.data : 
      (notamDataStore[activeTab]?.data || []);

    if (!notams) return { 
      filteredNotams: [], 
      typeCounts: {}, 
      hasActiveFilters: false, 
      activeFilterCount: 0 
    };

    // Count NOTAMs by type and time status
    const counts = { 
      rwy: 0, twy: 0, rsc: 0, crfi: 0, ils: 0, fuel: 0, 
      other: 0, cancelled: 0, current: 0, future: 0, expired: 0 
    };

    notams.forEach(notam => {
      if (notam.isIcaoHeader) return;
      
      const type = getNotamType(notam);
      counts[type]++;
      
      // Update time status counts using current time
      const timeStatus = getNotamTimeStatus(notam, currentTime);
      if (timeStatus === 'active') counts.current++;
      if (timeStatus === 'future') counts.future++;
      if (timeStatus === 'expired') counts.expired++;
    });

    // Enhanced filtering function
    const filterFunc = notam => {
      if (notam.isIcaoHeader) return true;
      
      // Keyword filter
      if (keywordFilter && !(notam.summary || '').toLowerCase().includes(keywordFilter.toLowerCase())) {
        return false;
      }
      
      // Type filter
      const type = getNotamType(notam);
      if (filters[type] === false) return false;
      
      // Time status filters with current time
      const timeStatus = getNotamTimeStatus(notam, currentTime);
      if (!filters.current && timeStatus === 'active') return false;
      if (!filters.future && timeStatus === 'future') return false;
      
      return true;
    };

    // Enhanced sorting function with time status priority
    const sortFunc = (a, b) => {
      if (a.isIcaoHeader || b.isIcaoHeader) return 0;
      
      // First, sort by filter order priority
      const aPrio = filterOrder.indexOf(getNotamType(a));
      const bPrio = filterOrder.indexOf(getNotamType(b));
      if (aPrio !== bPrio) return aPrio - bPrio;
      
      // Then by time status priority
      const statusPriority = { active: 3, future: 2, expired: 1, unknown: 0 };
      const aStatus = statusPriority[getNotamTimeStatus(a, currentTime)] || 0;
      const bStatus = statusPriority[getNotamTimeStatus(b, currentTime)] || 0;
      if (aStatus !== bStatus) return bStatus - aStatus;
      
      // Finally by date
      const dateA = parseDate(a.validFrom) || new Date(0);
      const dateB = parseDate(b.validFrom) || new Date(0);
      return dateB - dateA;
    };

    let results = notams.filter(filterFunc).sort(sortFunc);

    // Group by ICAO for ALL tab
    if (activeTab === 'ALL') {
      const icaoGroups = results.reduce((acc, item) => {
        if (item.isIcaoHeader) return acc;
        acc[item.icao] = acc[item.icao] || [];
        acc[item.icao].push(item);
        return acc;
      }, {});
      
      results = [];
      Object.keys(icaoGroups).sort().forEach(icao => {
        if (icaoGroups[icao].length > 0) {
          results.push({ isIcaoHeader: true, icao: icao, id: `header-${icao}` });
          results.push(...icaoGroups[icao]);
        }
      });
    }

    // Calculate active filter status
    const defaultFilters = { 
      rwy: true, twy: true, rsc: true, crfi: true, ils: true, 
      fuel: true, other: true, cancelled: false, current: true, future: true 
    };
    const hasFilters = keywordFilter || Object.keys(filters).some(key => filters[key] !== defaultFilters[key]);
    const filterCount = Object.keys(filters).filter(key => filters[key] !== defaultFilters[key]).length + (keywordFilter ? 1 : 0);

    return { 
      filteredNotams: results, 
      typeCounts: counts, 
      hasActiveFilters: hasFilters, 
      activeFilterCount: filterCount 
    };
  }, [activeTab, notamDataStore, keywordFilter, filters, filterOrder, currentTime]);

  // Rest of your existing functions (fetchNotams, handleRefreshAll, etc.) remain the same...
  // but should use the enhanced smartNotamMerge function

  // Enhanced allNotamsData with time status awareness
  const allNotamsData = useMemo(() => {
    let combined = [];
    let hasAnyData = icaos.some(icao => notamDataStore[icao]?.data?.length > 0);
    let isLoading = icaos.some(icao => notamDataStore[icao]?.loading) && !hasAnyData;
    let anyError = null;

    [...icaos].sort().forEach(icao => {
      const storeEntry = notamDataStore[icao];
      if (storeEntry) {
        if (storeEntry.error) anyError = anyError || storeEntry.error;
        if (storeEntry.data && storeEntry.data.length > 0) {
          combined.push({ isIcaoHeader: true, icao: icao, id: `header-${icao}` });
          
          // Update time status for all NOTAMs when displaying
          const updatedData = storeEntry.data.map(notam => ({
            ...notam,
            timeStatus: getNotamTimeStatus(notam, currentTime)
          }));
          
          combined = combined.concat(updatedData);
        }
      }
    });
    
    return { data: combined, loading: isLoading, error: anyError };
  }, [notamDataStore, icaos, currentTime]);

  // ... rest of your component logic remains the same

  return (
    <div className="container" style={{ '--notam-card-size': `${cardSize}px` }}>
      <ModernHeader 
        timeToNextRefresh={timeToNextRefresh} 
        onRefresh={handleSmartRefresh}
        onHistoryClick={() => setIsHistoryModalOpen(true)}
        activeTab={activeTab}
        autoRefreshAll={handleRefreshAll}
        currentTime={currentTime}
      />
      
      {/* Rest of your JSX remains the same */}
    </div>
  );
};

// Enhanced ModernHeader with better time display
const ModernHeader = ({ timeToNextRefresh, onRefresh, onHistoryClick, activeTab, autoRefreshAll, currentTime }) => {
  const [utcTime, setUtcTime] = useState('');
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
    const tick = () => {
      const now = currentTime || new Date();
      setUtcTime(formatDateForDisplay(now, { showSeconds: true, format: 'compact' }));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [currentTime]);

  const minutes = Math.floor(timeToNextRefresh / 60000);
  const seconds = Math.floor((timeToNextRefresh % 60000) / 1000).toString().padStart(2, '0');

  const buttonText = activeTab === 'ALL' ? 'Refresh All' : `Refresh ${activeTab}`;
  const buttonTitle = activeTab === 'ALL' 
    ? 'Fetch latest NOTAMs for all airports' 
    : `Fetch latest NOTAMs for ${activeTab}`;

  return (
    <header className={`modern-header ${mounted ? 'mounted' : ''}`}>
      <h1>NOTAM Console</h1>
      <div className="header-meta">
        <button onClick={onHistoryClick} className="refresh-all-btn" title="View New NOTAM History">
          History
        </button>
        <div className="global-refresh" title={`Next auto-refresh in ${minutes}:${seconds}`}>
          <button onClick={onRefresh} className="refresh-all-btn" title={buttonTitle}>
            {buttonText}
          </button>
          <span className="global-countdown" onClick={autoRefreshAll} title="Click to refresh all now">
            {minutes}:{seconds}
          </span>
        </div>
        <p className="utc-time" title={`Current UTC time: ${utcTime}`}>
          {utcTime}
        </p>
      </div>
    </header>
  );
};

export default App;
