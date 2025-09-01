// === notam-network.js ===
// All network and NOTAM fetch logic

async function fetchNotamsForIcao(icao, showAlertIfNew=true, isBatch=false) {
  if (typeof activeSession !== "undefined" && !activeSession) return;
  try {
    const url = `/api/notams?icao=${icao}`;
    const res = await fetch(url);
    let data = [];
    try {
      data = await res.json();
    } catch { data = []; }
    if (data.error || res.status === 429) return { error: true };
    const prevSet = lastNotamIdsByIcao[icao] || new Set();
    const currSet = new Set(data.map(n => n.id || n.number || n.qLine || n.summary));
    lastNotamIdsByIcao[icao] = currSet;
    notamDataByIcao[icao] = data;
    notamFetchStatusByIcao[icao] = true;
    loadingIcaosSet.delete(icao);
    loadedIcaosSet.add(icao);
    if (typeof updateIcaoStatusBar === "function") updateIcaoStatusBar();
    if (showAlertIfNew && typeof showNewNotamAlert === "function") {
      let newCount = 0;
      let newNotamKeys = [];
      for (const n of data) {
        const key = n.id || n.number || n.qLine || n.summary;
        if (!prevSet.has(key)) {
          newCount++;
          newNotamKeys.push(key);
        }
      }
      if (newCount > 0) {
        latestNewNotamKey = newNotamKeys[0];
        showNewNotamAlert(`${icao}: ${newCount} new NOTAM${newCount>1?'s':''} detected!`, icao, newNotamKeys[0]);
      }
    }
    return data;
  } catch (err) {
    loadingIcaosSet.delete(icao);
    if (typeof updateIcaoStatusBar === "function") updateIcaoStatusBar();
    return { error: true };
  }
}