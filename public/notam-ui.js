// === notam-ui.js ===
// All DOM rendering, event listeners, notification center, UI logic

let expandedCardKey = null; // tracks which card is expanded
let flashingIcaos = new Set(); // track which ICAO tabs should be flashing

// --- Notification Center ---
let notificationsList = [];
let notificationIdCounter = 1;
function getUnreadNotificationCount() { return notificationsList.filter(n => !n.read).length; }
function getUnreadForIcao(icao) { return notificationsList.filter(n => !n.read && n.icao === icao); }
function updateNotificationBadge() {
  const badge = document.getElementById('notification-badge');
  if (!badge) return;
  const unread = getUnreadNotificationCount();
  if (unread > 0) {
    badge.textContent = unread;
    badge.style.display = "flex"; // Changed from inline-block
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
        // When clicking a notification, stop flashing for this ICAO
        flashingIcaos.delete(n.icao);
        tabMode = n.icao;
        renderTabs();
        await ensureIcaoNotamsLoaded(n.icao);
        await renderCards();
      }
      if (typeof n.cardKey === "string") {
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
      // When clicking alert, stop flashing for this ICAO
      flashingIcaos.delete(icao);
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

  // Start flashing the ICAO tab when a new NOTAM is detected
  if (icao) {
    flashingIcaos.add(icao);
    renderTabs(); // Re-render tabs to show the flashing effect
  }
}

// --- RAW MODAL POPUP ---
function showRawModal(title, rawText) {
  let modal = document.getElementById('raw-notam-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'raw-notam-modal';
    modal.innerHTML = `
      <div class="raw-modal-backdrop"></div>
      <div class="raw-modal-content">
        <div class="raw-modal-header">
          <span id="raw-modal-title"></span>
          <button id="raw-modal-close" title="Close" class="raw-modal-close">&times;</button>
        </div>
        <pre id="raw-modal-body" class="raw-modal-body"></pre>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('.raw-modal-backdrop').onclick = closeRawModal;
    modal.querySelector('#raw-modal-close').onclick = closeRawModal;
  }
  document.getElementById('raw-modal-title').textContent = title;
  document.getElementById('raw-modal-body').textContent = rawText;
  modal.style.display = 'flex';
  setTimeout(() => {
    const content = modal.querySelector('.raw-modal-content');
    if (content) {
      content.style.width = '';
      content.style.height = '';
      content.style.maxWidth = '90vw';
      content.style.maxHeight = '90vh';
    }
  }, 1);
}
function closeRawModal() {
  const modal = document.getElementById('raw-notam-modal');
  if (modal) modal.style.display = 'none';
}
window.closeRawModal = closeRawModal;

// --- ICAO PROGRESS BAR ---
function updateIcaoProgressBar() {
  const total = icaoSet.length;
  const loaded = icaoSet.filter(icao => loadedIcaosSet.has(icao)).length;
  const queued = icaoSet.filter(icao => !loadedIcaosSet.has(icao) && !loadingIcaosSet.has(icao)).length;
  let percent = total === 0 ? 0 : (loaded / total) * 100;
  const bar = document.getElementById('icao-progress-bar');
  if (bar) {
    bar.style.width = percent + "%";
    bar.style.backgroundColor = percent >= 100 ? "#3fe8a6" : "#00d8ff";
  }
  const text = document.getElementById('icao-progress-text');
  if (text) text.textContent = `${loaded} of ${total} loaded`;
}
setInterval(updateIcaoProgressBar, 1000);
function updateIcaoStatusBar() { updateIcaoProgressBar(); }

// --- ICAO SETS BAR ---
function renderIcaoSetsBar() {
  const bar = document.getElementById('icao-sets-bar');
  if (!bar) return;
  bar.innerHTML = '';
  let sets = getIcaoSets();

  // Add "New Set" button first
  let newSetBtn = document.createElement('button');
  newSetBtn.className = "icao-set-new";
  newSetBtn.innerHTML = '<i class="fa-solid fa-plus"></i> New Set';
  newSetBtn.title = "Create a new empty ICAO set";
  newSetBtn.onclick = () => {
    if (sets.length >= 5) {
      alert("Maximum of 5 sets allowed. Please delete one first.");
      return;
    }
    
    let name = prompt("Enter name for new ICAO set:");
    if (!name) return;
    
    if (sets.some(s => s.name === name)) {
      alert("Set name must be unique.");
      return;
    }
    
    // Create new empty set
    sets.push({name: name, icaos: []});
    saveIcaoSets(sets);
    renderIcaoSetsBar();
  };
  bar.appendChild(newSetBtn);
  
  // Add divider
  let divider = document.createElement('span');
  divider.className = "icao-set-divider";
  divider.textContent = '|';
  bar.appendChild(divider);

  // Render existing sets
  sets.forEach((set, i) => {
    let btnGroup = document.createElement('div');
    btnGroup.style.display = 'inline-flex';
    btnGroup.style.alignItems = 'center';
    btnGroup.style.marginRight = '8px';

    let btn = document.createElement('button');
    btn.className = "icao-set-btn";
    btn.textContent = set.name;
    btn.title = `Load "${set.name}" set (${set.icaos.length} ICAOs)`;
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
    btnGroup.appendChild(btn);

    // Add edit button
    let edit = document.createElement('button');
    edit.className = "icao-set-edit";
    edit.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>';
    edit.title = "Edit set name";
    edit.onclick = (e) => {
      e.stopPropagation();
      let newName = prompt("Rename set:", set.name);
      if (!newName) return;
      if (newName === set.name) return;
      if (sets.some(s => s.name === newName)) {
        alert("Set name must be unique.");
        return;
      }
      sets[i].name = newName;
      saveIcaoSets(sets);
      renderIcaoSetsBar();
    };
    btnGroup.appendChild(edit);

    // Add delete button
    let del = document.createElement('button');
    del.className = "icao-set-del";
    del.innerHTML = '<i class="fa-solid fa-trash"></i>';
    del.title = "Delete this set";
    del.onclick = (e) => {
      e.stopPropagation();
      if (confirm(`Delete set "${set.name}"?`)) {
        sets.splice(i,1);
        saveIcaoSets(sets);
        renderIcaoSetsBar();
      }
    };
    btnGroup.appendChild(del);
    bar.appendChild(btnGroup);
  });

  // Add "Save Current" button if we have any ICAOs
  if (icaoSet.length > 0) {
    let divider2 = document.createElement('span');
    divider2.className = "icao-set-divider";
    divider2.textContent = '|';
    bar.appendChild(divider2);
    
    let saveBtn = document.createElement('button');
    saveBtn.className = "icao-set-save";
    saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Current';
    saveBtn.title = "Save the current ICAOs as a set";
    saveBtn.onclick = () => {
      if (sets.length >= 5) {
        alert("Maximum of 5 sets allowed. Please delete one first.");
        return;
      }
      
      let name = prompt("Set name?");
      if (!name) return;
      
      if (sets.some(s => s.name === name)) {
        alert("Set name must be unique.");
        return;
      }
      
      sets.push({name: name, icaos: icaoSet.slice()});
      saveIcaoSets(sets);
      renderIcaoSetsBar();
    };
    bar.appendChild(saveBtn);
  }
}

// --- ICAO LIST ---
function renderIcaoList() {
  const icaoList = document.getElementById('icao-list');
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
  if (window.tabMode === icao) window.tabMode = "ALL";
  renderIcaoList();
  renderTabs();
  renderCards();
  saveIcaos();
  renderIcaoSetsBar();
};

// --- ICAO TABS (REVISED) ---
function renderTabs() {
  const icaoTabs = document.getElementById('icao-tabs');
  icaoTabs.innerHTML = '';
  if (icaoSet.length > 1) {
    const allTab = document.createElement('button');
    // Use a simple 'active-tab' class for styling
    allTab.className = tabMode === "ALL" ? "active-tab" : "";
    allTab.textContent = "ALL";
    allTab.onclick = () => { tabMode = "ALL"; renderTabs(); renderCards(); };
    icaoTabs.appendChild(allTab);
  }
  for (const icao of icaoSet) {
    const tab = document.createElement('button');
    const isFlashing = flashingIcaos.has(icao);
    const isActive = tabMode === icao;
    // Combine classes for active and flashing states
    tab.className = `${isActive ? "active-tab" : ""} ${isFlashing ? "flashing-tab" : ""}`;
    tab.textContent = icao;
    tab.onclick = async () => {
      flashingIcaos.delete(icao); // Stop flashing when clicked
      tabMode = icao;
      renderTabs();
      await ensureIcaoNotamsLoadedOnDemand(icao);
      renderCards();
    };
    icaoTabs.appendChild(tab);
  }
}

// --- FILTERING & CARD RENDERING (REVISED) ---
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

function getHeadTitle(n) {
  const t = getNotamType(n);
  if (t === 'rwy') return "Runway Closure";
  if (t === 'twy') return "Taxiway Closure";
  if (t === 'rsc') return "RSC";
  if (t === 'crfi') return "CRFI";
  if (t === 'ils') return "ILS";
  if (t === 'fuel') return "Fuel Status";
  if (t === 'cancelled') return "Cancelled NOTAM";
  return "General";
}

function filterAndSort(arr) {
  const now = new Date();
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

function needsExpansion(summary) {
  if (!summary) return false;
  const scale = parseFloat(document.documentElement.style.getPropertyValue('--card-scale') || "1");
  const baseLength = 500;
  const adjustedThreshold = Math.round(baseLength * (1/scale));
  return summary.length > adjustedThreshold;
}

// REVISED notamCardHtml
function notamCardHtml(n) {
  const type = getNotamType(n);
  const headTitle = getHeadTitle(n);
  const key = (n.id || n.number || n.qLine || n.summary || "").replace(/[^a-zA-Z0-9_-]/g,'');
  const rwyAffected = type === "rwy" ? extractRunways(n.summary + " " + n.body) : "";
  
  const isExpanded = expandedCardKey === key;
  const isCollapsible = needsExpansion(n.summary);
  
  // REVISED: Class list now includes `type-*` for the new CSS border styling
  const cardClasses = [
    'notam-card', 'notam-animate', `type-${type}`,
    isCollapsible ? 'is-collapsible' : '',
    isExpanded ? 'is-expanded' : ''
  ].join(' ');

  const rawLinkHtml = `<a href="#" class="notam-raw-link" title="View raw NOTAM" data-raw-key="${key}">RAW</a>`;
  
  return `
  <div class="${cardClasses}" id="notam-${key}" data-card-key="${key}">
    <div class="card-head">
      <span>${headTitle}</span>
      ${type==='rwy' && rwyAffected ? `<span class="ml-4 font-mono text-lg tracking-wider">${rwyAffected}</span>` : ""}
    </div>
    <div class="notam-card-content">
      <div style="display:flex;justify-content:space-between;align-items:start;">
        <div class="notam-head">${n.number || ""} <span class="text-base font-normal text-cyan-300 ml-2">${n.icao || ""}</span></div>
        ${rawLinkHtml}
      </div>
      <div class="notam-meta">
        <span><b>Type:</b> ${n.type || "N/A"}</span>
        <span><b>Class:</b> ${getClassificationTitle(n.classification)}</span>
        <span><b>Valid:</b> ${n.validFrom.replace('T', ' ').slice(0,16)} &rarr; ${n.validTo.replace('T', ' ').slice(0,16)}</span>
      </div>
      
      <div class="notam-text-content">
        ${n.summary ? n.summary.replace(/\n/g, '<br>') : "No summary available."}
      </div>
      
      ${isCollapsible ? `
        <div class="card-expand-footer">
          <button class="card-expand-btn">
            <span>${isExpanded ? 'Show Less' : 'Show More'}</span>
            <i class="icon fa fa-angle-down"></i>
          </button>
        </div>`
        : ''
      }
    </div>
  </div>
  `;
}

async function renderCards() {
  const result = document.getElementById('result');
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
        <div class="icao-header">${icao} (${filtered.length} NOTAMs)</div>
        <div class="notam-grid">`;
      if (filtered.length === 0) {
        html += `<div class="bg-[#23283e]/60 glass p-8 rounded-lg text-center text-base text-slate-400">No NOTAMs match the current filters for this ICAO.</div>`;
      } else {
        for (const n of filtered) html += notamCardHtml(n);
      }
      html += `</div></div>`;
    }
    result.innerHTML = html;
    addCardClickListeners();
    addRawModalListeners();
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
    singleHtml += `<div class="bg-[#23283e]/60 glass p-8 rounded-lg text-center text-base text-slate-400">No NOTAMs match the current filters for this ICAO.</div>`;
  } else {
    for (const n of filtered) singleHtml += notamCardHtml(n);
  }
  singleHtml += `</div>`;
  result.innerHTML = singleHtml;
  addCardClickListeners();
  addRawModalListeners();
}

function addCardClickListeners() {
  document.querySelectorAll('.is-collapsible').forEach(card => {
    card.addEventListener('click', function(e) {
      // Don't toggle if clicking on the RAW link
      if (e.target.closest('.notam-raw-link')) {
        return;
      }
      const key = this.getAttribute('data-card-key');
      expandedCardKey = (expandedCardKey === key) ? null : key;
      
      // A re-render is the simplest way to update the state of all cards
      renderCards().then(() => {
        // After re-rendering, scroll the toggled card into view if it expanded
        if (expandedCardKey === key) {
            const cardElement = document.getElementById(`notam-${key}`);
            if (cardElement) {
                const cardRect = cardElement.getBoundingClientRect();
                // Only scroll if the bottom is out of view
                if (cardRect.bottom > window.innerHeight) {
                    cardElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
                }
            }
        }
      });
    });
  });
}

function addRawModalListeners() {
  document.querySelectorAll('.notam-raw-link').forEach(link => {
    link.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation(); // Prevent the card click from triggering
      const key = link.getAttribute('data-raw-key');
      let n = null;
      for (const arr of Object.values(notamDataByIcao)) {
        const found = arr.find(x => (x.id || x.number || x.qLine || x.summary || "").replace(/[^a-zA-Z0-9_-]/g,'') === key);
        if (found) { n = found; break; }
      }
      if (n) {
        let raw = "";
        if (n.qLine) raw += n.qLine + "\n";
        if (n.body) raw += n.body;
        else if (n.summary) raw += n.summary;
        showRawModal(`${n.number || n.icao || "NOTAM"} Raw`, raw.trim());
      }
    };
  });
}

// --- Card scale, filter, and reload logic ---
function updateRefreshTimer() {
  // This function is deprecated for auto-refresh timer, now handled in notam-core.js
}

document.addEventListener("DOMContentLoaded", () => {
  // --- ICAO List Collapse/Expand State ---
  const icaoListToggle = document.getElementById('icao-list-toggle');
  const icaoList = document.getElementById('icao-list');
  let icaoListCollapsed = localStorage.getItem('notamIcaoListCollapsed') === "1";
  function setIcaoListCollapsed(val) {
    icaoListCollapsed = val;
    icaoList.style.display = icaoListCollapsed ? "none" : "";
    icaoListToggle.textContent = icaoListCollapsed ? "⯈" : "⯆";
    localStorage.setItem('notamIcaoListCollapsed', icaoListCollapsed ? "1" : "");
  }
  if (icaoListToggle) {
    icaoListToggle.onclick = () => setIcaoListCollapsed(!icaoListCollapsed);
    setIcaoListCollapsed(icaoListCollapsed);
  }

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

  const cardScaleSlider = document.getElementById('card-scale-slider');
  const cardScaleValue = document.getElementById('card-scale-value');
  function setCardScale(val) {
    document.documentElement.style.setProperty('--card-scale', val);
    document.documentElement.style.setProperty('--card-width', `${Math.round(420 * val)}px`);
    cardScaleValue.textContent = (+val).toFixed(2) + "x";
    localStorage.setItem('notamCardScale', val);
    // Re-render cards to adjust auto-sizing based on new scale
    if (activeSession) renderCards();
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
  const form = document.getElementById('icao-form');
  const icaoInput = document.getElementById('icao-input');
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
  const reloadBtn = document.getElementById('reload-all');
  reloadBtn.textContent = "Refresh";
  const refreshTimer = document.createElement("span");
  refreshTimer.id = "refresh-timer";
  refreshTimer.style.marginLeft = "0.7em";
  refreshTimer.style.fontWeight = "bold";
  refreshTimer.style.color = "#0ff";
  reloadBtn.parentNode.insertBefore(refreshTimer, reloadBtn.nextSibling);

  // Manual reload now triggers a full auto refresh and resets timer
  reloadBtn.onclick = async () => {
    if (!activeSession) return;
    if (window.resetAutoRefresh) window.resetAutoRefresh();
    if (window.performAutoRefresh) await window.performAutoRefresh();
  };
  [
    'f-rwy', 'f-twy', 'f-rsc', 'f-crfi', 'f-ils', 'f-fuel', 'f-other',
    'f-cancelled', 'f-dom', 'f-current', 'f-future'
  ].forEach(id => document.getElementById(id).onchange = () => { if (activeSession) renderCards(); });
  document.getElementById('f-keyword').oninput = () => { if (activeSession) renderCards(); };
  window.addEventListener('scroll', () => {
    const backToTopBtn = document.getElementById('back-to-top-btn');
    if (window.scrollY > 300) {
      backToTopBtn.style.display = 'flex';
    } else {
      backToTopBtn.style.display = 'none';
    }
  });
  document.getElementById('back-to-top-btn').onclick = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // --- TIMER next to Refresh ---
  function updateAutoRefreshTimerUI() {
    // Now handled in notam-core.js, just update #refresh-timer if available
    if (window.autoRefreshCountdown !== undefined) {
      const timerEl = document.getElementById('refresh-timer');
      if (!timerEl) return;
      const sec = window.autoRefreshCountdown % 60;
      const min = Math.floor(window.autoRefreshCountdown / 60);
      timerEl.textContent = `Next auto: ${min}:${sec.toString().padStart(2, '0')}`;
    }
  }
  setInterval(updateAutoRefreshTimerUI, 1000);
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

// --- Provide updateNotamCardsForIcao for auto-refresh logic ---
window.updateNotamCardsForIcao = function(icao, allNotams, newNotams, goneNotams) {
  // If new NOTAMs were detected, add this ICAO to the flashing list
  if (newNotams && newNotams.length > 0) {
    flashingIcaos.add(icao);
    renderTabs(); // Re-render tabs to show the flashing effect
  }
  
  // Re-render the grid for this ICAO
  renderCards();
};
