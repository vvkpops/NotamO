document.addEventListener("DOMContentLoaded", () => {
    // --- STATE MANAGEMENT ---
    const ICAO_CLASSIFICATION_MAP = { AA: "Aerodrome", RW: "Runway", TW: "Taxiway", AB: "Obstacle", AC: "Communications", AD: "Navigation Aid", AE: "Airspace Restriction", AO: "Other", GP: "GPS", NAV: "Navigation", COM: "Communication", SVC: "Service", DOM: "Domestic", INTL: "International", MISC: "Miscellaneous", SEC: "Security", FDC: "Flight Data Center", SAA: "Special Activity Airspace" };
    let icaoSet = [];
    let notamDataByIcao = {};
    let notamFetchStatusByIcao = {};
    let lastNotamIdsByIcao = {};
    let loadedIcaosSet = new Set();
    let icaoQueue = [];
    let loadingIcaosSet = new Set();
    let tabMode = "ALL";
    let expandedCardKey = null;
    let flashingIcaos = new Set();
    let notificationsList = [];
    let notificationIdCounter = 1;
    let activeSession = true;

    // --- RATE LIMITING & AUTO-REFRESH ---
    const ICAO_BATCH_CALL_LIMIT = 30;
    const ICAO_BATCH_INTERVAL_MS = 65000;
    const REQUEST_DELAY_MS = 2100;
    let icaoBatchWindowStart = Date.now();
    let icaoBatchCallCount = 0;
    const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
    let autoRefreshTimer = null;
    let autoRefreshCountdown = AUTO_REFRESH_INTERVAL_MS / 1000;

    const delay = ms => new Promise(res => setTimeout(res, ms));

    // --- HELPERS ---
    const getClassificationTitle = (code) => ICAO_CLASSIFICATION_MAP[code] || "Other";
    const parseDate = (s) => {
        if (!s) return null;
        let d = new Date(s.trim().replace(' ', 'T') + 'Z');
        return isNaN(d) ? null : d;
    };
    const getNotamFlags = (n) => {
        const s = (n.summary + ' ' + n.body).toUpperCase();
        return { isRunwayClosure: /\b(RWY|RUNWAY)[^\n]*\b(CLSD|CLOSED)\b/.test(s), isTaxiwayClosure: /\b(TWY|TAXIWAY)[^\n]*\b(CLSD|CLOSED)\b/.test(s), isRSC: /\bRSC\b/.test(s), isCRFI: /\bCRFI\b/.test(s), isILS: /\bILS\b/.test(s) && !/\bCLOSED|CLSD\b/.test(s), isFuel: /\bFUEL\b/.test(s), isCancelled: n.type === "C" || /\b(CANCELLED|CNL)\b/.test(s) };
    };

    // --- NETWORK ---
    async function fetchNotamsForIcao(icao, isAutoRefresh = false) {
        if (!activeSession) return;
        try {
            // This now correctly calls the Vercel Serverless function
            const res = await fetch(`/api/notams?icao=${icao}`);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const data = await res.json();
            if (data.error) throw new Error(`API error: ${data.error}`);

            const prevSet = lastNotamIdsByIcao[icao] || new Set();
            notamDataByIcao[icao] = data;
            notamFetchStatusByIcao[icao] = true;
            loadingIcaosSet.delete(icao);
            loadedIcaosSet.add(icao);

            if (isAutoRefresh) {
                const currSet = new Set(data.map(n => n.id || n.number || n.qLine || n.summary));
                const newNotams = data.filter(n => !prevSet.has(n.id || n.number || n.qLine || n.summary));
                if (newNotams.length > 0) {
                    flashingIcaos.add(icao);
                    // showNewNotamAlert is not defined, so we'll just log it for now
                    console.log(`${icao}: ${newNotams.length} new NOTAM(s) detected!`);
                }
            }
            lastNotamIdsByIcao[icao] = new Set(data.map(n => n.id || n.number || n.qLine || n.summary));
            
        } catch (error) {
            console.error(`Failed to fetch NOTAMs for ${icao}:`, error);
            loadingIcaosSet.delete(icao);
        }
    }

    // --- CORE LOGIC ---
    let isProcessingQueue = false;
    async function processIcaoQueue() {
        if (isProcessingQueue || icaoQueue.length === 0) return;
        isProcessingQueue = true;

        while (icaoQueue.length > 0) {
            const now = Date.now();
            if (now - icaoBatchWindowStart > ICAO_BATCH_INTERVAL_MS) {
                icaoBatchWindowStart = now;
                icaoBatchCallCount = 0;
            }
            if (icaoBatchCallCount >= ICAO_BATCH_CALL_LIMIT) {
                const waitTime = (icaoBatchWindowStart + ICAO_BATCH_INTERVAL_MS) - now;
                await delay(waitTime > 0 ? waitTime + 1000 : 1000);
                continue;
            }
            const icao = icaoQueue.shift();
            loadingIcaosSet.add(icao);
            updateIcaoStatusBar();
            await fetchNotamsForIcao(icao, false);
            icaoBatchCallCount++;
            updateIcaoStatusBar();
            await delay(REQUEST_DELAY_MS);
        }
        isProcessingQueue = false;
        renderCards();
    }

    function enqueueIcaos(icaos) {
        icaos.forEach(icao => {
            if (!loadedIcaosSet.has(icao) && !icaoQueue.includes(icao) && !loadingIcaosSet.has(icao)) {
                icaoQueue.push(icao);
            }
        });
        processIcaoQueue();
    }

    // --- AUTO-REFRESH LOGIC ---
    function updateAutoRefreshTimerUI() {
        const timerElem = document.getElementById('icao-progress-timer');
        if (!timerElem) return;
        const min = Math.floor(autoRefreshCountdown / 60);
        const sec = autoRefreshCountdown % 60;
        timerElem.textContent = `Auto refresh in ${min}:${sec.toString().padStart(2, '0')}`;
    }

    async function performAutoRefresh() {
        if (!activeSession || icaoSet.length === 0) return;
        for (const icao of icaoSet) {
            await fetchNotamsForIcao(icao, true);
            await delay(REQUEST_DELAY_MS);
        }
        renderTabs();
        renderCards();
    }

    function startAutoRefresh() {
        if (autoRefreshTimer) clearInterval(autoRefreshTimer);
        autoRefreshTimer = setInterval(() => {
            autoRefreshCountdown--;
            if (autoRefreshCountdown <= 0) {
                autoRefreshCountdown = AUTO_REFRESH_INTERVAL_MS / 1000;
                performAutoRefresh();
            }
            updateAutoRefreshTimerUI();
        }, 1000);
    }

    // --- UI RENDERING & EVENT LISTENERS ---
    const resultDiv = document.getElementById('result');
    
    function updateIcaoStatusBar() {
        const total = icaoSet.length;
        const loaded = loadedIcaosSet.size;
        const percent = total === 0 ? 0 : (loaded / total) * 100;
        document.getElementById('icao-progress-bar').style.width = `${percent}%`;
        document.getElementById('icao-progress-text').textContent = `${loaded} / ${total} loaded`;
    }

    function renderTabs() {
        const icaoTabs = document.getElementById('icao-tabs');
        icaoTabs.innerHTML = '';
        if (icaoSet.length > 1) {
            const allTab = document.createElement('button');
            allTab.className = `px-4 py-1 rounded-t-lg font-bold ${tabMode === "ALL" ? "bg-cyan-600/60 text-white shadow" : "bg-[#222940] text-cyan-300"} mr-2 mb-1`;
            allTab.textContent = "ALL";
            allTab.onclick = () => { tabMode = "ALL"; renderCards(); };
            icaoTabs.appendChild(allTab);
        }
        icaoSet.forEach(icao => {
            const tab = document.createElement('button');
            const isFlashing = flashingIcaos.has(icao);
            tab.className = `px-4 py-1 rounded-t-lg font-bold uppercase tracking-widest ${tabMode === icao ? "bg-cyan-600/70 text-white shadow" : "bg-[#23283e] text-cyan-200"} ${isFlashing ? "flashing-tab" : ""} mr-2 mb-1`;
            tab.textContent = icao;
            tab.onclick = async () => {
                flashingIcaos.delete(icao);
                tabMode = icao;
                renderTabs();
                if (!loadedIcaosSet.has(icao)) enqueueIcaos([icao]);
                renderCards();
            };
            icaoTabs.appendChild(tab);
        });
    }

    function notamCardHtml(n) {
        const flags = getNotamFlags(n);
        const type = flags.isCancelled ? 'cancelled' : flags.isRunwayClosure ? 'rwy' : flags.isTaxiwayClosure ? 'twy' : flags.isRSC ? 'rsc' : flags.isCRFI ? 'crfi' : flags.isILS ? 'ils' : flags.isFuel ? 'fuel' : 'other';
        const headClass = `head-${type}`;
        const headTitle = type.toUpperCase().replace('RWY', 'RWY CLOSURE').replace('TWY', 'TWY CLOSURE');
        const key = (n.number || n.summary).replace(/[^a-zA-Z0-9_-]/g, '');
        const isExpanded = expandedCardKey === key;
        const isCollapsible = (n.summary?.length || 0) > 600;
        const cardClasses = ['glass', 'notam-card', 'notam-animate', type, isCollapsible ? 'is-collapsible' : '', isExpanded ? 'is-expanded' : ''].join(' ');

        return `
          <div class="${cardClasses}" id="notam-${key}" data-card-key="${key}">
            <div class="card-head ${headClass}"><span>${headTitle}</span></div>
            <div class="notam-card-content">
              <div style="display:flex;justify-content:space-between;align-items:start;">
                <div class="notam-head">${n.number || ""} <span class="text-base font-normal text-cyan-300 ml-2">${n.icao || ""}</span></div>
              </div>
              <div class="notam-meta">
                <span><b>Type:</b> ${n.type || ""}</span>
                <span><b>Class:</b> ${getClassificationTitle(n.classification)}</span>
                <span><b>Valid:</b> ${n.validFrom.replace('T', ' ').slice(0, 16)} &rarr; ${n.validTo.replace('T', ' ').slice(0, 16)}</span>
              </div>
              <div class="notam-text-content">${n.summary ? n.summary.replace(/\n/g, '<br>') : ""}</div>
              ${isCollapsible ? `<div class="card-expand-footer"><button class="card-expand-btn"><span>${isExpanded ? 'Show Less' : 'Show More'}</span><i class="icon fa fa-angle-down"></i></button></div>` : ''}
            </div>
          </div>`;
    }

    function renderCards() {
        let html = '';
        const dataToRender = (tabMode === "ALL") ? icaoSet.flatMap(icao => notamDataByIcao[icao] || []) : notamDataByIcao[tabMode] || [];
        
        if (icaoSet.length === 0) {
            resultDiv.innerHTML = `<div class="text-center text-xl text-slate-400 my-14">Add ICAO airport(s) above to fetch NOTAMs</div>`;
            return;
        }

        if (tabMode === "ALL") {
            icaoSet.forEach(icao => {
                const notams = notamDataByIcao[icao] || [];
                if (notams.length > 0) {
                    html += `<div class="mb-2"><div class="icao-header">${icao} (${notams.length})</div><div class="notam-grid">`;
                    notams.forEach(n => html += notamCardHtml(n));
                    html += `</div></div>`;
                }
            });
        } else {
            const notams = notamDataByIcao[tabMode] || [];
            html += `<div class="notam-grid">`;
            if (notams.length === 0 && loadedIcaosSet.has(tabMode)) {
                 html += `<div class="bg-[#23283e]/60 glass p-8 rounded-lg text-center text-base text-slate-400">No NOTAMs match for ${tabMode}.</div>`;
            } else {
                notams.forEach(n => html += notamCardHtml(n));
            }
            html += `</div>`;
        }
        
        resultDiv.innerHTML = html || `<div class="text-center text-lg my-10 text-cyan-400">Loading NOTAMs...</div>`;
        
        document.querySelectorAll('.is-collapsible').forEach(card => {
            card.addEventListener('click', function (e) {
                const key = this.getAttribute('data-card-key');
                expandedCardKey = (expandedCardKey === key) ? null : key;
                renderCards();
            });
        });
    }

    function renderIcaoList() {
        const list = document.getElementById('icao-list');
        list.innerHTML = '';
        icaoSet.forEach(icao => {
            const tag = document.createElement('div');
            tag.className = "bg-cyan-700/70 px-3 py-1 rounded-full font-mono text-lg uppercase tracking-wide flex items-center gap-2";
            tag.innerHTML = `<span>${icao}</span><button class="text-pink-200 hover:text-red-400 text-xl font-bold focus:outline-none" data-icao="${icao}"><i class="fa-solid fa-circle-xmark"></i></button>`;
            tag.querySelector('button').onclick = () => removeIcao(icao);
            list.appendChild(tag);
        });
    }

    function removeIcao(icaoToRemove) {
        icaoSet = icaoSet.filter(i => i !== icaoToRemove);
        delete notamDataByIcao[icaoToRemove];
        loadedIcaosSet.delete(icaoToRemove);
        localStorage.setItem('notamIcaos', JSON.stringify(icaoSet));
        renderIcaoList();
        renderTabs();
        renderCards();
    }
    
    document.getElementById('icao-form').onsubmit = (e) => {
        e.preventDefault();
        const input = document.getElementById('icao-input');
        const vals = input.value.split(',').map(v => v.trim().toUpperCase()).filter(v => /^[A-Z]{4}$/.test(v) && !icaoSet.includes(v));
        if (vals.length > 0) {
            icaoSet.push(...vals);
            localStorage.setItem('notamIcaos', JSON.stringify(icaoSet));
            renderIcaoList();
            renderTabs();
            enqueueIcaos(vals);
        }
        input.value = "";
    };

    document.getElementById('reload-all').onclick = () => {
        loadedIcaosSet.clear();
        Object.keys(notamFetchStatusByIcao).forEach(k => notamFetchStatusByIcao[k] = false);
        enqueueIcaos([...icaoSet]);
    };

    // --- INITIALIZATION ---
    const savedIcaos = JSON.parse(localStorage.getItem('notamIcaos') || '[]');
    if (savedIcaos.length > 0) {
        icaoSet = savedIcaos;
        renderIcaoList();
        renderTabs();
        enqueueIcaos(icaoSet);
    }
    startAutoRefresh();
    updateAutoRefreshTimerUI();
});
