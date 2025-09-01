// === notam-network.js ===
// All network and NOTAM fetch logic

// CRITICAL FIX: Removed 'latestNewNotamKey' as it's not exported from notam-core.js
import { 
  activeSession, notamDataByIcao, notamFetchStatusByIcao, lastNotamIdsByIcao, 
  loadingIcaosSet, loadedIcaosSet
} from './notam-core.js';

// We need to import the UI function to show alerts
import { showNewNotamAlert } from './notam-ui.js';

export async function fetchNotamsForIcao(icao, showAlertIfNew = true, isBatch = false) {
  if (!activeSession) return { error: true, message: "Inactive session" };
  
  try {
    const url = `/api/notams?icao=${icao}`;
    const res = await fetch(url);
    if (!res.ok) {
        // Handle non-2xx responses
        const errorBody = await res.json().catch(() => ({ error: "Failed to parse error response" }));
        console.error(`Fetch failed for ${icao}: ${res.status}`, errorBody);
        return { error: true, status: res.status };
    }

    const data = await res.json();
    if (data.error) {
        console.error(`API error for ${icao}:`, data.error);
        return { error: true, message: data.error };
    }

    const prevSet = lastNotamIdsByIcao[icao] || new Set();
    const currSet = new Set(data.map(n => n.id || n.number || n.qLine || n.summary));
    
    notamDataByIcao[icao] = data;
    notamFetchStatusByIcao[icao] = true;
    loadingIcaosSet.delete(icao);
    loadedIcaosSet.add(icao);

    if (window.updateIcaoStatusBar) window.updateIcaoStatusBar();

    if (showAlertIfNew) {
      const newNotams = data.filter(n => {
        const key = n.id || n.number || n.qLine || n.summary;
        return !prevSet.has(key);
      });

      if (newNotams.length > 0) {
        const firstNewKey = newNotams[0].id || newNotams[0].number || newNotams[0].qLine || newNotams[0].summary;
        showNewNotamAlert(`${icao}: ${newNotams.length} new NOTAM${newNotams.length > 1 ? 's' : ''} detected!`, icao, firstNewKey);
      }
    }
    
    // Update the master set of IDs for the next refresh cycle
    lastNotamIdsByIcao[icao] = currSet;

    return data;
  } catch (err) {
    console.error(`Critical error fetching for ${icao}:`, err);
    loadingIcaosSet.delete(icao);
    if (window.updateIcaoStatusBar) window.updateIcaoStatusBar();
    return { error: true, message: err.message };
  }
}

// Attach to window object so other modules can call it easily
window.fetchNotamsForIcao = fetchNotamsForIcao;
