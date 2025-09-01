import React, { useState, useMemo } from 'react';
import NotamCard from './NotamCard';
import { getNotamType, isNotamCurrent, isNotamFuture } from './NotamUtils';

// --- Filter Chip Component ---
const FilterChip = ({ label, type, isActive, onClick }) => (
  <label
    className={`filter-chip filter-chip-${type} ${isActive ? 'active' : ''}`}
    onClick={onClick}
  >
    {label}
  </label>
);

const NotamTabContent = ({ icao, notams, loading, error }) => {
  const [keywordFilter, setKeywordFilter] = useState('');
  const [filters, setFilters] = useState({
    rwy: true, twy: true, rsc: true, crfi: true, ils: true,
    fuel: true, other: true, cancelled: false, current: true, future: true,
  });

  const handleFilterChange = (filterKey) => {
    setFilters(prev => ({ ...prev, [filterKey]: !prev[filterKey] }));
  };

  const filteredNotams = useMemo(() => {
    if (!notams) return [];
    
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

    return results;
  }, [notams, keywordFilter, filters, icao]);

  if (loading) {
    return <div className="text-center p-10 text-yellow-400">Loading NOTAMs...</div>;
  }

  if (error) {
    return <div className="text-center p-10 text-red-400">Error: {error}</div>;
  }

  const filterConfig = [
    { key: 'rwy', label: 'RWY' }, { key: 'twy', label: 'TWY' }, { key: 'rsc', label: 'RSC' },
    { key: 'crfi', label: 'CRFI' }, { key: 'ils', label: 'ILS' }, { key: 'fuel', label: 'Fuel' },
    { key: 'other', label: 'Other' }, { key: 'cancelled', label: 'Cancelled' },
  ];
  const timeFilterConfig = [{ key: 'current', label: 'Current' }, { key: 'future', label: 'Future' }];

  const renderNotamItem = (notam) => {
    if (notam.isIcaoHeader) {
      return (
        <div key={`header-${notam.icao}`} className="icao-header-card">
          <h3 className="text-xl font-bold text-cyan-300 p-3">{notam.icao}</h3>
        </div>
      );
    }
    return <NotamCard key={notam.id} notam={notam} />;
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="glass p-4 rounded-lg mb-6 space-y-4">
        <input
          type="text"
          placeholder="Filter by keyword..."
          className="px-3 py-2 w-full rounded-lg bg-[#21263b] border border-[#283057] text-base outline-cyan-300"
          value={keywordFilter}
          onChange={(e) => setKeywordFilter(e.target.value)}
        />
        <div className="filter-chips">
          {filterConfig.map(({ key, label }) => (
            <FilterChip key={key} label={label} type={key} isActive={filters[key]} onClick={() => handleFilterChange(key)} />
          ))}
        </div>
        <div className="filter-chips">
          {timeFilterConfig.map(({ key, label }) => (
            <FilterChip key={key} label={label} type={key} isActive={filters[key]} onClick={() => handleFilterChange(key)} />
          ))}
        </div>
      </div>

      <div className="notam-grid">
        {filteredNotams.length > 0 ? (
          filteredNotams.map(item => renderNotamItem(item))
        ) : (
          <div className="text-center p-10 text-gray-400" style={{gridColumn: '1 / -1'}}>
            {notams && notams.length > 0 ? 'No NOTAMs match your filter criteria.' : `No active NOTAMs found.`}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotamTabContent;
