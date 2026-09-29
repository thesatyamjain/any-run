// AnyRun Web Control Center Client - Industry Standard Edition

const state = {
  status: 'idle',
  projectDir: '',
  projectConfig: null,
  activePort: null,
  gatewayPort: null,
  tunnelUrl: null,
  lanUrl: null,
  qrDataUrl: null,
  qrLanDataUrl: null,
  tunnelProvider: 'auto',
  browseCurrent: '',
  browseParent: null,
  activeMode: 'tunnel', // 'tunnel' | 'lan'
  activeTab: 'console', // 'console' | 'traffic'
  requests: [],
  systemStats: { memoryMB: 0, uptimeSec: 0 }
};

// DOM Elements - Telemetry Strip
const statusPulse = document.getElementById('statusPulse');
const telemetryStatus = document.getElementById('telemetryStatus');
const telemetryUptime = document.getElementById('telemetryUptime');
const telemetryRam = document.getElementById('telemetryRam');
const telemetryPort = document.getElementById('telemetryPort');
const telemetryProvider = document.getElementById('telemetryProvider');

// DOM Elements - Project Configuration
const projectPathInput = document.getElementById('projectPathInput');
const browseBtn = document.getElementById('browseBtn');
const scanBtn = document.getElementById('scanBtn');
const archBadge = document.getElementById('archBadge');
const recentProjectsBar = document.getElementById('recentProjectsBar');
const recentChips = document.getElementById('recentChips');

const specRuntime = document.getElementById('specRuntime');
const specStack = document.getElementById('specStack');
const specCommand = document.getElementById('specCommand');

const portOverrideInput = document.getElementById('portOverrideInput');
const tunnelSelect = document.getElementById('tunnelSelect');

const runActionBtn = document.getElementById('runActionBtn');
const runActionText = document.getElementById('runActionText');
const restartBtn = document.getElementById('restartBtn');

// DOM Elements - Gateway & QR Presentation
const modeTunnelBtn = document.getElementById('modeTunnelBtn');
const modeLanBtn = document.getElementById('modeLanBtn');
const linkLabel = document.getElementById('linkLabel');
const qrImage = document.getElementById('qrImage');
const qrPlaceholder = document.getElementById('qrPlaceholder');
const tunnelUrlInput = document.getElementById('tunnelUrlInput');
const copyUrlBtn = document.getElementById('copyUrlBtn');
const openExternalBtn = document.getElementById('openExternalBtn');
const downloadQrBtn = document.getElementById('downloadQrBtn');
const metaLan = document.getElementById('metaLan');

// DOM Elements - Device Simulator Modal
const toggleMobilePreviewBtn = document.getElementById('toggleMobilePreviewBtn');
const previewModal = document.getElementById('previewModal');
const deviceModalWindow = document.getElementById('deviceModalWindow');
const closePreviewBtn = document.getElementById('closePreviewBtn');
const previewIframe = document.getElementById('previewIframe');
const devicePresetSelect = document.getElementById('devicePresetSelect');
const rotateDeviceBtn = document.getElementById('rotateDeviceBtn');
const reloadDeviceBtn = document.getElementById('reloadDeviceBtn');

// DOM Elements - HTTP Request Inspector Modal (ngrok style)
const requestDetailModal = document.getElementById('requestDetailModal');
const closeReqDetailBtn = document.getElementById('closeReqDetailBtn');
const copyCurlBtn = document.getElementById('copyCurlBtn');
const replayReqBtn = document.getElementById('replayReqBtn');
const replayBtnText = document.getElementById('replayBtnText');
const reqDetailMethod = document.getElementById('reqDetailMethod');
const reqDetailPath = document.getElementById('reqDetailPath');
const reqDetailStatus = document.getElementById('reqDetailStatus');
const reqDetailDuration = document.getElementById('reqDetailDuration');
const reqHeadersList = document.getElementById('reqHeadersList');
const resHeadersList = document.getElementById('resHeadersList');
let selectedRequest = null;

// DOM Elements - Tabbed Console & Traffic Inspector
const tabConsoleBtn = document.getElementById('tabConsoleBtn');
const tabTrafficBtn = document.getElementById('tabTrafficBtn');
const trafficBadge = document.getElementById('trafficBadge');
const consoleControls = document.getElementById('consoleControls');
const trafficControls = document.getElementById('trafficControls');
const consoleOutput = document.getElementById('consoleOutput');
const trafficOutput = document.getElementById('trafficOutput');
const trafficRows = document.getElementById('trafficRows');
const trafficEmpty = document.getElementById('trafficEmpty');
const logFilterInput = document.getElementById('logFilterInput');
const trafficMethodFilter = document.getElementById('trafficMethodFilter');
const trafficStatusFilter = document.getElementById('trafficStatusFilter');
const trafficFilterInput = document.getElementById('trafficFilterInput');
const clearLogsBtn = document.getElementById('clearLogsBtn');
const clearTrafficBtn = document.getElementById('clearTrafficBtn');
const autoScrollCheck = document.getElementById('autoScrollCheck');

// DOM Elements - Directory Browser
const browseModal = document.getElementById('browseModal');
const closeBrowseBtn = document.getElementById('closeBrowseBtn');
const cancelBrowseBtn = document.getElementById('cancelBrowseBtn');
const selectFolderBtn = document.getElementById('selectFolderBtn');
const browseCurrentPath = document.getElementById('browseCurrentPath');
const browseList = document.getElementById('browseList');
const browseUpBtn = document.getElementById('browseUpBtn');

// Helper: Format Seconds to MM:SS or HH:MM:SS
function formatDuration(sec) {
  if (!sec || sec <= 0) return '00:00';
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Telemetry Stats Updater
function updateTelemetryStats(stats) {
  if (!stats) return;
  state.systemStats = stats;
  if (telemetryUptime) {
    telemetryUptime.textContent = formatDuration(stats.uptimeSec);
  }
  if (telemetryRam) {
    telemetryRam.textContent = `${stats.memoryMB || 0} MB`;
  }
}

// Recent Projects Storage & Quick Launch
function getRecentProjects() {
  try {
    return JSON.parse(localStorage.getItem('anyrun_recent') || '[]');
  } catch {
    return [];
  }
}

function saveRecentProject(dirPath, framework) {
  if (!dirPath) return;
  let list = getRecentProjects();
  list = list.filter(item => item.path !== dirPath);
  const name = dirPath.split(/[\\\/]/).filter(Boolean).pop() || dirPath;
  list.unshift({ path: dirPath, name, framework: framework || 'Custom' });
  if (list.length > 5) list = list.slice(0, 5);
  try {
    localStorage.setItem('anyrun_recent', JSON.stringify(list));
  } catch {}
  renderRecentChips();
}

function renderRecentChips() {
  if (!recentProjectsBar || !recentChips) return;
  const list = getRecentProjects();
  if (list.length === 0) {
    recentProjectsBar.classList.add('hidden');
    return;
  }
  recentProjectsBar.classList.remove('hidden');
  recentChips.innerHTML = '';
  list.forEach(item => {
    const chip = document.createElement('div');
    chip.className = 'recent-chip';
    chip.title = item.path;
    chip.innerHTML = `
      <span>${item.name}</span>
      <span class="recent-chip-badge">${item.framework}</span>
    `;
    chip.addEventListener('click', () => {
      projectPathInput.value = item.path;
      inspectDirectory(item.path);
    });
    recentChips.appendChild(chip);
  });
}

// SSE Connection for Real-Time Telemetry, Logs, and Traffic
function initSSE() {
  const evtSource = new EventSource('/api/events');

  evtSource.addEventListener('status', (e) => {
    try {
      const data = JSON.parse(e.data);
      updateState(data);
    } catch (err) {
      console.error('Failed to parse status event', err);
    }
  });

  evtSource.addEventListener('log', (e) => {
    try {
      const logEntry = JSON.parse(e.data);
      appendLog(logEntry);
    } catch (err) {
      console.error('Failed to parse log event', err);
    }
  });

  evtSource.addEventListener('request', (e) => {
    try {
      const reqEntry = JSON.parse(e.data);
      appendRequest(reqEntry);
    } catch (err) {
      console.error('Failed to parse request event', err);
    }
  });

  evtSource.addEventListener('telemetry', (e) => {
    try {
      const stats = JSON.parse(e.data);
      updateTelemetryStats(stats);
    } catch (err) {
      console.error('Failed to parse telemetry event', err);
    }
  });

  evtSource.onerror = () => {
    telemetryStatus.textContent = 'RECONNECTING';
    statusPulse.className = 'status-pulse starting';
  };
}

// Mode Switcher handlers
modeTunnelBtn.addEventListener('click', () => {
  state.activeMode = 'tunnel';
  modeTunnelBtn.classList.add('active');
  modeLanBtn.classList.remove('active');
  refreshActiveLinkDisplay();
});

modeLanBtn.addEventListener('click', () => {
  state.activeMode = 'lan';
  modeLanBtn.classList.add('active');
  modeTunnelBtn.classList.remove('active');
  refreshActiveLinkDisplay();
});

function refreshActiveLinkDisplay() {
  const isLan = state.activeMode === 'lan';
  const activeUrl = isLan ? state.lanUrl : state.tunnelUrl;
  const activeQr = isLan ? (state.qrLanDataUrl || state.qrDataUrl) : state.qrDataUrl;

  linkLabel.textContent = isLan ? 'LOCAL WI-FI (FASTEST / ZERO-DNS)' : 'PUBLIC HTTPS URL';

  if (activeUrl) {
    tunnelUrlInput.value = activeUrl;
    openExternalBtn.href = activeUrl;
    copyUrlBtn.disabled = false;
    openExternalBtn.classList.remove('disabled');
    downloadQrBtn.disabled = false;

    if (activeQr) {
      qrImage.src = activeQr;
      qrImage.classList.remove('hidden');
      qrPlaceholder.classList.add('hidden');
    }
  } else {
    tunnelUrlInput.value = '';
    openExternalBtn.removeAttribute('href');
    downloadQrBtn.disabled = true;
    qrImage.classList.add('hidden');
    qrPlaceholder.classList.remove('hidden');
  }
}

// Update UI from state
function updateState(newState) {
  state.status = newState.status || 'idle';
  state.activePort = newState.activePort;
  state.gatewayPort = newState.gatewayPort || newState.activePort;
  state.tunnelUrl = newState.tunnelUrl;
  state.lanUrl = newState.lanUrl;
  state.qrDataUrl = newState.qrDataUrl;
  state.qrLanDataUrl = newState.qrLanDataUrl;
  state.projectConfig = newState.projectConfig;

  // Status & Telemetry Strip
  telemetryStatus.textContent = state.status.toUpperCase();
  telemetryPort.textContent = state.activePort ? String(state.activePort) : '--';
  telemetryProvider.textContent = (newState.tunnelProvider || 'CLOUDFLARE').toUpperCase();

  if (newState.systemStats) {
    updateTelemetryStats(newState.systemStats);
  }

  if (state.lanUrl) {
    metaLan.textContent = state.lanUrl.replace('http://', '');
  } else {
    metaLan.textContent = '--';
  }

  statusPulse.className = 'status-pulse';
  if (state.status === 'running') {
    statusPulse.classList.add('active');
  } else if (state.status === 'starting' || state.status === 'installing' || state.status === 'detecting') {
    statusPulse.classList.add('starting');
  } else if (state.status === 'error') {
    statusPulse.classList.add('error');
  }

  // Action Button States
  if (state.status === 'running') {
    runActionBtn.className = 'btn btn-primary btn-stop';
    runActionText.textContent = 'STOP PROCESS & TUNNEL';
    restartBtn.disabled = false;
  } else if (state.status === 'starting' || state.status === 'installing' || state.status === 'detecting') {
    runActionBtn.className = 'btn btn-primary';
    runActionText.textContent = `${state.status.toUpperCase()}...`;
    restartBtn.disabled = true;
  } else {
    runActionBtn.className = 'btn btn-primary';
    runActionText.textContent = 'ONE-CLICK RUN & TUNNEL';
    restartBtn.disabled = true;
  }

  // Architecture Specs
  if (state.projectConfig) {
    archBadge.textContent = (state.projectConfig.framework || 'DETECTED').toUpperCase();
    specRuntime.textContent = state.projectConfig.name || 'Universal';
    specStack.textContent = state.projectConfig.framework || 'Custom';
    const cmdStr = state.projectConfig.command === 'internal:static'
      ? 'Built-in Embedded Static HTTP Server'
      : `${state.projectConfig.command} ${state.projectConfig.args.join(' ')}`;
    specCommand.textContent = cmdStr;

    if (!portOverrideInput.value && state.projectConfig.defaultPort) {
      portOverrideInput.placeholder = String(state.projectConfig.defaultPort);
    }
  }

  if (newState.projectDir && !projectPathInput.value) {
    projectPathInput.value = newState.projectDir;
  }

  // Refresh QR & Link View
  refreshActiveLinkDisplay();
}

// Log Append
function appendLog(entry) {
  const div = document.createElement('div');
  div.className = `log-entry ${entry.type}`;

  const timeSpan = document.createElement('span');
  timeSpan.className = 'log-time';
  const d = new Date(entry.timestamp);
  timeSpan.textContent = `[${d.toTimeString().split(' ')[0]}]`;

  const msgSpan = document.createElement('span');
  msgSpan.className = 'log-msg';
  msgSpan.textContent = entry.text;

  div.appendChild(timeSpan);
  div.appendChild(msgSpan);

  const filter = logFilterInput.value.toLowerCase();
  if (filter && !entry.text.toLowerCase().includes(filter)) {
    div.classList.add('hidden');
  }

  consoleOutput.appendChild(div);

  if (autoScrollCheck.checked) {
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  }
}

// Live Traffic Inspector
function appendRequest(reqEntry) {
  state.requests.unshift(reqEntry);
  if (state.requests.length > 500) state.requests.pop();

  trafficBadge.textContent = String(state.requests.length);

  if (trafficEmpty) {
    trafficEmpty.classList.add('hidden');
  }

  const row = document.createElement('div');
  row.className = 'traffic-row';

  const d = new Date(reqEntry.timestamp);
  const timeStr = d.toTimeString().split(' ')[0];

  const statusNum = reqEntry.status || 200;
  const statusClass = statusNum < 300 ? 'status-2xx' : (statusNum < 400 ? 'status-3xx' : 'status-4xx');

  row.innerHTML = `
    <span class="col-time" style="color: var(--text-muted);">${timeStr}</span>
    <span class="col-method"><span class="method-badge method-${reqEntry.method}">${reqEntry.method}</span></span>
    <span class="col-path traffic-path" title="${reqEntry.path}">${reqEntry.path}</span>
    <span class="col-status"><span class="status-badge ${statusClass}">${statusNum}</span></span>
    <span class="col-duration traffic-duration">${reqEntry.durationMs}ms</span>
  `;

  row.style.cursor = 'pointer';
  row.title = 'Click to inspect headers & copy as cURL';
  row.addEventListener('click', () => {
    openRequestInspector(reqEntry);
  });

  if (trafficRows.firstChild) {
    trafficRows.insertBefore(row, trafficRows.firstChild);
  } else {
    trafficRows.appendChild(row);
  }

  applyTrafficFilters();
}

// Open HTTP Request Inspector (ngrok style)
function openRequestInspector(reqEntry) {
  selectedRequest = reqEntry;
  reqDetailMethod.textContent = reqEntry.method;
  reqDetailMethod.className = `method-badge method-${reqEntry.method}`;
  reqDetailPath.textContent = reqEntry.path;

  const statusNum = reqEntry.status || 200;
  const statusClass = statusNum < 300 ? 'status-2xx' : (statusNum < 400 ? 'status-3xx' : 'status-4xx');
  reqDetailStatus.textContent = String(statusNum);
  reqDetailStatus.className = `status-badge ${statusClass}`;

  reqDetailDuration.textContent = `${reqEntry.durationMs}ms`;

  reqHeadersList.innerHTML = '';
  const reqHeaders = reqEntry.headers || {};
  const reqKeys = Object.keys(reqHeaders);
  if (reqKeys.length === 0) {
    reqHeadersList.innerHTML = '<div style="color: var(--text-muted); font-size: 11px;">No headers captured.</div>';
  } else {
    reqKeys.forEach(k => {
      const r = document.createElement('div');
      r.className = 'header-row';
      r.innerHTML = `<span class="header-key">${k}:</span><span class="header-val">${reqHeaders[k]}</span>`;
      reqHeadersList.appendChild(r);
    });
  }

  resHeadersList.innerHTML = '';
  const resHeaders = reqEntry.responseHeaders || {};
  const resKeys = Object.keys(resHeaders);
  if (resKeys.length === 0) {
    resHeadersList.innerHTML = '<div style="color: var(--text-muted); font-size: 11px;">No response headers captured.</div>';
  } else {
    resKeys.forEach(k => {
      const r = document.createElement('div');
      r.className = 'header-row';
      r.innerHTML = `<span class="header-key">${k}:</span><span class="header-val">${resHeaders[k]}</span>`;
      resHeadersList.appendChild(r);
    });
  }

  requestDetailModal.classList.remove('hidden');
}

closeReqDetailBtn.addEventListener('click', () => {
  requestDetailModal.classList.add('hidden');
  selectedRequest = null;
});

copyCurlBtn.addEventListener('click', () => {
  if (!selectedRequest) return;
  const origin = state.lanUrl || state.tunnelUrl || `http://localhost:${state.activePort || 3000}`;
  let cmd = `curl -X ${selectedRequest.method} "${origin}${selectedRequest.path}"`;
  const headers = selectedRequest.headers || {};
  for (const [k, v] of Object.entries(headers)) {
    if (!['host', 'content-length'].includes(k.toLowerCase())) {
      cmd += ` \\\n  -H "${k}: ${v}"`;
    }
  }
  navigator.clipboard.writeText(cmd).then(() => {
    copyCurlBtn.style.borderColor = 'var(--status-emerald)';
    copyCurlBtn.style.color = 'var(--status-emerald)';
    setTimeout(() => {
      copyCurlBtn.style.borderColor = '';
      copyCurlBtn.style.color = '';
    }, 1200);
  });
});

if (replayReqBtn) {
  replayReqBtn.addEventListener('click', async () => {
    if (!selectedRequest) return;
    const origText = replayBtnText ? replayBtnText.textContent : 'REPLAY';
    if (replayBtnText) replayBtnText.textContent = 'REPLAYING...';
    replayReqBtn.disabled = true;

    try {
      const res = await fetch('/api/replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: selectedRequest.method,
          path: selectedRequest.path,
          headers: selectedRequest.headers
        })
      });
      const data = await res.json();
      if (data.success) {
        if (replayBtnText) replayBtnText.textContent = `SENT (${data.status})`;
        replayReqBtn.style.borderColor = 'var(--status-emerald)';
        replayReqBtn.style.color = 'var(--status-emerald)';
      } else {
        if (replayBtnText) replayBtnText.textContent = 'FAILED';
        replayReqBtn.style.borderColor = 'var(--status-crimson)';
      }
    } catch (err) {
      if (replayBtnText) replayBtnText.textContent = 'ERROR';
    } finally {
      setTimeout(() => {
        if (replayBtnText) replayBtnText.textContent = origText;
        replayReqBtn.disabled = false;
        replayReqBtn.style.borderColor = '';
        replayReqBtn.style.color = '';
      }, 1500);
    }
  });
}

// Tab Switching (Console vs Traffic)
tabConsoleBtn.addEventListener('click', () => {
  state.activeTab = 'console';
  tabConsoleBtn.classList.add('active');
  tabTrafficBtn.classList.remove('active');
  consoleControls.classList.remove('hidden');
  trafficControls.classList.add('hidden');
  consoleOutput.classList.remove('hidden');
  trafficOutput.classList.add('hidden');
});

tabTrafficBtn.addEventListener('click', () => {
  state.activeTab = 'traffic';
  tabTrafficBtn.classList.add('active');
  tabConsoleBtn.classList.remove('active');
  trafficControls.classList.remove('hidden');
  consoleControls.classList.add('hidden');
  trafficOutput.classList.remove('hidden');
  consoleOutput.classList.add('hidden');
});

// Clear Traffic
clearTrafficBtn.addEventListener('click', () => {
  state.requests = [];
  trafficRows.innerHTML = '';
  if (trafficEmpty) {
    trafficRows.appendChild(trafficEmpty);
    trafficEmpty.classList.remove('hidden');
  }
  trafficBadge.textContent = '0';
});

// Traffic Filtering (Method, Status, and Query)
function applyTrafficFilters() {
  const methodVal = trafficMethodFilter ? trafficMethodFilter.value : 'ALL';
  const statusVal = trafficStatusFilter ? trafficStatusFilter.value : 'ALL';
  const query = trafficFilterInput ? trafficFilterInput.value.toLowerCase() : '';

  const rows = trafficRows.querySelectorAll('.traffic-row');
  rows.forEach(row => {
    const methodEl = row.querySelector('.method-badge');
    const statusEl = row.querySelector('.status-badge');
    const pathEl = row.querySelector('.traffic-path');

    const m = methodEl ? methodEl.textContent.trim() : '';
    const s = statusEl ? parseInt(statusEl.textContent, 10) : 200;
    const p = pathEl ? pathEl.textContent.toLowerCase() : '';

    let matchMethod = (methodVal === 'ALL') || (m === methodVal);
    let matchStatus = true;
    if (statusVal === '2xx') matchStatus = s >= 200 && s < 300;
    else if (statusVal === '3xx') matchStatus = s >= 300 && s < 400;
    else if (statusVal === '4xx5xx') matchStatus = s >= 400;

    let matchPath = !query || p.includes(query);

    if (matchMethod && matchStatus && matchPath) {
      row.classList.remove('hidden');
    } else {
      row.classList.add('hidden');
    }
  });
}

if (trafficMethodFilter) trafficMethodFilter.addEventListener('change', applyTrafficFilters);
if (trafficStatusFilter) trafficStatusFilter.addEventListener('change', applyTrafficFilters);
if (trafficFilterInput) trafficFilterInput.addEventListener('input', applyTrafficFilters);

// Inspect Directory
async function inspectDirectory(targetPath) {
  const dir = targetPath || projectPathInput.value.trim();
  if (!dir) return;

  archBadge.textContent = 'SCANNING...';
  try {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: dir })
    });
    const data = await res.json();
    if (data.success) {
      state.projectConfig = data.config;
      updateState({ projectConfig: data.config, projectDir: dir });
      saveRecentProject(dir, data.config.framework || data.config.name);
    } else {
      archBadge.textContent = 'SCAN ERROR';
      alert(`Architecture scan error: ${data.error}`);
    }
  } catch (err) {
    archBadge.textContent = 'ERROR';
    console.error(err);
  }
}

// Trigger Run / Stop
runActionBtn.addEventListener('click', async () => {
  if (state.status === 'running') {
    try {
      await fetch('/api/stop', { method: 'POST' });
    } catch (err) {
      console.error(err);
    }
  } else {
    const projectPath = projectPathInput.value.trim();
    if (!projectPath) {
      alert('Please enter or select a project directory.');
      return;
    }

    const payload = {
      path: projectPath,
      port: portOverrideInput.value ? parseInt(portOverrideInput.value, 10) : null,
      tunnel: tunnelSelect.value
    };

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        saveRecentProject(projectPath, state.projectConfig ? state.projectConfig.framework : null);
      } else {
        alert(`Launch error: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
    }
  }
});

// Restart Button
restartBtn.addEventListener('click', async () => {
  try {
    await fetch('/api/restart', { method: 'POST' });
  } catch (err) {
    console.error(err);
  }
});

// Scan Button
scanBtn.addEventListener('click', () => inspectDirectory());

// Copy URL with visual confirmation
function copyActiveUrl() {
  const activeUrl = state.activeMode === 'lan' ? state.lanUrl : state.tunnelUrl;
  if (activeUrl) {
    navigator.clipboard.writeText(activeUrl).then(() => {
      copyUrlBtn.style.borderColor = 'var(--status-emerald)';
      copyUrlBtn.style.color = 'var(--status-emerald)';
      setTimeout(() => {
        copyUrlBtn.style.borderColor = '';
        copyUrlBtn.style.color = '';
      }, 1200);
    });
  }
}

copyUrlBtn.addEventListener('click', copyActiveUrl);

// Download QR Code
downloadQrBtn.addEventListener('click', () => {
  const activeQr = state.activeMode === 'lan' ? (state.qrLanDataUrl || state.qrDataUrl) : state.qrDataUrl;
  if (activeQr) {
    const a = document.createElement('a');
    a.href = activeQr;
    a.download = `anyrun-${state.activeMode}-qr-${Date.now()}.png`;
    a.click();
  }
});

// Mobile Simulator Preview Toggle & Controls
toggleMobilePreviewBtn.addEventListener('click', () => {
  const activeUrl = state.lanUrl || state.tunnelUrl || (state.activePort ? `http://localhost:${state.activePort}` : null);
  if (!activeUrl) {
    alert('Launch your project first to preview on the device simulator.');
    return;
  }
  previewIframe.src = activeUrl;
  previewModal.classList.remove('hidden');
});

closePreviewBtn.addEventListener('click', () => {
  previewModal.classList.add('hidden');
  previewIframe.src = 'about:blank';
});

devicePresetSelect.addEventListener('change', () => {
  const preset = devicePresetSelect.value;
  deviceModalWindow.classList.remove('ipad', 'desktop');
  if (preset === 'ipad') {
    deviceModalWindow.classList.add('ipad');
  } else if (preset === 'desktop') {
    deviceModalWindow.classList.add('desktop');
  }
});

rotateDeviceBtn.addEventListener('click', () => {
  deviceModalWindow.classList.toggle('landscape');
});

reloadDeviceBtn.addEventListener('click', () => {
  if (previewIframe.src && previewIframe.src !== 'about:blank') {
    previewIframe.src = previewIframe.src;
  }
});

// Clear Console
clearLogsBtn.addEventListener('click', () => {
  consoleOutput.innerHTML = '';
});

// Log Filtering
logFilterInput.addEventListener('input', () => {
  const query = logFilterInput.value.toLowerCase();
  const entries = consoleOutput.querySelectorAll('.log-entry');
  entries.forEach(entry => {
    if (!query || entry.textContent.toLowerCase().includes(query)) {
      entry.classList.remove('hidden');
    } else {
      entry.classList.add('hidden');
    }
  });
});

// Folder Browser Logic (Supports multi-disk Windows browsing)
browseBtn.addEventListener('click', () => {
  openFolderBrowser(projectPathInput.value.trim() || '');
});

closeBrowseBtn.addEventListener('click', () => browseModal.classList.add('hidden'));
cancelBrowseBtn.addEventListener('click', () => browseModal.classList.add('hidden'));

async function openFolderBrowser(targetDir) {
  browseModal.classList.remove('hidden');
  loadDirectoryList(targetDir);
}

async function loadDirectoryList(dir) {
  try {
    const res = await fetch(`/api/browse?dir=${encodeURIComponent(dir)}`);
    const data = await res.json();
    if (data.folders) {
      state.browseCurrent = data.current;
      state.browseParent = data.parent;
      browseCurrentPath.textContent = data.current;
      browseList.innerHTML = '';

      data.folders.forEach(f => {
        const item = document.createElement('div');
        item.className = 'browse-item';
        const isDrive = f.name.includes('Drive (');
        const iconSvg = isDrive
          ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
               <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
               <line x1="6" y1="6" x2="6.01" y2="6"></line>
               <line x1="6" y1="18" x2="6.01" y2="18"></line>
             </svg>`
          : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
             </svg>`;
        item.innerHTML = `${iconSvg}<span>${f.name}</span>`;
        item.addEventListener('click', () => {
          loadDirectoryList(f.path);
        });
        browseList.appendChild(item);
      });
    }
  } catch (err) {
    console.error('Directory browse failed', err);
  }
}

browseUpBtn.addEventListener('click', () => {
  if (state.browseParent) {
    loadDirectoryList(state.browseParent);
  } else if (state.browseCurrent && state.browseCurrent !== 'This PC') {
    loadDirectoryList('drives');
  }
});

selectFolderBtn.addEventListener('click', () => {
  if (state.browseCurrent && state.browseCurrent !== 'This PC') {
    projectPathInput.value = state.browseCurrent;
    browseModal.classList.add('hidden');
    inspectDirectory(state.browseCurrent);
  }
});

// Full-Viewport Drag & Drop Folder Support
const dragDropOverlay = document.getElementById('dragDropOverlay');
let dragCounter = 0;

window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragCounter++;
  if (dragDropOverlay) {
    dragDropOverlay.classList.remove('hidden');
  }
});

window.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy';
  }
});

window.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dragCounter = Math.max(0, dragCounter - 1);
  if (dragCounter === 0 && dragDropOverlay) {
    dragDropOverlay.classList.add('hidden');
  }
});

window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragCounter = 0;
  if (dragDropOverlay) {
    dragDropOverlay.classList.add('hidden');
  }

  let droppedName = '';
  let droppedPath = '';

  try {
    // 1. Inspect dataTransfer items for FileSystemEntry
    if (e.dataTransfer && e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      const item = e.dataTransfer.items[0];
      if (typeof item.webkitGetAsEntry === 'function') {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          droppedName = entry.name;
        }
      }
      const file = item.getAsFile ? item.getAsFile() : null;
      if (file && file.path) {
        droppedPath = file.path;
      }
    }

    // 2. Fallback to dataTransfer files
    if (!droppedName && e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      droppedName = file.name;
      if (file.path) {
        droppedPath = file.path;
      }
    }

    // 3. Fallback to raw text string if path string dragged
    if (!droppedName && !droppedPath && e.dataTransfer) {
      const text = e.dataTransfer.getData('text/plain');
      if (text) {
        droppedPath = text.trim().replace(/^["']|["']$/g, '');
      }
    }

    if (!droppedName && !droppedPath) return;

    // Query backend to resolve the real folder path on the system
    const res = await fetch('/api/locate-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: droppedName, path: droppedPath })
    });
    const data = await res.json();

    const resolved = (data.success && data.path) ? data.path : (data.suggestedPath || droppedPath || droppedName);

    if (resolved) {
      projectPathInput.value = resolved;
      projectPathInput.classList.add('highlight-field');
      setTimeout(() => projectPathInput.classList.remove('highlight-field'), 1600);
      inspectDirectory(resolved);
    }
  } catch (err) {
    console.error('Failed to locate dropped folder:', err);
  }
});

// Global Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
  const activeTag = document.activeElement ? document.activeElement.tagName : '';
  if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
    return;
  }

  if (e.key === 'Escape') {
    previewModal.classList.add('hidden');
    previewIframe.src = 'about:blank';
    browseModal.classList.add('hidden');
    requestDetailModal.classList.add('hidden');
    return;
  }

  const key = e.key.toLowerCase();
  if (key === 'o') {
    const url = state.activeMode === 'lan' ? state.lanUrl : state.tunnelUrl;
    if (url) window.open(url, '_blank');
  } else if (key === 'c') {
    copyActiveUrl();
  } else if (key === 'w') {
    state.activeMode = 'lan';
    modeLanBtn.classList.add('active');
    modeTunnelBtn.classList.remove('active');
    refreshActiveLinkDisplay();
    copyActiveUrl();
  } else if (key === 'r') {
    if (state.status === 'running') restartBtn.click();
  } else if (key === 'q') {
    if (state.status === 'running') runActionBtn.click();
  }
});

// Initial Data Loading
fetch('/api/status')
  .then(res => res.json())
  .then(data => {
    updateState(data);
    if (data.projectDir) {
      projectPathInput.value = data.projectDir;
    }
  })
  .catch(() => {});

fetch('/api/logs')
  .then(res => res.json())
  .then(logs => {
    if (Array.isArray(logs)) {
      logs.forEach(appendLog);
    }
  })
  .catch(() => {});

fetch('/api/requests')
  .then(res => res.json())
  .then(requests => {
    if (Array.isArray(requests)) {
      requests.forEach(appendRequest);
    }
  })
  .catch(() => {});

const shutdownAppBtn = document.getElementById('shutdownAppBtn');

if (shutdownAppBtn) {
  shutdownAppBtn.addEventListener('click', async () => {
    if (confirm('Shut down AnyRun and terminate all background processes and tunnels?')) {
      try {
        await fetch('/api/shutdown', { method: 'POST' });
        document.body.innerHTML = `
          <div style="display:flex;height:100vh;align-items:center;justify-content:center;font-family:var(--font-mono);color:var(--text-muted);text-align:center;background:#0c0e11;">
            <div>
              <h2 style="color:var(--text-primary);margin-bottom:8px;">ANYRUN HAS SHUT DOWN</h2>
              <p>All background services, tunnels, and ports have been cleanly terminated.</p>
              <p style="margin-top:16px;font-size:11px;color:var(--accent-amber);">You can now close this browser tab.</p>
            </div>
          </div>
        `;
        window.close();
      } catch (err) {
        window.close();
      }
    }
  });
}

// Automatically notify backend when the dashboard tab/window is closed
window.addEventListener('pagehide', () => {
  navigator.sendBeacon('/api/browser-closed');
});

renderRecentChips();
initSSE();
