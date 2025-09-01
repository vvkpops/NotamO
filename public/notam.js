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
const ICAO_BATCH_INTERVAL_MS = 65000; // 65 seconds
const ICAO_BATCH_CALL_LIMIT = 30;

// === ICAO SETS FEATURE ===
function getIcaoSets() {
  return JSON.parse(localStorage.getItem('icaoSets') || '[]');
}
function saveIcaoSets(sets) {
  localStorage.setItem('icaoSets', JSON.stringify(sets));
}
function renderIcaoSetsBar() {
  const bar = document.getElementById('icao-sets-bar');
  if (!bar) return;
  bar.innerHTML = '';
  let sets = getIcaoSets();
  sets.forEach((set, i) => {
    let btn = document.createElement('button');
    btn.className = "icao-set-btn";
    btn.textContent = set.name;
    btn.title = "Load this set";
    btn.onclick = async () => {
      icaoSet = set.icaos.slice();
      saveIcaos();
      renderIcaoList();
      renderTabs();
      renderCards();
      set.icaos.forEach(icao => {
        if (!loadedIcaosSet.has(icao) && !icaoQueue.includes(icao) && !loadingIcaosSet.has(icao)) {
          icaoQueue.push(icao);
        }
      });
      updateIcaoStatusBar();
      startBatchingIfNeeded();
    };
    bar.appendChild(btn);

    let del = document.createElement('button');
    del.className = "icao-set-del";
    del.textContent = '✕';
    del.title = "Delete this set";
    del.onclick = () => {
      sets.splice(i,1);
      saveIcaoSets(sets);
      renderIcaoSetsBar();
    };
    bar.appendChild(del);
  });
  if (sets.length < 3) {
    let add = document.createElement('button');
    add.className = "icao-set-add";
    add.textContent = "+ Save Set";
    add.title = "Save the current ICAOs as a set";
    add.onclick = () => {
      let name = prompt("Set name?");
      if (!name) return;
      if (!icaoSet.length) {
        alert("No ICAOs to save.");
        return;
      }
      if (sets.some(s => s.name === name)) {
        alert("Set name must be unique.");
        return;
      }
      sets.push({name: name, icaos: icaoSet.slice()});
      saveIcaoSets(sets);
      renderIcaoSetsBar();
    };
    bar.appendChild(add);
  }
}

// === PROGRESS BAR ===
function updateIcaoProgressBar() {
  const total = icaoSet.length;
  const loaded = icaoSet.filter(icao => loadedIcaosSet.has(icao)).length;
  const queued = icaoSet.filter(icao => !loadedIcaosSet.has(icao) && !loadingIcaosSet.has(icao)).length;
  let percent = total === 0 ? 0 : (loaded / total) * 100;
  const bar = document.getElementById('icao-progress-bar');
  if (bar) {
    bar.style.width = percent + "%";
    bar.style.background = percent === 100 ? "#3fe8a6" : "#0ff";
  }
  const text = document.getElementById('icao-progress-text');
  if (text) text.textContent = `${loaded} / ${total} loaded`;
  const timer = document.getElementById('icao-progress-timer');
  if (timer) {
    if (queued > 0) {
      timer.style.display = "";
      timer.textContent = "Next batch in: " + getRemainingBatchTime();
    } else {
      timer.style.display = "none";
    }
  }
}
function getRemainingBatchTime() {
  const elapsed = (Date.now() - icaoBatchWindowStart) / 1000;
  const remain = Math.max(0, 65 - Math.floor(elapsed));
  const mm = String(Math.floor(remain / 60)).padStart(2, "0");
  const ss = String(remain % 60).padStart(2, "0");
  return mm + ":" + ss;
}
setInterval(updateIcaoProgressBar, 1000);

function updateIcaoStatusBar() {
  updateIcaoProgressBar();
}

// === BATCH FETCHING LOGIC (IMPROVED) ===
let batchingActive = false;
function startBatchingIfNeeded() {
  if (!batchingActive) {
    batchingActive = true;
    scheduleNextBatch(0);
  }
}
function stopBatching() {
  batchingActive = false;
}
function scheduleNextBatch(delay = ICAO_BATCH_INTERVAL_MS) {
  if (!batchingActive) return;
  if (window.icaoBatchTimer) clearTimeout(window.icaoBatchTimer);
  window.icaoBatchTimer = setTimeout(processIcaoBatch, delay);
}
async function processIcaoBatch() {
  if (!activeSession) return;
  if (icaoQueue.length === 0) {
    stopBatching();
    return;
  }
  const now = Date.now();
  // Reset batch window if needed
  if (now - icaoBatchWindowStart > ICAO_BATCH_INTERVAL_MS) {
    icaoBatchWindowStart = now;
    icaoBatchCallCount = 0;
  }
  // Only fetch up to ICAO_BATCH_SIZE and not exceeding ICAO_BATCH_CALL_LIMIT
  let batchSize = Math.min(ICAO_BATCH_SIZE, ICAO_BATCH_CALL_LIMIT - icaoBatchCallCount, icaoQueue.length);
  if (batchSize <= 0) {
    // Wait for the current batch window to reset
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
  updateIcaoStatusBar();
  let anySuccess = false;
  for (const icao of batch) {
    try {
      const result = await fetchNotamsForIcao(icao, true, true);
      if (result && !result.error && Array.isArray(result)) {
        loadedIcaosSet.add(icao);
        anySuccess = true;
        icaoBatchCallCount++;
      } else {
        // If failed, requeue
        icaoQueue.push(icao);
      }
    } catch {
      icaoQueue.push(icao);
    }
    loadingIcaosSet.delete(icao);
    updateIcaoStatusBar();
  }
  // If there are still ICAOs in the queue and we haven't hit the call limit, process the next batch right away
  if (icaoQueue.length > 0 && icaoBatchCallCount < ICAO_BATCH_CALL_LIMIT) {
    scheduleNextBatch(300); // Short delay before next batch to drain queue quickly
  } else if (icaoQueue.length > 0) {
    // Wait for window to reset
    const nextDelay = icaoBatchWindowStart + ICAO_BATCH_INTERVAL_MS - Date.now();
    scheduleNextBatch(Math.max(nextDelay, 0));
  } else {
    stopBatching();
  }
}
window.icaoBatchTimer = null;
// Start batching as soon as there are ICAOs in the queue
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

// === NOTIFICATION CENTER ===
let notificationsList = [];
let notificationIdCounter = 1;

function getUnreadNotificationCount() {
  return notificationsList.filter(n => !n.read).length;
}
function getUnreadForIcao(icao) {
  return notificationsList.filter(n => !n.read && n.icao === icao);
}
function updateNotificationBadge() {
  const badge = document.getElementById('notification-badge');
  if (!badge) return;
  const unread = getUnreadNotificationCount();
  if (unread > 0) {
    badge.textContent = unread;
    badge.style.display = "inline-block";
  } else {
    badge.style.display = "none";
  }
}
function renderNotificationList() {
  const listDiv = document.getElementById('notification-list');
  if (!listDiv) return;
  listDiv.innerHTML = "";
  if (notificationsList.length === 0) {
    listDiv.innerHTML = `<div style="padding:24px 0;text-align:center;color:#aaa;">No notifications</div>`;
    return;
  }
  notificationsList.slice().reverse().forEach(n => {
    let el = document.createElement("div");
    el.className = "notification-item" + (n.read ? "" : " unread");
    el.innerHTML = `<div style="font-size:1em;">${n.message}</div>
      <div style="font-size:0.93em;color:#7ae;">${n.icao}</div>
      <div style="font-size:0.88em;color:#aaa;">${n.time}</div>`;
    el.onclick = async function() {
      n.read = true;
      updateNotificationBadge();
      renderNotificationList();
      document.getElementById('notification-modal').style.display = "none";
      const alert = document.getElementById('notam-alert');
      if (alert) alert.classList.add('hidden');
      if (typeof n.icao === "string" && tabMode !== n.icao) {
        tabMode = n.icao;
        renderTabs();
        await ensureIcaoNotamsLoaded(n.icao);
        await renderCards();
      }
      const unreadForIcao = getUnreadForIcao(n.icao);
      if (unreadForIcao.length === 0 && typeof n.cardKey === "string") {
        setTimeout(() => {
          const card = document.getElementById('notam-' + n.cardKey.replace(/[^a-zA-Z0-9_-]/g,''));
          if (card) {
            card.scrollIntoView({behavior: "smooth", block:"center"});
            card.classList.add('ring-4','ring-green-400');
            setTimeout(() => card.classList.remove('ring-4','ring-green-400'), 1800);
          }
        }, 120);
      }
    };
    listDiv.appendChild(el);
  });
}
document.addEventListener("DOMContentLoaded", () => {
  renderIcaoSetsBar();
  const bell = document.getElementById('notification-bell');
  const modal = document.getElementById('notification-modal');
  if (bell) {
    bell.onclick = function() {
      renderNotificationList();
      modal.style.display = modal.style.display === "none" || !modal.style.display ? "block" : "none";
    };
  }
  const clearBtn = document.getElementById('clear-notifications-btn');
  if (clearBtn) {
    clearBtn.onclick = function() {
      notificationsList = [];
      renderNotificationList();
      updateNotificationBadge();
      modal.style.display = "none";
      const alert = document.getElementById('notam-alert');
      if (alert) alert.classList.add('hidden');
    };
  }
});
window.addEventListener('click', function(e) {
  const modal = document.getElementById('notification-modal');
  const bell = document.getElementById('notification-bell');
  if (!modal || !bell) return;
  if (modal.style.display === "block" &&
    !modal.contains(e.target) && !bell.contains(e.target)) {
    modal.style.display = "none";
  }
});
function showNewNotamAlert(msg, icao, notamKey) {
  notificationsList.push({
    id: notificationIdCounter++,
    message: msg,
    icao: icao,
    cardKey: notamKey,
    time: new Date().toLocaleTimeString(),
    read: false
  });
  updateNotificationBadge();
  const el = document.getElementById('notam-alert');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.onclick = async function() {
    el.classList.add('hidden');
    if (typeof icao !== "undefined" && tabMode !== icao) {
      tabMode = icao;
      renderTabs();
      await ensureIcaoNotamsLoaded(icao);
      await renderCards();
    }
    setTimeout(() => {
      const card = document.getElementById('notam-' + notamKey.replace(/[^a-zA-Z0-9_-]/g,''));
      if (card) {
        card.scrollIntoView({behavior: "smooth", block:"center"});
        card.classList.add('ring-4','ring-green-400');
        setTimeout(() => card.classList.remove('ring-4','ring-green-400'), 1800);
      }
    }, 120);
    notificationsList.forEach(n => {
      if (n.cardKey === notamKey) n.read = true;
    });
    updateNotificationBadge();
    renderNotificationList();
  };
}

// === REST OF APP LOGIC ===
let lastNotamIdsByIcao = {};
let latestNewNotamKey = null;

const form = document.getElementById('icao-form');
const icaoInput = document.getElementById('icao-input');
const icaoList = document.getElementById('icao-list');
const reloadBtn = document.getElementById('reload-all');
const result = document.getElementById('result');
const fRwy = document.getElementById('f-rwy');
const fTwy = document.getElementById('f-twy');
const fRsc = document.getElementById('f-rsc');
const fCrfi = document.getElementById('f-crfi');
const fIls = document.getElementById('f-ils');
const fOther = document.getElementById('f-other');
const fFuel = document.getElementById('f-fuel');
const fCancelled = document.getElementById('f-cancelled');
const fDom = document.getElementById('f-dom');
const fCurrent = document.getElementById('f-current');
const fFuture = document.getElementById('f-future');
const fKeyword = document.getElementById('f-keyword');
const icaoTabs = document.getElementById('icao-tabs');
const cardScaleSlider = document.getElementById('card-scale-slider');
const cardScaleValue = document.getElementById('card-scale-value');
const backToTopBtn = document.getElementById('back-to-top-btn');

let icaoSet = [];
let notamDataByIcao = {};
let notamFetchStatusByIcao = {};
let tabMode = "ALL";

function setCardScale(val) {
  document.documentElement.style.setProperty('--card-scale', val);
  document.documentElement.style.setProperty('--card-width', `${Math.round(420 * val)}px`);
  cardScaleValue.textContent = (+val).toFixed(2) + "x";
  localStorage.setItem('notamCardScale', val);
}
let savedScale = localStorage.getItem('notamCardScale');
if (savedScale) {
  cardScaleSlider.value = savedScale;
  setCardScale(savedScale);
} else {
  setCardScale(cardScaleSlider.value);
}
cardScaleSlider.addEventListener('input', e => setCardScale(e.target.value));

const savedIcaos = JSON.parse(localStorage.getItem('notamIcaos') || '[]');
if (Array.isArray(savedIcaos) && savedIcaos.length > 0) {
  icaoSet = savedIcaos;
  enqueueIcaos(icaoSet);
  updateIcaoStatusBar();
  renderIcaoList();
  renderTabs();
  renderCards();
}
function saveIcaos() {
  localStorage.setItem('notamIcaos', JSON.stringify(icaoSet));
}
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
function getNotamType(n) {
  const f = getNotamFlags(n);
  if (f.isCancelled) return 'cancelled';
  if (f.isRunwayClosure) return 'rwy';
  if (f.isTaxiwayClosure) return 'twy';
  if (f.isRSC) return 'rsc';
  if (f.isCRFI) return 'crfi';
  if (f.isILS) return 'ils';
  if (f.isFuel) return 'fuel';
  return 'other';
}
function getHeadClass(n) {
  const t = getNotamType(n);
  if (t === "rwy") return "head-rwy";
  if (t === "twy") return "head-twy";
  if (t === "rsc") return "head-rsc";
  if (t === "crfi") return "head-crfi";
  if (t === "ils") return "head-ils";
  if (t === "fuel") return "head-fuel";
  if (t === "cancelled") return "head-cancelled";
  return "head-other";
}
function getHeadTitle(n) {
  const t = getNotamType(n);
  if (t === 'rwy') return "RWY CLOSURE";
  if (t === 'twy') return "TWY CLOSURE";
  if (t === 'rsc') return "RSC";
  if (t === 'crfi') return "CRFI";
  if (t === 'ils') return "ILS";
  if (t === 'fuel') return "FUEL";
  if (t === 'cancelled') return "CANCELLED";
  return "Other";
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
function filterAndSort(arr) {
  const now = new Date();
  const showCurrent = fCurrent.checked;
  const showFuture = fFuture.checked;
  const showCancelled = fCancelled.checked;
  const showDom = fDom.checked;
  const showRwy = fRwy.checked, showTwy = fTwy.checked, showRsc = fRsc.checked, showCrfi = fCrfi.checked, showIls = fIls.checked, showFuel = fFuel.checked, showOther = fOther.checked;
  const noTypeChecked = !showRwy && !showTwy && !showRsc && !showCrfi && !showIls && !showFuel && !showOther;
  const noStatusChecked = !showCurrent && !showFuture;
  let filtered = arr.filter(n => {
    if (n.classification === "DOM" && !showDom) return false;
    const t = getNotamType(n);
    if (!showCancelled && t === "cancelled") return false;
    if (!noTypeChecked) {
      if (t === "rwy" && !showRwy) return false;
      if (t === "twy" && !showTwy) return false;
      if (t === "rsc" && !showRsc) return false;
      if (t === "crfi" && !showCrfi) return false;
      if (t === "ils" && !showIls) return false;
      if (t === "fuel" && !showFuel) return false;
      if (t === "other" && !showOther) return false;
    }
    if (!showCancelled && t === "cancelled") return false;
    const from = parseDate(n.validFrom), to = parseDate(n.validTo);
    if (!from || !to) {
      if (!noStatusChecked) return false;
    } else {
      const isCurrent = (now >= from && now <= to);
      const isFuture = now < from;
      if (!noStatusChecked) {
        if (!showCurrent && isCurrent) return false;
        if (!showFuture && isFuture) return false;
        if (!isCurrent && !isFuture) return false;
      }
    }
    if (showCancelled && t === "cancelled") return true;
    const kw = fKeyword.value.trim().toLowerCase();
    if (kw) {
      let found = false;
      ['number','type','classification','icao','summary','body'].forEach(field=>{
        if (n[field] && n[field].toLowerCase().includes(kw)) found = true;
      });
      if (!found) return false;
    }
    return true;
  });
  filtered.sort((a, b) => {
    const getPriority = n => {
      const t = getNotamType(n);
      if (t === 'rwy') return 6;
      if (t === 'twy') return 5;
      if (t === 'rsc') return 4;
      if (t === 'crfi') return 3;
      if (t === 'ils') return 2;
      if (t === 'fuel') return 1.5;
      if (t === 'cancelled') return -1;
      return 1;
    }
    return getPriority(b) - getPriority(a);
  });
  return filtered;
}
function renderIcaoList() {
  icaoList.innerHTML = '';
  for (const icao of icaoSet) {
    const tag = document.createElement('div');
    tag.className = "bg-cyan-700/70 px-3 py-1 rounded-full font-mono text-lg uppercase tracking-wide flex items-center gap-2";
    tag.innerHTML = `<span>${icao}</span>
      <button class="text-pink-200 hover:text-red-400 text-xl font-bold focus:outline-none" title="Remove ${icao}" onclick="removeIcao('${icao}')">
        <i class="fa-solid fa-circle-xmark"></i>
      </button>`;
    icaoList.appendChild(tag);
  }
}
window.removeIcao = function(icao) {
  icaoSet = icaoSet.filter(x => x !== icao);
  delete notamDataByIcao[icao];
  delete notamFetchStatusByIcao[icao];
  loadedIcaosSet.delete(icao);
  loadingIcaosSet.delete(icao);
  icaoQueue = icaoQueue.filter(x => x !== icao);
  updateIcaoStatusBar();
  if (tabMode === icao) tabMode = "ALL";
  renderIcaoList();
  renderTabs();
  renderCards();
  saveIcaos();
  renderIcaoSetsBar();
};

// ---- ICAO Tabs with Realtime Fetch ----
function renderTabs() {
  icaoTabs.innerHTML = '';
  if (icaoSet.length > 1) {
    const allTab = document.createElement('button');
    allTab.className = `px-4 py-1 rounded-t-lg font-bold ${tabMode === "ALL" ? "bg-cyan-600/60 text-white shadow" : "bg-[#222940] text-cyan-300"} mr-2 mb-1`;
    allTab.textContent = "ALL";
    allTab.onclick = () => { tabMode = "ALL"; renderTabs(); renderCards(); };
    icaoTabs.appendChild(allTab);
  }
  for (const icao of icaoSet) {
    const tab = document.createElement('button');
    tab.className = `px-4 py-1 rounded-t-lg font-bold uppercase tracking-widest ${tabMode === icao ? "bg-cyan-600/70 text-white shadow" : "bg-[#23283e] text-cyan-200"} mr-2 mb-1`;
    tab.textContent = icao;
    tab.onclick = async () => {
      tabMode = icao;
      renderTabs();
      await ensureIcaoNotamsLoadedOnDemand(icao);
      renderCards();
    };
    icaoTabs.appendChild(tab);
  }
}

// ---- On Demand Realtime Fetch for ICAO Tabs ----
async function ensureIcaoNotamsLoadedOnDemand(icao) {
  if (notamFetchStatusByIcao[icao]) return;
  // If ICAO is already queued for batch, let the batch handle it
  if (icaoQueue.includes(icao) || loadingIcaosSet.has(icao)) return;
  // Check if we are in a "batch window" and how many calls have been made in this window
  const now = Date.now();
  if (now - icaoBatchWindowStart > ICAO_BATCH_INTERVAL_MS) {
    icaoBatchWindowStart = now;
    icaoBatchCallCount = 0;
  }
  if (icaoBatchCallCount < ICAO_BATCH_CALL_LIMIT) {
    loadingIcaosSet.add(icao);
    updateIcaoStatusBar();
    try {
      await fetchNotamsForIcao(icao, false, false);
      loadedIcaosSet.add(icao);
      icaoBatchCallCount++;
    } catch {
      if (!icaoQueue.includes(icao)) icaoQueue.push(icao);
      startBatchingIfNeeded();
    }
    loadingIcaosSet.delete(icao);
    updateIcaoStatusBar();
  } else {
    // Over limit, must wait until window resets, queue for next batch
    if (!icaoQueue.includes(icao)) icaoQueue.push(icao);
    startBatchingIfNeeded();
  }
}
async function ensureIcaoNotamsLoaded(icao) {
  if (!notamFetchStatusByIcao[icao]) {
    await fetchNotamsForIcao(icao, false, false);
  }
}
async function renderCards() {
  updateIcaoStatusBar();
  let html = '';
  if (icaoSet.length === 0) {
    result.innerHTML = `<div class="text-center text-xl text-slate-400 my-14">Add ICAO airport(s) above to fetch NOTAMs</div>`;
    return;
  }
  if (tabMode === "ALL" && icaoSet.length > 1) {
    const loadPromises = icaoSet.map(icao => ensureIcaoNotamsLoaded(icao));
    await Promise.all(loadPromises);
    for (const icao of icaoSet) {
      const arr = notamDataByIcao[icao] || [];
      const filtered = filterAndSort(arr);
      html += `<div class="mb-2">
        <div class="icao-header">${icao} (${filtered.length})</div>
        <div class="notam-grid">`;
      if (filtered.length === 0) {
        html += `<div class="bg-[#23283e]/60 glass p-8 rounded-lg text-center text-base text-slate-400">No NOTAMs match for this ICAO.</div>`;
      } else {
        for (const n of filtered) html += notamCardHtml(n);
      }
      html += `</div></div>`;
    }
    result.innerHTML = html;
    return;
  }
  const icao = tabMode === "ALL" ? icaoSet[0] : tabMode;
  if (!notamFetchStatusByIcao[icao]) {
    result.innerHTML = `<div class="text-center text-lg my-10 text-cyan-400">Loading NOTAMs for ${icao}...</div>`;
    return;
  }
  const arr = notamDataByIcao[icao] || [];
  const filtered = filterAndSort(arr);
  let singleHtml = `<div class="notam-grid">`;
  if (filtered.length === 0) {
    singleHtml += `<div class="bg-[#23283e]/60 glass p-8 rounded-lg text-center text-base text-slate-400">No NOTAMs match for this ICAO.</div>`;
  } else {
    for (const n of filtered) singleHtml += notamCardHtml(n);
  }
  singleHtml += `</div>`;
  result.innerHTML = singleHtml;
}
function notamCardHtml(n) {
  const t = getNotamType(n);
  const headClass = getHeadClass(n);
  const headTitle = getHeadTitle(n);
  const key = (n.id || n.number || n.qLine || n.summary || "").replace(/[^a-zA-Z0-9_-]/g,'');
  const rwyAffected = t === "rwy" ? extractRunways(n.summary + " " + n.body) : "";
  return `
  <div class="glass notam-card notam-animate ${t} flex flex-col h-full"
    id="notam-${key}">
    <div class="card-head ${headClass}">
      <span>${headTitle}</span>
      ${t==='rwy' && rwyAffected ? `<span class="ml-4 text-lg font-extrabold tracking-widest">${rwyAffected}</span>` : n.qLine ? `<span class="qline ml-4">${n.qLine}</span>` : ""}
    </div>
    <div class="notam-card-content">
      <div class="notam-head mb-1">${n.number || ""} <span class="text-base font-normal text-cyan-300 ml-2">${n.icao || ""}</span></div>
      <div class="notam-meta mb-2 text-[1.13em] font-bold">
        <span><b>Type:</b> ${n.type || ""} | </span>
        <span><b>Class:</b> ${getClassificationTitle(n.classification)} | </span>
        <span><b>Valid:</b> ${n.validFrom.replace('T', ' ').slice(0,16)} &rarr; ${n.validTo.replace('T', ' ').slice(0,16)}</span>
      </div>
      <div class="notam-summary mb-2">${n.summary.replace(/\n/g, '<br>')}</div>
      <div class="notam-details">
        <details>
          <summary class="py-1 px-1 rounded hover:bg-cyan-900/30 transition">Show Details</summary>
          <pre class="scrollbar max-h-80 mt-1">${n.qLine ? n.qLine+'\n' : ''}${n.body || ''}</pre>
        </details>
      </div>
    </div>
  </div>
  `;
}
form.onsubmit = async (e) => {
  if (!activeSession) return;
  e.preventDefault();
  let vals = icaoInput.value.split(',').map(v => v.trim().toUpperCase()).filter(Boolean);
  vals = vals.filter(v => /^[A-Z]{4}$/.test(v) && !icaoSet.includes(v));
  if (vals.length === 0) {
    icaoInput.value = "";
    icaoInput.focus();
    return;
  }
  icaoSet = icaoSet.concat(vals);
  saveIcaos();
  enqueueIcaos(vals);
  updateIcaoStatusBar();
  renderIcaoList();
  renderTabs();
  renderCards();
  icaoInput.value = "";
  renderIcaoSetsBar();
};
reloadBtn.onclick = async () => {
  if (!activeSession) return;
  icaoQueue = [];
  loadedIcaosSet.clear();
  loadingIcaosSet.clear();
  Object.keys(notamDataByIcao).forEach(icao => {
    notamFetchStatusByIcao[icao] = false;
  });
  enqueueIcaos(icaoSet);
  updateIcaoStatusBar();
  renderCards();
};
[
  fRwy, fTwy, fRsc, fCrfi, fIls, fFuel, fOther, fCancelled, fDom, fCurrent, fFuture
].forEach(cb => cb.onchange = () => { if (activeSession) renderCards(); });
fKeyword.oninput = () => { if (activeSession) renderCards(); };

async function fetchNotamsForIcao(icao, showAlertIfNew=true, isBatch=false) {
  if (!activeSession) return;
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
    updateIcaoStatusBar();
    if (showAlertIfNew) {
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
    updateIcaoStatusBar();
    return { error: true };
  }
}
window.addEventListener('scroll', () => {
  if (window.scrollY > 300) {
    backToTopBtn.style.display = 'flex';
  } else {
    backToTopBtn.style.display = 'none';
  }
});
backToTopBtn.onclick = () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
