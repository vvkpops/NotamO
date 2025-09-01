import React, { useState, useMemo } from 'react';
import NotamCard from './NotamCard';
import { getNotamClassification, isNotamCurrent, isNotamFuture } from './NotamUtils';

// --- Filter Chip Component ---
const FilterChip = ({ label, isActive, onClick }) => (
  <label
    className={`px-3 py-1 text-sm font-medium rounded-full cursor-pointer transition-all duration-200 border
                ${isActive 
                  ? 'bg-cyan-500 border-cyan-400 text-gray-900' 
                  : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600 hover:border-gray-500'}`}
    onClick={onClick}
  >
    {label}
  </label>
);

// --- Main Tab Content Component ---
const NotamTabContent = ({ icao, notams, loading, error }) => {
  const [keywordFilter, setKeywordFilter] = useState('');
  const [filters, setFilters] = useState({
    rwy: true,
    twy: true,
    ils: true,
    fuel: true,
    other: true,
    cancelled: false,
    current: true,
    future: true,
  });

  const handleFilterChange = (filterKey) => {
    setFilters(prev => ({ ...prev, [filterKey]: !prev[filterKey] }));
  };

  const filteredNotams = useMemo(() => {
    if (!notams) return [];
    
    return notams.filter(notam => {
      const classification = getNotamClassification(notam);
      const text = (notam.summary || '').toLowerCase();

      // Keyword filter
      if (keywordFilter && !text.includes(keywordFilter.toLowerCase())) {
        return false;
      }

      // Time-based filters
      const isCurrent = isNotamCurrent(notam);
      const isFuture = isNotamFuture(notam);
      if (!filters.current && isCurrent) return false;
      if (!filters.future && isFuture) return false;

      // Category filters
      if (classification.isRunway && !filters.rwy) return false;
      if (classification.isTaxiway && !filters.twy) return false;
      if (classification.isILS && !filters.ils) return false;
      if (classification.isFuel && !filters.fuel) return false;
      if (classification.isCancelled && !filters.cancelled) return false;
      if (classification.isOther && !filters.other) return false;

      return true;
    });
  }, [notams, keywordFilter, filters]);

  if (loading) {
    return <div className="text-center p-10 text-yellow-400">Loading NOTAMs for {icao}...</div>;
  }

  if (error) {
    return <div className="text-center p-10 text-red-400">Error fetching data for {icao}: {error}</div>;
  }

  const filterConfig = [
      { key: 'rwy', label: 'RWY' }, { key: 'twy', label: 'TWY' },
      { key: 'ils', label: 'ILS' }, { key: 'fuel', label: 'Fuel' },
      { key: 'other', label: 'Other' }, { key: 'cancelled', label: 'Cancelled' },
  ];

  const timeFilterConfig = [
      { key: 'current', label: 'Current' }, { key: 'future', label: 'Future' },
  ];

  return (
    <div className="p-4 sm:p-6">
      {/* Filter Controls */}
      {notams && notams.length > 0 && (
        <div className="bg-gray-900/70 p-4 rounded-lg mb-6 space-y-4">
          <input
            type="text"
            placeholder="Filter by keyword..."
            className="bg-gray-700 p-2 rounded text-white placeholder-gray-400 w-full"
            value={keywordFilter}
            onChange={(e) => setKeywordFilter(e.target.value)}
          />
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm font-medium text-gray-400 mr-2">Category:</span>
            {filterConfig.map(({ key, label }) => (
              <FilterChip key={key} label={label} isActive={filters[key]} onClick={() => handleFilterChange(key)} />
            ))}
          </div>
           <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm font-medium text-gray-400 mr-2">Time:</span>
            {timeFilterConfig.map(({ key, label }) => (
              <FilterChip key={key} label={label} isActive={filters[key]} onClick={() => handleFilterChange(key)} />
            ))}
          </div>
        </div>
      )}

      {/* NOTAM Grid */}
      {filteredNotams.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {filteredNotams.map(notam => (
            <NotamCard key={notam.id} notam={notam} />
          ))}
        </div>
      ) : (
        <div className="text-center p-10 text-gray-400">
          {notams && notams.length > 0 ? 'No NOTAMs match your filter criteria.' : `No active NOTAMs found for ${icao}.`}
        </div>
      )}
    </div>
  );
};

export default NotamTabContent;
