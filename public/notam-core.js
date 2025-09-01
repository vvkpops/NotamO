// === notam-core.js ===
// Core state, session, batching, ICAO sets, and all helpers

// === ICAO CLASSIFICATION MAP FOR DISPLAY ===
const ICAO_CLASSIFICATION_MAP = {
  AA: "Aerodrome",
  RW: "Runway",
  TW: "Taxiway",
  AB: "Obstacle",
  AC: "Communications",
  AD: "Navigation Aid",
  AE: "Airspace Restriction",
  AO: "Other",
  GP: "GPS",
  NAV: "Navigation",
  COM: "Communication",
  SVC: "Service",
  DOM: "Domestic",
  INTL: "International",
  MISC: "Miscellaneous",
  SEC: "Security",
  FDC: "Flight Data Center",
  SAA: "Special Activity Airspace"
};

function getClassificationTitle(classification) {
  if (!classification) return "Other";
  const code = classification.trim().toUpperCase();
  return ICAO_CLASSIFICATION_MAP[code] || "Other";
}

// === SINGLE ACTIVE SESSION (browser/tab only) ===
const SESSION_ID = Math.random().toString(36).substr(2, 9);
let activeSession = true;
const SESSION_CHANNEL = 'notamDashboardSession';
let bc = null;
if (window.BroadcastChannel) {
  bc = new BroadcastChannel(SESSION_CHANNEL);
  bc.onmessage = (event) => {
    if (event.data && event.data.type === 'new-session' && event.data.sessionId !== SESSION_ID) {
      activeSession = false;
      try { window.close(); } catch {}
      document.body.innerHTML = `<div style="margin-top:80px;text-align:center;font-size:2em;color:#44f;">
        This NOTAM Dashboard session is now inactive because another session started in this browser.</div>`;
      if (window.icaoBatchTimer) clearInterval(window.icaoBatchTimer);
      if (window.autoRefreshTimer) clearInterval(window.autoRefreshTimer);
    }
  };
  bc.postMessage({ type: 'new-session', sessionId: SESSION_ID });
} else {
  window.addEventListener('storage', (event) => {
    if (event.key === SESSION_CHANNEL && event.newValue !== SESSION_ID) {
      activeSession = false;
      try { window.close(); } catch {}
      document.body.innerHTML = `<div style="margin-top:80px;text-align:center;font-size:2em;color:#44f;">
        This NOTAM Dashboard session is now inactive because another session started in this browser.</div>`;
      if (window.icaoBatchTimer) clearInterval(window.icaoBatchTimer);
      if (window.autoRefreshTimer) clearInterval(window.autoRefreshTimer);
    }
  });
  localStorage.setItem(SESSION_CHANNEL, SESSION_ID);
}
function claimActiveSession() {
  if (bc) {
    bc.postMessage({ type: 'new-session', sessionId: SESSION_ID });
  } else {
    localStorage.setItem(SESSION_CHANNEL, SESSION_ID);
  }
}
claimActiveSession();

// === ICAO STATE ===
let loadedIcaosSet = new Set();
let icaoQueue = [];
let loadingIcaosSet = new Set();
let icaoBatchLastRun = Date.now();
let icaoBatchWindowStart = Date.now();
let icaoBatchCallCount = 0;
const ICAO_BATCH_SIZE = 10;
const ICAO_BATCH_INTERVAL_MS = 65000;
const ICAO_BATCH_CALL_LIMIT = 30;
let batchingActive = false;
window.icaoBatchTimer = null;

let icaoSet = [];
let notamDataByIcao = {};
let notamFetchStatusByIcao = {};
let lastNotamIdsByIcao = {};
let latestNewNotamKey = null;
let tabMode = "ALL"; // <-- crucial for UI tab logic

// ICAO sets
function getIcaoSets() {
  return JSON.parse(localStorage.getItem('icaoSets') || '[]');
}
function saveIcaoSets(sets) {
  localStorage.setItem('icaoSets', JSON.stringify(sets));
}
function saveIcaos() {
  localStorage.setItem('notamIcaos', JSON.stringify(icaoSet));
}

// Batching
function startBatchingIfNeeded() {
  if (!batchingActive) {
    batchingActive = true;
    scheduleNextBatch(0);
  }
}
function stopBatching() { batchingActive = false; }
function scheduleNextBatch(delay = ICAO_BATCH_INTERVAL_MS) {
  if (!batchingActive) return;
  if (window.icaoBatchTimer) clearTimeout(window.icaoBatchTimer);
  window.icaoBatchTimer = setTimeout(processIcaoBatch, delay);
}

// NEW: Helper function to introduce a delay
const delay = ms => new Promise(res => setTimeout(res, ms));

async function processIcaoBatch() {
  if (!activeSession) return;
  if (icaoQueue.length === 0) { stopBatching(); return; }
  const now = Date.now();
  if (now - icaoBatchWindowStart > ICAO_BATCH_INTERVAL_MS) {
    icaoBatchWindowStart = now;
    icaoBatchCallCount = 0;
  }
  let batchSize = Math.min(ICAO_BATCH_SIZE, ICAO_BATCH_CALL_LIMIT - icaoBatchCallCount, icaoQueue.length);
  if (batchSize <= 0) {
    scheduleNextBatch(icaoBatchWindowStart + ICAO_BATCH_INTERVAL_MS - now + 50);
    return;
  }
  const batch = [];
  while (batch.length < batchSize && icaoQueue.length > 0) {
    const icao = icaoQueue.shift();
    if (!loadedIcaosSet.has(icao) && !loadingIcaosSet.has(icao)) {
      batch.push(icao);
      loadingIcaosSet.add(icao);
    }
  }
  if (typeof updateIcaoStatusBar === "function") updateIcaoStatusBar();
  
  // MODIFIED: Loop through the batch with a delay
  for (const icao of batch) {
    try {
      const result = await fetchNotamsForIcao(icao, true, true);
      if (result && !result.error && Array.isArray(result)) {
        loadedIcaosSet.add(icao);
        icaoBatchCallCount++;
      } else {
        icaoQueue.push(icao);
      }
    } catch {
      icaoQueue.push(icao);
    }
    loadingIcaosSet.delete(icao);
    if (typeof updateIcaoStatusBar === "function") updateIcaoStatusBar();
    
    // Wait for 2.1 seconds before the next call to stay under the rate limit
    await delay(2100); 
  }

  if (icaoQueue.length > 0 && icaoBatchCallCount < ICAO_BATCH_CALL_LIMIT) {
    scheduleNextBatch(100); // Check for more almost immediately
  } else if (icaoQueue.length > 0) {
    const nextDelay = icaoBatchWindowStart + ICAO_BATCH_INTERVAL_MS - Date.now();
    scheduleNextBatch(Math.max(nextDelay, 0));
  } else {
    stopBatching();
  }
}
function enqueueIcaos(icaos) {
  let added = false;
  icaos.forEach(icao => {
    if (!loadedIcaosSet.has(icao) && !icaoQueue.includes(icao) && !loadingIcaosSet.has(icao)) {
      icaoQueue.push(icao);
      added = true;
    }
  });
  if (added) startBatchingIfNeeded();
}

// Helpers
function parseDate(s) {
  if (!s) return null;
  let iso = s.trim().replace(' ', 'T');
  if (!/Z$|[+-]\d{2}:?\d{2}$/.test(iso)) iso += 'Z';
  let d = new Date(iso);
  return isNaN(d) ? null : d;
}
function getNotamFlags(n) {
  const s = (n.summary + ' ' + n.body).toUpperCase();
  return {
    isRunwayClosure: /\b(RWY|RUNWAY)[^\n]*\b(CLSD|CLOSED)\b/.test(s),
    isTaxiwayClosure: /\b(TWY|TAXIWAY)[^\n]*\b(CLSD|CLOSED)\b/.test(s),
    isRSC: /\bRSC\b/.test(s),
    isCRFI: /\bCRFI\b/.test(s),
    isILS: /\bILS\b/.test(s) && !/\bCLOSED|CLSD\b/.test(s),
    isFuel: /\bFUEL\b/.test(s),
    isCancelled: n.type === "C" || /\b(CANCELLED|CNL)\b/.test(s),
  };
}
function extractRunways(text) {
  const rwyMatches = [];
  const regex = /\bRWY\s*(\d{2,3}(?:[LRC])?(?:\/\d{2,3}(?:[LRC])?)*)/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    rwyMatches.push(match[1]);
  }
  return [...new Set(rwyMatches)].join(', ');
}

// --- Ensure these functions are available globally ---
async function ensureIcaoNotamsLoadedOnDemand(icao) {
  if (notamFetchStatusByIcao[icao]) return;
  if (icaoQueue.includes(icao) || loadingIcaosSet.has(icao)) return;
  const now = Date.now();
  if (now - icaoBatchWindowStart > ICAO_BATCH_INTERVAL_MS) {
    icaoBatchWindowStart = now;
    icaoBatchCallCount = 0;
  }
  if (icaoBatchCallCount < ICAO_BATCH_CALL_LIMIT) {
    loadingIcaosSet.add(icao);
    if (typeof updateIcaoStatusBar === "function") updateIcaoStatusBar();
    try {
      await fetchNotamsForIcao(icao, false, false);
      loadedIcaosSet.add(icao);
      icaoBatchCallCount++;
    } catch {
      if (!icaoQueue.includes(icao)) icaoQueue.push(icao);
      startBatchingIfNeeded();
    }
    loadingIcaosSet.delete(icao);
    if (typeof updateIcaoStatusBar === "function") updateIcaoStatusBar();
  } else {
    if (!icaoQueue.includes(icao)) icaoQueue.push(icao);
    startBatchingIfNeeded();
  }
}
async function ensureIcaoNotamsLoaded(icao) {
  if (!notamFetchStatusByIcao[icao]) {
    await fetchNotamsForIcao(icao, false, false);
  }
}
// Attach to window for UI script
window.ensureIcaoNotamsLoaded = ensureIcaoNotamsLoaded;
window.ensureIcaoNotamsLoadedOnDemand = ensureIcaoNotamsLoadedOnDemand;

// === AUTO REFRESH LOGIC ===
let AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let autoRefreshTimer = null;
let autoRefreshCountdown = AUTO_REFRESH_INTERVAL_MS / 1000;
let autoRefreshActive = false;

// Timer UI update
function updateAutoRefreshTimerUI() {
  const timerElem = document.getElementById('icao-progress-timer');
  if (!timerElem) return;
  const min = Math.floor(autoRefreshCountdown / 60);
  const sec = autoRefreshCountdown % 60;
  timerElem.textContent = `Auto refresh in ${min}:${sec.toString().padStart(2, '0')}`;
}

// Start/stop/reset logic
function startAutoRefresh() {
  stopAutoRefresh(); // clear any existing interval
  autoRefreshActive = true;
  autoRefreshCountdown = AUTO_REFRESH_INTERVAL_MS / 1000;
  updateAutoRefreshTimerUI();
  autoRefreshTimer = setInterval(() => {
    autoRefreshCountdown--;
    updateAutoRefreshTimerUI();
    if (autoRefreshCountdown <= 0) {
      performAutoRefresh();
      autoRefreshCountdown = AUTO_REFRESH_INTERVAL_MS / 1000;
      updateAutoRefreshTimerUI();
    }
  }, 1000);
}

function stopAutoRefresh() {
  autoRefreshActive = false;
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = null;
}

function resetAutoRefresh() {
  autoRefreshCountdown = AUTO_REFRESH_INTERVAL_MS / 1000;
  updateAutoRefreshTimerUI();
}

// Main auto-refresh logic (runs every 5min or on manual reload)
async function performAutoRefresh() {
  if (!activeSession) return;
  const icaosToRefresh = Array.isArray(icaoSet) ? icaoSet.slice() : [];
  if (!icaosToRefresh.length) return;

  // Store previous NOTAMs for each ICAO
  let previousByIcao = {};
  for (const icao of icaosToRefresh) {
    previousByIcao[icao] = Array.isArray(notamDataByIcao[icao]) ? notamDataByIcao[icao].slice() : [];
  }

  // MODIFIED: Fetch all NOTAMs, with per-ICAO fallback and a delay
  let newDataByIcao = {};
  for (const icao of icaosToRefresh) {
    try {
      const data = await fetchNotamsForIcao(icao, false, true);
      if (Array.isArray(data) && !data.error) {
        newDataByIcao[icao] = data;
      } else {
        newDataByIcao[icao] = previousByIcao[icao];
      }
    } catch {
      newDataByIcao[icao] = previousByIcao[icao];
    }
    // Wait for 2.1 seconds before the next call to stay under the rate limit
    await delay(2100);
  }

  for (const icao of icaosToRefresh) {
    const prev = previousByIcao[icao] || [];
    const next = newDataByIcao[icao] || [];
    let prevMap = new Map(prev.map(n => [(n.id || n.number || n.qLine || n.summary), n]));
    let nextMap = new Map(next.map(n => [(n.id || n.number || n.qLine || n.summary), n]));

    let newNotams = next.filter(n => !prevMap.has(n.id || n.number || n.qLine || n.summary));
    let goneNotams = prev.filter(n => !nextMap.has(n.id || n.number || n.qLine || n.summary));

    notamDataByIcao[icao] = next;
    notamFetchStatusByIcao[icao] = true;
    lastNotamIdsByIcao[icao] = new Set(next.map(n => n.id || n.number || n.qLine || n.summary));

    if (typeof window.updateNotamCardsForIcao === "function") {
      window.updateNotamCardsForIcao(icao, next, newNotams, goneNotams);
    }
  }
}

// Start auto-refresh on page load
window.addEventListener('DOMContentLoaded', () => {
  startAutoRefresh();
});

window.performAutoRefresh = performAutoRefresh;
window.resetAutoRefresh = resetAutoRefresh;
