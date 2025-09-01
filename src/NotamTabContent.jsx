import React from 'react';
import NotamCard from './NotamCard';

const NotamTabContent = ({ icao, notams, loading, error }) => {

  if (loading) {
    return <div className="text-center p-10 text-yellow-400">Loading NOTAMs for {icao}...</div>;
  }

  if (error) {
    return <div className="text-center p-10 text-red-400">Error fetching data for {icao}: {error}</div>;
  }

  return (
    <div className="p-4 sm:p-6">
      {notams && notams.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {notams.map(notam => (
            <NotamCard key={notam.id} notam={notam} />
          ))}
        </div>
      ) : (
        <div className="text-center p-10 text-gray-400">No active NOTAMs found for {icao}.</div>
      )}
    </div>
  );
};

export default NotamTabContent;
