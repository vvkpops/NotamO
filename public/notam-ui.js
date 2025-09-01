// === notam-ui.js ===
// All DOM rendering, event listeners, notification center, UI logic

// --- IMPORT shared state and functions from notam-core.js ---
import {
  icaoSet, setIcaoSet, tabMode, setTabMode, loadedIcaosSet, loadingIcaosSet, icaoQueue, notamDataByIcao, notamFetchStatusByIcao,
  getIcaoSets, saveIcaoSets, saveIcaos, enqueueIcaos,
  parseDate, getNotamFlags, extractRunways, getClassificationTitle,
  ensureIcaoNotamsLoaded, ensureIcaoNotamsLoadedOnDemand,
  activeSession, performAutoRefresh, resetAutoRefresh
} from './notam-core.js';


let expandedCardKey = null; // tracks which card is expanded
let flashingIcaos = new Set(); // track which ICAO tabs should be flashing

// --- Notification Center (needs to be exported for notam-network) ---
let notificationsList = [];
let notificationIdCounter = 1;
function getUnreadNotificationCount() { return notificationsList.filter(n => !n.read).length; }
function updateNotificationBadge() {
  const badge = document.getElementById('notification-badge');
  if (!badge) return;
  const unread = getUnreadNotificationCount();
  badge.style.display = unread > 0 ? "flex" : "none";
  badge.textContent = unread;
}
function renderNotificationList() {
  const listDiv = document.getElementById('notification-list');
  if (!listDiv) return;
  listDiv.innerHTML = notificationsList.length === 0 ? `<div style="padding:24px 0;text-align:center;color:#aaa;">No notifications</div>` : "";
  notificationsList.slice().reverse().forEach(n => {
    let el = document.createElement("div");
    el.className = "notification-item" + (n.read ? "" : " unread");
    el.innerHTML = `<div class="font-semibold text-text-primary text-sm">${n.message}</div>
      <div class="text-xs text-cyan-400">${n.icao}</div>
      <div class="text-xs text-text-secondary mt-1">${n.time}</div>`;
    el.onclick = async () => {
      n.read = true;
      updateNotificationBadge();
      el.classList.remove('unread');
      document.getElementById('notification-modal').style.display = "none";
      if (document.getElementById('notam-alert')) document.getElementById('notam-alert').classList.add('hidden');
      if (typeof n.icao === "string" && tabMode !== n.icao) {
        flashingIcaos.delete(n.icao);
        setTabMode(n.icao);
        renderTabs();
        await ensureIcaoNotamsLoaded(n.icao);
        await renderCards();
      }
      if (typeof n.cardKey === "string") {
        setTimeout(() => {
          const card = document.getElementById('notam-' + n.cardKey.replace(/[^a-zA-Z0-9_-]/g, ''));
          if (card) {
            card.scrollIntoView({ behavior: "smooth", block: "center" });
            card.style.transition = 'box-shadow 0.3s ease';
            card.style.boxShadow = '0 0 0 3px var(--accent-cyan)';
            setTimeout(() => card.style.boxShadow = '', 1800);
          }
        }, 120);
      }
    };
    listDiv.appendChild(el);
  });
}
export function showNewNotamAlert(msg, icao, notamKey) {
  notificationsList.push({ id: notificationIdCounter++, message: msg, icao: icao, cardKey: notamKey, time: new Date().toLocaleTimeString(), read: false });
  updateNotificationBadge();
  renderNotificationList(); // Re-render list on new notification
  const el = document.getElementById('notam-alert');
  if(el) {
    el.textContent = msg;
    el.classList.remove('hidden');
    el.onclick = async () => {
      el.classList.add('hidden');
      if (typeof icao !== "undefined" && tabMode !== icao) {
        flashingIcaos.delete(icao);
        setTabMode(icao);
        renderTabs();
        await ensureIcaoNotamsLoaded(icao);
        await renderCards();
      }
      setTimeout(() => {
        const card = document.getElementById('notam-' + notamKey.replace(/[^a-zA-Z0-9_-]/g, ''));
        if (card) {
          card.scrollIntoView({ behavior: "smooth", block: "center" });
          card.style.transition = 'box-shadow 0.3s ease';
          card.style.boxShadow = '0 0 0 3px var(--accent-green)';
          setTimeout(() => card.style.boxShadow = '', 1800);
        }
      }, 120);
      notificationsList.forEach(n => { if (n.cardKey === notamKey) n.read = true; });
      updateNotificationBadge();
      renderNotificationList();
    };
  }
  if (icao) {
    flashingIcaos.add(icao);
    renderTabs();
  }
}

// --- RAW MODAL POPUP ---
function showRawModal(title, rawText) {
  let modal = document.getElementById('raw-notam-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'raw-notam-modal';
    modal.style.cssText = 'display:none; position:fixed; top:0; left:0; width:100%; height:100%; background-color:rgba(0,0,0,0.6); z-index:1000; justify-content:center; align-items:center;';
    modal.innerHTML = `
      <div class="raw-modal-backdrop" style="position:absolute; top:0; left:0; width:100%; height:100%;"></div>
      <div class="raw-modal-content" style="background-color:#1e293b; border-radius:8px; box-shadow:0 10px 25px rgba(0,0,0,0.3); width:80%; max-width:800px; max-height:80%; display:flex; flex-direction:column; position:relative; overflow:hidden; animation:modalOpen 0.3s; z-index:1;">
        <div class="raw-modal-header" style="display:flex; justify-content:space-between; align-items:center; padding:16px; background-color:#172030; border-bottom:1px solid #334155;">
          <span id="raw-modal-title" class="text-lg font-bold text-text-primary"></span>
          <button id="raw-modal-close" title="Close" style="background:none; border:none; color:#f87171; cursor:pointer; font-size:1.5rem; line-height:1;">&times;</button>
        </div>
        <pre id="raw-modal-body" style="padding:16px; overflow-y:auto; flex-grow:1; font-family:'Source Code Pro',monospace; white-space:pre-wrap; font-size:0.9rem; color:#d1d5db;"></pre>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('.raw-modal-backdrop').onclick = closeRawModal;
    modal.querySelector('#raw-modal-close').onclick = closeRawModal;
  }
  document.getElementById('raw-modal-title').textContent = title;
  document.getElementById('raw-modal-body').textContent = rawText;
  modal.style.display = 'flex';
}
function closeRawModal() {
  const modal = document.getElementById('raw-notam-modal');
  if (modal) modal.style.display = 'none';
}

// --- ICAO PROGRESS BAR ---
function updateIcaoProgressBar() {
  if (!icaoSet) return; // Guard against early calls
  const total = icaoSet.length;
  const loaded = icaoSet.filter(icao => loadedIcaosSet.has(icao)).length;
  const percent = total === 0 ? 0 : (loaded / total) * 100;
  const bar = document.getElementById('icao-progress-bar');
  if (bar) {
    bar.style.width = percent + "%";
    bar.style.backgroundColor = percent >= 100 ? "#3fe8a6" : "#00d8ff";
  }
  const text = document.getElementById('icao-progress-text');
  if (text) text.textContent = `${loaded} of ${total} loaded`;
}
window.updateIcaoStatusBar = updateIcaoProgressBar; // Make available to other modules

// --- ICAO SETS BAR ---
function renderIcaoSetsBar() {
  const bar = document.getElementById('icao-sets-bar');
  if (!bar) return;
  bar.innerHTML = '';
  let sets = getIcaoSets();
  
  let newSetBtn = document.createElement('button');
  newSetBtn.className = "icao-set-new";
  newSetBtn.innerHTML = '<i class="fa-solid fa-plus"></i> New Set';
  newSetBtn.title = "Create a new empty ICAO set";
  newSetBtn.onclick = () => {
    if (sets.length >= 5) { return alert("Maximum of 5 sets allowed."); }
    let name = prompt("Enter name for new ICAO set:");
    if (!name || sets.some(s => s.name === name)) { return alert("Set name must be unique and not empty."); }
    sets.push({name: name, icaos: []});
    saveIcaoSets(sets);
    renderIcaoSetsBar();
  };
  bar.appendChild(newSetBtn);
  
  if (sets.length > 0) {
    let divider = document.createElement('span');
    divider.className = "icao-set-divider";
    divider.textContent = '|';
    bar.appendChild(divider);
  }

  sets.forEach((set, i) => {
    let btnGroup = document.createElement('div');
    btnGroup.style.display = 'inline-flex';
    btnGroup.style.alignItems = 'center';

    let btn = document.createElement('button');
    btn.className = "icao-set-btn";
    btn.textContent = set.name;
    btn.title = `Load "${set.name}" set (${set.icaos.length} ICAOs)`;
    btn.onclick = async () => {
      setIcaoSet(set.icaos.slice());
      saveIcaos();
      renderIcaoList();
      renderTabs();
      await renderCards();
      enqueueIcaos(icaoSet);
      updateIcaoProgressBar();
    };
    btnGroup.appendChild(btn);

    let edit = document.createElement('button');
    edit.className = "icao-set-edit"; edit.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>'; edit.title = "Edit set name";
    edit.onclick = (e) => { e.stopPropagation(); let newName = prompt("Rename set:", set.name); if (!newName || newName === set.name || sets.some(s => s.name === newName)) return; sets[i].name = newName; saveIcaoSets(sets); renderIcaoSetsBar(); };
    btnGroup.appendChild(edit);
    let del = document.createElement('button');
    del.className = "icao-set-del"; del.innerHTML = '<i class="fa-solid fa-trash"></i>'; del.title = "Delete this set";
    del.onclick = (e) => { e.stopPropagation(); if (confirm(`Delete set "${set.name}"?`)) { sets.splice(i,1); saveIcaoSets(sets); renderIcaoSetsBar(); } };
    btnGroup.appendChild(del);

    bar.appendChild(btnGroup);
  });

  if (icaoSet && icaoSet.length > 0) {
    let divider2 = document.createElement('span');
    divider2.className = "icao-set-divider"; divider2.textContent = '|';
    bar.appendChild(divider2);
    let saveBtn = document.createElement('button');
    saveBtn.className = "icao-set-save"; saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Current';
    saveBtn.onclick = () => { if (sets.length >= 5) { return alert("Max 5 sets."); } let name = prompt("Set name?"); if (!name || sets.some(s => s.name === name)) return; sets.push({name: name, icaos: icaoSet.slice()}); saveIcaoSets(sets); renderIcaoSetsBar(); };
    bar.appendChild(saveBtn);
  }
}

// --- ICAO LIST ---
function renderIcaoList() {
  const icaoList = document.getElementById('icao-list');
  if (!icaoList || !icaoSet) return;
  icaoList.innerHTML = '';
  for (const icao of icaoSet) {
    const tag = document.createElement('div');
    tag.className = "bg-cyan-700/70 px-3 py-1 rounded-full font-mono text-lg uppercase tracking-wide flex items-center gap-2";
    tag.innerHTML = `<span>${icao}</span>
      <button class="text-pink-200 hover:text-red-400 text-xl font-bold focus:outline-none" title="Remove ${icao}" data-icao="${icao}">
        <i class="fa-solid fa-circle-xmark"></i>
      </button>`;
    tag.querySelector('button').onclick = (e) => removeIcao(e.currentTarget.dataset.icao);
    icaoList.appendChild(tag);
  }
}
async function removeIcao(icao) {
  setIcaoSet(icaoSet.filter(x => x !== icao));
  delete notamDataByIcao[icao];
  delete notamFetchStatusByIcao[icao];
  loadedIcaosSet.delete(icao);
  loadingIcaosSet.delete(icao);
  
  let i = icaoQueue.length;
  while(i--) { if(icaoQueue[i] === icao) { icaoQueue.splice(i, 1); } }
  
  updateIcaoProgressBar();
  if (tabMode === icao) setTabMode("ALL");
  renderIcaoList();
  renderTabs();
  await renderCards();
  saveIcaos();
  renderIcaoSetsBar();
};

// --- ICAO TABS ---
function renderTabs() {
  const icaoTabs = document.getElementById('icao-tabs');
  if (!icaoTabs || !icaoSet) return;
  icaoTabs.innerHTML = '';
  if (icaoSet.length > 1) {
    const allTab = document.createElement('button');
    allTab.className = tabMode === "ALL" ? "active-tab" : "";
    allTab.textContent = "ALL";
    allTab.onclick = async () => { setTabMode("ALL"); renderTabs(); await renderCards(); };
    icaoTabs.appendChild(allTab);
  }
  for (const icao of icaoSet) {
    const tab = document.createElement('button');
    const isFlashing = flashingIcaos.has(icao);
    const isActive = tabMode === icao;
    tab.className = `${isActive ? "active-tab" : ""} ${isFlashing ? "flashing-tab" : ""}`;
    tab.textContent = icao;
    tab.onclick = async () => {
      flashingIcaos.delete(icao);
      setTabMode(icao);
      renderTabs();
      await ensureIcaoNotamsLoadedOnDemand(icao);
      await renderCards();
    };
    icaoTabs.appendChild(tab);
  }
}

// --- FILTERING & CARD RENDERING ---
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

// ROBUST filterAndSort function
function filterAndSort(arr) {
  if (!arr) return [];
  const now = new Date();
  
  // Helper to safely get checkbox state
  const isChecked = (id) => {
    const el = document.getElementById(id);
    return el ? el.checked : false;
  };
  
  const filters = {
    rwy: isChecked('f-rwy'), twy: isChecked('f-twy'),
    rsc: isChecked('f-rsc'), crfi: isChecked('f-crfi'),
    ils: isChecked('f-ils'), fuel: isChecked('f-fuel'),
    other: isChecked('f-other'), cancelled: isChecked('f-cancelled'),
    dom: isChecked('f-dom'), current: isChecked('f-current'),
    future: isChecked('f-future')
  };
  
  const keywordEl = document.getElementById('f-keyword');
  const keyword = keywordEl ? keywordEl.value.trim().toLowerCase() : "";
  const noTypeChecked = !filters.rwy && !filters.twy && !filters.rsc && !filters.crfi && !filters.ils && !filters.fuel && !filters.other;
  
  const filtered = arr.filter(n => {
    const type = getNotamType(n);
    if (filters.cancelled) {
        if (type === 'cancelled') return true;
    } else {
        if (type === 'cancelled') return false;
    }

    if (n.classification === "DOM" && !filters.dom) return false;
    
    if (!noTypeChecked) {
      if ((type === 'rwy' && !filters.rwy) || (type === 'twy' && !filters.twy) ||
          (type === 'rsc' && !filters.rsc) || (type === 'crfi' && !filters.crfi) ||
          (type === 'ils' && !filters.ils) || (type === 'fuel' && !filters.fuel) ||
          (type === 'other' && !filters.other)) {
        return false;
      }
    }
    
    const from = parseDate(n.validFrom), to = parseDate(n.validTo);
    if (from && to) {
      const isCurrent = now >= from && now <= to;
      const isFuture = now < from;
      if (!filters.current && isCurrent) return false;
      if (!filters.future && isFuture) return false;
      if (!isCurrent && !isFuture && type !== 'cancelled') return false;
    }
    
    if (keyword && !JSON.stringify(n).toLowerCase().includes(keyword)) return false;
    
    return true;
  });
  
  return filtered.sort((a, b) => {
    const priority = n => ({'rwy':6,'twy':5,'rsc':4,'crfi':3,'ils':2,'fuel':1.5,'cancelled':-1}[getNotamType(n)] || 1);
    const priorityDiff = priority(b) - priority(a);
    if (priorityDiff !== 0) return priorityDiff;
    const dateA = parseDate(a.validFrom) || 0;
    const dateB = parseDate(b.validFrom) || 0;
    return dateB - dateA;
  });
}

function needsExpansion(summary) {
  if (!summary) return false;
  const scale = parseFloat(document.documentElement.style.getPropertyValue('--card-scale') || "1");
  // Adjust this threshold based on the new collapsed card height
  return summary.length > Math.round(300 / scale);
}

function notamCardHtml(n) {
  const type = getNotamType(n);
  const headTitle = getHeadTitle(n);
  const key = (n.id || n.number || n.qLine || n.summary || "").replace(/[^a-zA-Z0-9_-]/g,'');
  const rwyAffected = type === "rwy" ? extractRunways(n.summary + " " + n.body) : "";
  const isExpanded = expandedCardKey === key;
  const isCollapsible = needsExpansion(n.summary);
  const cardClasses = `notam-card notam-animate type-${type} ${isCollapsible ? 'is-collapsible' : ''} ${isExpanded ? 'is-expanded' : ''}`;

  return `
  <div class="${cardClasses}" id="notam-${key}" data-card-key="${key}">
    <div class="card-head">
      <span>${headTitle}</span>
      ${type==='rwy' && rwyAffected ? `<span class="ml-4 font-mono text-lg tracking-wider">${rwyAffected}</span>` : ""}
    </div>
    <div class="notam-card-content">
      <div style="display:flex;justify-content:space-between;align-items:start;">
        <div class="notam-head">${n.number || ""} <span class="text-base font-normal text-cyan-300 ml-2">${n.icao || ""}</span></div>
        <a href="#" class="notam-raw-link text-xs font-bold text-text-secondary hover:text-accent-amber" title="View raw NOTAM" data-raw-key="${key}">RAW</a>
      </div>
      <div class="notam-meta">
        <span><b>Type:</b> ${n.type || "N/A"}</span>
        <span><b>Class:</b> ${getClassificationTitle(n.classification)}</span>
        <span><b>Valid:</b> ${n.validFrom.replace('T', ' ').slice(0,16)} &rarr; ${n.validTo.replace('T', ' ').slice(0,16)}</span>
      </div>
      <div class="notam-text-content">${n.summary ? n.summary.replace(/\n/g, '<br>') : "No summary."}</div>
      <div class="card-expand-footer"><button class="card-expand-btn"><span>${isExpanded ? 'Show Less' : 'Show More'}</span><i class="icon fa fa-angle-down"></i></button></div>
    </div>
  </div>`;
}

async function renderCards() {
  const result = document.getElementById('result');
  if (!result) return;
  updateIcaoProgressBar();
  if (!icaoSet || icaoSet.length === 0) {
    result.innerHTML = `<div class="text-center text-xl text-slate-400 my-14">Add ICAO airport(s) to fetch NOTAMs.</div>`;
    return;
  }
  
  let html = '';
  if (tabMode === "ALL" && icaoSet.length > 1) {
    // In "ALL" mode, we don't need to pre-load, just show what we have.
    for (const icao of icaoSet) {
      const notams = notamDataByIcao[icao] || [];
      const filtered = filterAndSort(notams);
      html += `<div class="mb-8"><div class="icao-header">${icao} (${filtered.length} NOTAMs)</div>`;
      if (notamFetchStatusByIcao[icao]) {
        html += `<div class="notam-grid">`;
        html += filtered.length > 0 ? filtered.map(notamCardHtml).join('') : `<div class="bg-secondary/60 p-8 rounded-lg text-center text-base text-slate-400">No matching NOTAMs.</div>`;
        html += `</div>`;
      } else {
        html += `<div class="text-center text-lg my-10 text-cyan-400">Loading NOTAMs for ${icao}...</div>`;
      }
      html += `</div>`;
    }
  } else {
    const icao = (tabMode === "ALL" && icaoSet.length > 0) ? icaoSet[0] : tabMode;
    if (!icao) {
        result.innerHTML = ''; // Clear if no ICAO is selected
        return;
    }
    if (!notamFetchStatusByIcao[icao]) {
      html = `<div class="text-center text-lg my-10 text-cyan-400">Loading NOTAMs for ${icao}...</div>`;
    } else {
      const filtered = filterAndSort(notamDataByIcao[icao] || []);
      html = `<div class="notam-grid">${filtered.length > 0 ? filtered.map(notamCardHtml).join('') : `<div class="bg-secondary/60 p-8 rounded-lg text-center text-base text-slate-400">No matching NOTAMs.</div>`}</div>`;
    }
  }
  result.innerHTML = html;
  addCardClickListeners();
  addRawModalListeners();
}


function addCardClickListeners() {
  document.querySelectorAll('.is-collapsible').forEach(card => {
    card.addEventListener('click', function(e) {
      // prevent expansion if raw link is clicked
      if (e.target.closest('.notam-raw-link')) return;

      const key = this.getAttribute('data-card-key');
      const wasExpanded = this.classList.contains('is-expanded');
      
      // If it was expanded, we are closing it.
      if (wasExpanded) {
        expandedCardKey = null;
        this.classList.remove('is-expanded');
        this.querySelector('.card-expand-btn span').textContent = 'Show More';
        this.querySelector('.card-expand-btn .icon').style.transform = 'rotate(0deg)';
      } else {
        // If another card was open, close it first.
        if (expandedCardKey) {
          const currentlyExpanded = document.querySelector('.is-expanded');
          if (currentlyExpanded) {
             currentlyExpanded.classList.remove('is-expanded');
             currentlyExpanded.querySelector('.card-expand-btn span').textContent = 'Show More';
             currentlyExpanded.querySelector('.card-expand-btn .icon').style.transform = 'rotate(0deg)';
          }
        }
        // Now open the new card.
        expandedCardKey = key;
        this.classList.add('is-expanded');
        this.querySelector('.card-expand-btn span').textContent = 'Show Less';
        this.querySelector('.card-expand-btn .icon').style.transform = 'rotate(180deg)';
        // Scroll into view if needed
        setTimeout(() => {
            const cardRect = this.getBoundingClientRect();
            if (cardRect.bottom > window.innerHeight) {
                this.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
            }
        }, 400); // after animation
      }
    });
  });
}

function addRawModalListeners() {
  document.querySelectorAll('.notam-raw-link').forEach(link => {
    link.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      const key = link.getAttribute('data-raw-key');
      let n = null;
      Object.values(notamDataByIcao).flat().forEach(notam => {
        if ((notam.id || notam.number || notam.qLine || notam.summary || "").replace(/[^a-zA-Z0-9_-]/g,'') === key) n = notam;
      });
      if (n) showRawModal(`${n.number || n.icao} Raw`, `${n.qLine || ''}\n${n.body || n.summary}`.trim());
    };
  });
}

// --- DOMContentLoaded ---
document.addEventListener("DOMContentLoaded", () => {
  // Initialize UI components that depend on the DOM
  renderIcaoSetsBar();
  document.getElementById('notification-bell').onclick = () => { const m = document.getElementById('notification-modal'); m.style.display = m.style.display === "block" ? "none" : "block"; };
  document.getElementById('clear-notifications-btn').onclick = () => { notificationsList = []; renderNotificationList(); updateNotificationBadge(); };
  
  const cardScaleSlider = document.getElementById('card-scale-slider');
  const cardScaleValue = document.getElementById('card-scale-value');
  function setCardScale(val) {
    document.documentElement.style.setProperty('--card-scale', val);
    document.documentElement.style.setProperty('--card-width', `${Math.round(420 * val)}px`);
    if(cardScaleValue) cardScaleValue.textContent = (+val).toFixed(2) + "x";
    localStorage.setItem('notamCardScale', val);
    if (activeSession) renderCards();
  }
  let savedScale = localStorage.getItem('notamCardScale') || "1";
  if(cardScaleSlider) cardScaleSlider.value = savedScale;
  setCardScale(savedScale);
  if(cardScaleSlider) cardScaleSlider.addEventListener('input', e => setCardScale(e.target.value));

  document.getElementById('icao-form').onsubmit = (e) => {
    e.preventDefault();
    if (!activeSession) return;
    const icaoInput = document.getElementById('icao-input');
    const vals = icaoInput.value.split(',').map(v => v.trim().toUpperCase()).filter(v => /^[A-Z]{4}$/.test(v) && !icaoSet.includes(v));
    if (vals.length === 0) return icaoInput.value = "";
    setIcaoSet(icaoSet.concat(vals));
    saveIcaos();
    enqueueIcaos(vals);
    updateIcaoProgressBar();
    renderIcaoList();
    if (icaoSet.length > 1 && tabMode !== 'ALL') {
        // If we were on a single tab, switch to ALL to see the new ones.
        setTabMode('ALL');
    } else if (icaoSet.length === 1) {
        setTabMode(icaoSet[0]);
    }
    renderTabs();
    renderCards();
    icaoInput.value = "";
    renderIcaoSetsBar();
  };
  
  document.getElementById('reload-all').onclick = async () => { if (activeSession) await performAutoRefresh(); };
  
  document.querySelectorAll('.filter-chip-input, #f-keyword').forEach(el => {
    const render = () => { if (activeSession) renderCards(); };
    el.onchange = render;
    if (el.id === 'f-keyword') {
        let debounce;
        el.oninput = () => {
            clearTimeout(debounce);
            debounce = setTimeout(render, 300);
        };
    }
  });

  window.addEventListener('scroll', () => { 
    const btn = document.getElementById('back-to-top-btn');
    if (btn) btn.style.display = window.scrollY > 300 ? 'flex' : 'none'; 
  });
  const topBtn = document.getElementById('back-to-top-btn');
  if (topBtn) topBtn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  // CRITICAL FIX: Load initial data AFTER the DOM is ready
  const savedIcaos = JSON.parse(localStorage.getItem('notamIcaos') || '[]');
  if (Array.isArray(savedIcaos) && savedIcaos.length > 0) {
    setIcaoSet(savedIcaos);
    if (icaoSet.length === 1) setTabMode(icaoSet[0]);
    renderIcaoList();
    renderTabs();
    renderCards(); // Initial render
    enqueueIcaos(icaoSet); // Start fetching data
  } else {
    renderCards(); // Render the empty state
  }
});

window.addEventListener('click', (e) => {
  const modal = document.getElementById('notification-modal');
  if (modal && modal.style.display === "block" && !modal.contains(e.target) && !document.getElementById('notification-bell').contains(e.target)) {
    modal.style.display = "none";
  }
});

window.updateNotamCardsForIcao = function(icao, allNotams, newNotams, goneNotams) {
  if (newNotams && newNotams.length > 0) {
    flashingIcaos.add(icao);
    renderTabs();
  }
  // Only re-render if the updated ICAO is visible
  if (tabMode === 'ALL' || tabMode === icao) {
    renderCards();
  }
};
