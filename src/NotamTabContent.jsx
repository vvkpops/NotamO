import React, { useState, useEffect } from 'react';
import NotamCard from './NotamCard';

const NotamTabContent = ({ icao }) => {
  const [notams, setNotams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!icao) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/notams?icao=${icao}`);
        const data = await response.json();
        if (!response.ok || data.error) {
          throw new Error(data.error || `Network error: ${response.status}`);
        }
        setNotams(data);
      } catch (err) {
        setError(err.message);
        setNotams([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 10 * 60 * 1000); // Refresh every 10 minutes
    return () => clearInterval(interval);
  }, [icao]);

  if (loading) {
    return <div className="text-center p-10 text-yellow-400">Loading NOTAMs for {icao}...</div>;
  }

  if (error) {
    return <div className="text-center p-10 text-red-400">Error fetching data for {icao}: {error}</div>;
  }

  return (
    <div className="p-4 sm:p-6">
      {notams.length > 0 ? (
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
