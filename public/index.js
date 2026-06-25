/* --- DASHBOARD LOGIC: SAT_NAS TELEMETRY --- */

let loadedChannels = [];
let filteredChannels = [];
let currentChannelIndex = -1;
let hasLoadedIptvOnInit = false;

function makeAsciiBar(pct) {
  const rounded = Math.min(100, Math.max(0, parseFloat(pct) || 0));
  const blocks = Math.round(rounded / 10);
  let bar = '';
  for (let i = 0; i < 10; i++) {
    bar += i < blocks ? '█' : '░';
  }
  return `[${bar}] ${Math.round(rounded)}%`;
}

async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    if (res.status === 401) {
      window.location.href = 'login.html';
      return;
    }
    const data = await res.json();
    
    // 1. Uptime
    document.getElementById('val-uptime').innerText = data.uptime;
    
    // 2. CPU / RAM
    document.getElementById('bar-cpu').innerText = makeAsciiBar(data.resources.cpu_usage_pct);
    const ramPct = (data.resources.ram_used_mb / data.resources.ram_total_mb) * 100;
    document.getElementById('bar-ram').innerText = makeAsciiBar(ramPct);
    document.getElementById('val-ram-used').innerText = data.resources.ram_used_mb;
    document.getElementById('val-ram-total').innerText = data.resources.ram_total_mb;

    // 3. WAN Internet Status (Green LED)
    const ledInternet = document.getElementById('led-internet');
    if (data.internet.status === 'OK') {
      ledInternet.className = 'led led-green';
      ledInternet.innerText = '[ WAN INTERNET: OK ]';
    } else {
      ledInternet.className = 'led led-red';
      ledInternet.innerText = '[ WAN INTERNET: DOWN ]';
    }

    // 4. USB Interface status (enx0a2f530b6e65)
    const ledUsb = document.getElementById('led-usb');
    if (data.interfaces.usb.status === 'ACTIVE') {
      ledUsb.className = 'led led-green';
      ledUsb.innerText = `[ USB TETHER: ACTIVE (${data.interfaces.usb.ip}) ]`;
    } else {
      ledUsb.className = 'led led-red';
      ledUsb.innerText = '[ USB TETHER: OFFLINE ]';
    }

    // 5. Discos
    const disksContainer = document.getElementById('disks-container');
    disksContainer.innerHTML = '';
    data.disks.forEach(disk => {
      const diskDiv = document.createElement('div');
      diskDiv.className = 'metric';
      diskDiv.innerHTML = `
        <span class="label">MOUNT: ${disk.mount} (${disk.used_gb} / ${disk.total_gb})</span>
        <div class="ascii-bar">${makeAsciiBar(disk.percentage)}</div>
      `;
      disksContainer.appendChild(diskDiv);
    });

    // 6. Docker Containers Table
    const dockerTbody = document.getElementById('docker-tbody');
    dockerTbody.innerHTML = '';
    
    if (!data.docker || data.docker.length === 0) {
      const row = document.createElement('tr');
      row.innerHTML = `<td colspan="3" style="text-align: center; color: #888;">[ NO CONTAINERS FOUND ]</td>`;
      dockerTbody.appendChild(row);
    } else {
      data.docker.forEach(container => {
        const row = document.createElement('tr');
        const isRunning = container.status.startsWith('running') || container.status.startsWith('up');
        row.innerHTML = `
          <td>${container.name}</td>
          <td class="${isRunning ? 'status-green' : 'status-red'}">${container.status}</td>
          <td>
            <button onclick="toggleDocker('${container.name}', '${isRunning ? 'stop' : 'start'}')" class="brut-btn-sm">
              [ ${isRunning ? 'STOP' : 'START'} ]
            </button>
          </td>
        `;
        dockerTbody.appendChild(row);
      });
    }

    // Carga automatica inicial de IPTV
    if (data.iptv_url && !hasLoadedIptvOnInit) {
      hasLoadedIptvOnInit = true;
      const iptvUrlInput = document.getElementById('iptv-playlist-url');
      if (iptvUrlInput) {
        iptvUrlInput.value = data.iptv_url;
      }
      loadIptvPlaylist(data.iptv_url);
    }

  } catch (e) {
    console.error('Error fetching system stats', e);
  }
}

// Docker toggle action with prompt
window.toggleDocker = async function(name, action) {
  const confirmMsg = `¿ESTAS SEGURO DE QUE QUIERES APLICAR [${action.toUpperCase()}] AL CONTENEDOR "${name.toUpperCase()}"?`;
  if (!confirm(confirmMsg)) return;

  const consoleOut = document.getElementById('console-output');
  consoleOut.innerText = `> SENDING DOCKER ${action.toUpperCase()} FOR ${name.toUpperCase()}...\n`;

  try {
    const res = await fetch('/api/actions/docker-toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, action })
    });
    
    if (res.ok) {
      consoleOut.innerText = `> DOCKER CONTAINER "${name.toUpperCase()}" ACTION [${action.toUpperCase()}] COMPLETED SUCCESSFULLY.`;
      fetchStatus();
    } else {
      const data = await res.json();
      consoleOut.innerText = `> ERROR EXEC ACTION: ${data.error || 'UNKNOWN'}`;
    }
  } catch (err) {
    consoleOut.innerText = `> SYSTEM ERROR: ${err.message}`;
  }
};

// Exec Network Diagnostics Console Command
document.getElementById('btn-run-diag').addEventListener('click', async () => {
  const command = document.getElementById('diag-cmd').value;
  const target = document.getElementById('diag-target').value;
  const consoleOut = document.getElementById('console-output');

  if (!target) {
    consoleOut.innerText = '> ERROR: SPECIFY TARGET IP/DOMAIN.';
    return;
  }

  consoleOut.innerText = `> EXECUTING ${command.toUpperCase()} ON ${target.toUpperCase()}... PLEASE WAIT.\n`;

  try {
    const res = await fetch('/api/actions/diagnose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, target })
    });
    const data = await res.json();
    consoleOut.innerText = data.output || '> ERROR: NO OUTPUT RECEIVED.';
  } catch (err) {
    consoleOut.innerText = `> DIAGNOSTIC CONNECTION ERROR: ${err.message}`;
  }
});

// Action: Restart Network
document.getElementById('btn-restart-network').addEventListener('click', async () => {
  if (!confirm('¿SEGURO QUE DESEAS REINICIAR EL PUERTO DE RED COMPARTIDO? (PUEDE HABER CORTE TEMPORAL)')) return;
  
  const consoleOut = document.getElementById('console-output');
  consoleOut.innerText = '> RESTARTING SHARED NETWORK INTERFACE...\n';
  
  try {
    const res = await fetch('/api/actions/restart-network', { method: 'POST' });
    const data = await res.json();
    consoleOut.innerText = data.output || 'Network restarted.';
    fetchStatus();
  } catch (err) {
    consoleOut.innerText = `> ERROR RESTARTING INTERFACE: ${err.message}`;
  }
});

// Action: Apply USB Fix
document.getElementById('btn-fix-usb').addEventListener('click', async () => {
  const consoleOut = document.getElementById('console-output');
  consoleOut.innerText = '> APPLYING USB AUTOSUSPEND DEACTIVATION RULES...\n';
  
  try {
    const res = await fetch('/api/actions/fix-usb', { method: 'POST' });
    const data = await res.json();
    consoleOut.innerText = data.output || 'USB fix applied.';
    fetchStatus();
  } catch (err) {
    consoleOut.innerText = `> ERROR APPLYING USB RULES: ${err.message}`;
  }
});

// Action: Logout
document.getElementById('logout-btn').addEventListener('click', async () => {
  if (!confirm('¿DESEA CERRAR LA SESION ACTUAL?')) return;
  try {
    const res = await fetch('/api/logout', { method: 'POST' });
    if (res.ok) {
      window.location.href = 'login.html';
    }
  } catch (err) {
    console.error('Logout error', err);
  }
});

// === HERMES MUSIC UPGRADER UI LOGIC ===

let upgraderInterval = null;
let upgraderLinks = [];
let allCandidates = [];
let isCheckingSequence = false;
let isDownloadingSequence = false;

function makeAsciiBar20(pct) {
  const rounded = Math.min(100, Math.max(0, parseFloat(pct) || 0));
  const blocks = Math.round(rounded / 5); // 20 blocks total
  let bar = '';
  for (let i = 0; i < 20; i++) {
    bar += i < blocks ? '█' : '░';
  }
  return `[${bar}] ${Math.round(rounded)}%`;
}

async function pollUpgraderStatus() {
  try {
    const res = await fetch('/api/upgrader/status');
    if (res.status === 401) {
      window.location.href = 'login.html';
      return;
    }
    const data = await res.json();
    
    const statusTextEl = document.getElementById('upgrader-status-text');
    if (statusTextEl) {
      statusTextEl.innerText = data.state.toUpperCase();
      if (data.state === 'scanning') {
        statusTextEl.style.color = '#ffb000';
      } else if (data.state === 'completed') {
        statusTextEl.style.color = '#00ff00';
      } else if (data.state === 'error') {
        statusTextEl.style.color = '#ff0000';
      } else {
        statusTextEl.style.color = '#ffb000';
      }
    }
    
    const barEl = document.getElementById('bar-upgrader');
    if (barEl) {
      barEl.innerText = makeAsciiBar20(data.progress);
    }
    
    const tbody = document.getElementById('upgrader-tbody');
    const copyBtn = document.getElementById('btn-copy-upgrader-links');
    const dlAllBtn = document.getElementById('btn-download-all-verified');
    
    if (tbody) {
      if (data.state === 'scanning') {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" class="sub-text" style="text-align: center; color: #ffb000;">
              [ SCANNING FILES: ${data.processedFiles} / ${data.totalFiles || '?'} ]
            </td>
          </tr>
        `;
        if (copyBtn) copyBtn.style.display = 'none';
        if (dlAllBtn) dlAllBtn.style.display = 'none';
        
        const filterInput = document.getElementById('upgrader-filter-container');
        if (filterInput) filterInput.style.display = 'none';
        
      } else if (data.state === 'completed') {
        if (upgraderInterval) {
          clearInterval(upgraderInterval);
          upgraderInterval = null;
        }
        
        const runBtn = document.getElementById('btn-run-upgrader');
        if (runBtn) {
          runBtn.disabled = false;
          runBtn.innerText = '[ SCAN LIBRARY ]';
        }
        
        allCandidates = data.results;
        upgraderLinks = data.results.filter(r => r.checked && r.qobuzUrl).map(r => r.qobuzUrl);
        
        if (allCandidates.length === 0) {
          tbody.innerHTML = `
            <tr>
              <td colspan="5" class="sub-text" style="text-align: center;">[ NO ALBUMS TO UPGRADE DETECTED. ALL LOCAL FILES ARE HI-RES OR DIRECTORY WAS EMPTY ]</td>
            </tr>
          `;
          if (copyBtn) copyBtn.style.display = 'none';
          if (dlAllBtn) dlAllBtn.style.display = 'none';
          const filterInput = document.getElementById('upgrader-filter-container');
          if (filterInput) filterInput.style.display = 'none';
        } else {
          injectFilterContainer();
          
          const filterInput = document.getElementById('upgrader-filter');
          const query = filterInput ? filterInput.value.toLowerCase() : '';
          const filtered = allCandidates.filter(c => 
            c.artist.toLowerCase().includes(query) || c.album.toLowerCase().includes(query)
          );
          
          renderCandidatesTable(filtered);
          
          if (copyBtn) {
            if (upgraderLinks.length > 0) {
              copyBtn.style.display = 'inline-block';
              copyBtn.innerText = `[ COPY ALL ${upgraderLinks.length} LINKS ]`;
              if (dlAllBtn) {
                dlAllBtn.style.display = 'inline-block';
                dlAllBtn.innerText = `[ DOWNLOAD ALL ${upgraderLinks.length} VERIFIED ]`;
              }
            } else {
              copyBtn.style.display = 'none';
              if (dlAllBtn) dlAllBtn.style.display = 'none';
            }
          }
        }
      } else if (data.state === 'error') {
        if (upgraderInterval) {
          clearInterval(upgraderInterval);
          upgraderInterval = null;
        }
        
        const runBtn = document.getElementById('btn-run-upgrader');
        if (runBtn) {
          runBtn.disabled = false;
          runBtn.innerText = '[ SCAN LIBRARY ]';
        }
        
        tbody.innerHTML = `
          <tr>
            <td colspan="5" class="sub-text" style="text-align: center; color: #ff0000;">
              [ ERROR: ${data.error ? data.error.toUpperCase() : 'UNKNOWN ERROR'} ]
            </td>
          </tr>
        `;
        if (copyBtn) copyBtn.style.display = 'none';
        if (dlAllBtn) dlAllBtn.style.display = 'none';
        const filterInput = document.getElementById('upgrader-filter-container');
        if (filterInput) filterInput.style.display = 'none';
      }
    }
  } catch (err) {
    console.error('Error fetching upgrader status', err);
  }
}

function injectFilterContainer() {
  let filterContainer = document.getElementById('upgrader-filter-container');
  if (!filterContainer) {
    filterContainer = document.createElement('div');
    filterContainer.id = 'upgrader-filter-container';
    filterContainer.className = 'input-row';
    filterContainer.style.margin = '15px 0 10px 0';
    filterContainer.innerHTML = `
      <span class="label">SEARCH FILTER:</span>
      <input type="text" id="upgrader-filter" placeholder="SEARCH ARTIST OR ALBUM..." style="flex-grow: 1; margin: 0 15px;">
      <button id="btn-check-all-filtered" class="brut-btn" style="width: auto; padding: 4px 12px; margin-right: 10px;">[ CHECK ALL FILTERED ]</button>
      <button id="btn-download-all-verified" class="brut-btn" style="width: auto; padding: 4px 12px; display: none;">[ DOWNLOAD ALL VERIFIED ]</button>
    `;
    
    const tbody = document.getElementById('upgrader-tbody');
    const table = tbody.closest('.brut-table');
    table.parentNode.insertBefore(filterContainer, table);
    
    const filterInput = document.getElementById('upgrader-filter');
    filterInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      const filtered = allCandidates.filter(c => 
        c.artist.toLowerCase().includes(query) || c.album.toLowerCase().includes(query)
      );
      renderCandidatesTable(filtered);
    });
    
    document.getElementById('btn-check-all-filtered').addEventListener('click', () => {
      checkAllFilteredSequentially();
    });
    
    document.getElementById('btn-download-all-verified').addEventListener('click', () => {
      downloadAllVerifiedSequentially();
    });
  } else {
    filterContainer.style.display = 'flex';
  }
}

function renderCandidatesTable(candidates) {
  const tbody = document.getElementById('upgrader-tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  if (candidates.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="sub-text" style="text-align: center;">[ NO ALBUMS MATCHING FILTER ]</td>
      </tr>
    `;
    return;
  }
  
  const maxRender = 100;
  const itemsToRender = candidates.slice(0, maxRender);
  
  itemsToRender.forEach(item => {
    const row = document.createElement('tr');
    
    let qualityCol = '';
    let linkCol = '';
    
    if (!item.checked) {
      qualityCol = `<span style="color: #ffb000;">PENDING</span>`;
      linkCol = `<button class="brut-btn-sm btn-check-single" onclick="checkSingleAlbum(this, '${item.artist.replace(/'/g, "\\'")}', '${item.album.replace(/'/g, "\\'")}')">[ CHECK QOBUZ ]</button>`;
    } else if (item.qobuzUrl) {
      qualityCol = `<span style="color: #00ff00;">24-BIT HI-RES</span>`;
      linkCol = `
        <a href="${item.qobuzUrl}" target="_blank" style="color: #ffb000; text-decoration: underline;">[ LINK ]</a>
        <button class="brut-btn-sm btn-download-single" onclick="downloadSingleAlbum(this, '${item.qobuzUrl.replace(/'/g, "\\'")}')" style="margin-left: 10px; color: #00ff00; border-color: #00ff00;">[ DOWNLOAD ]</button>
      `;
    } else {
      qualityCol = `<span style="color: #888;">16-BIT ONLY</span>`;
      linkCol = `<span style="color: #666;">[ NO HI-RES ]</span>`;
    }
    
    row.innerHTML = `
      <td>${item.artist.toUpperCase()}</td>
      <td>${item.album.toUpperCase()}</td>
      <td style="color: #888;">${item.currentQuality.toUpperCase()}</td>
      <td>${qualityCol}</td>
      <td style="text-align: center; width: 220px;">${linkCol}</td>
    `;
    tbody.appendChild(row);
  });
  
  if (candidates.length > maxRender) {
    const footerRow = document.createElement('tr');
    footerRow.innerHTML = `
      <td colspan="5" class="sub-text" style="text-align: center; color: #888;">
        [ DISPLAYING ${maxRender} OF ${candidates.length} CANDIDATES. USE THE SEARCH FILTER TO NARROW RESULTS ]
      </td>
    `;
    tbody.appendChild(footerRow);
  }
}

window.checkSingleAlbum = async function(buttonEl, artist, album) {
  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.innerText = '[ ... ]';
  }
  
  try {
    const url = `/api/upgrader/check-album?artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(album)}`;
    const res = await fetch(url);
    if (res.status === 401) {
      window.location.href = 'login.html';
      return;
    }
    
    const data = await res.json();
    
    const found = allCandidates.find(c => c.artist === artist && c.album === album);
    if (found) {
      found.checked = true;
      found.qobuzUrl = data.hasHiRes ? data.qobuzUrl : '';
      
      if (data.hasHiRes) {
        if (!upgraderLinks.includes(data.qobuzUrl)) {
          upgraderLinks.push(data.qobuzUrl);
        }
      }
    }
    
    const copyBtn = document.getElementById('btn-copy-upgrader-links');
    const dlAllBtn = document.getElementById('btn-download-all-verified');
    if (copyBtn) {
      if (upgraderLinks.length > 0) {
        copyBtn.style.display = 'inline-block';
        copyBtn.innerText = `[ COPY ALL ${upgraderLinks.length} LINKS ]`;
        if (dlAllBtn) {
          dlAllBtn.style.display = 'inline-block';
          dlAllBtn.innerText = `[ DOWNLOAD ALL ${upgraderLinks.length} VERIFIED ]`;
        }
      } else {
        copyBtn.style.display = 'none';
        if (dlAllBtn) dlAllBtn.style.display = 'none';
      }
    }
    
    const filterInput = document.getElementById('upgrader-filter');
    const query = filterInput ? filterInput.value.toLowerCase() : '';
    const filtered = allCandidates.filter(c => 
      c.artist.toLowerCase().includes(query) || c.album.toLowerCase().includes(query)
    );
    renderCandidatesTable(filtered);
    
  } catch (err) {
    console.error('Error checking album', err);
    if (buttonEl) {
      buttonEl.disabled = false;
      buttonEl.innerText = '[ RETRY ]';
    }
  }
};

window.checkAllFilteredSequentially = async function() {
  if (isCheckingSequence) {
    isCheckingSequence = false;
    document.getElementById('btn-check-all-filtered').innerText = '[ CHECK ALL FILTERED ]';
    return;
  }
  
  const filterInput = document.getElementById('upgrader-filter');
  const query = filterInput ? filterInput.value.toLowerCase() : '';
  const filtered = allCandidates.filter(c => 
    !c.checked && (c.artist.toLowerCase().includes(query) || c.album.toLowerCase().includes(query))
  );
  
  if (filtered.length === 0) {
    alert('NO PENDING ALBUMS FOUND IN THE CURRENT FILTER.');
    return;
  }
  
  isCheckingSequence = true;
  const actionBtn = document.getElementById('btn-check-all-filtered');
  actionBtn.innerText = '[ CANCEL SEQUENCE ]';
  actionBtn.style.color = '#ff0000';
  
  const consoleOut = document.getElementById('console-output');
  if (consoleOut) consoleOut.innerText = `> STARTING SEQUENTIAL QOBUZ VERIFICATION FOR ${filtered.length} ALBUMS...\n`;
  
  let count = 0;
  for (const item of filtered) {
    if (!isCheckingSequence) {
      if (consoleOut) consoleOut.innerText += `> SEQUENCE CANCELLED BY USER.\n`;
      break;
    }
    
    if (consoleOut) consoleOut.innerText += `> CHECKING QOBUZ FOR: ${item.artist.toUpperCase()} - ${item.album.toUpperCase()}...\n`;
    
    await checkSingleAlbum(null, item.artist, item.album);
    count++;
    
    // Esperar 1.5 segundos para evitar rate limit de Qobuz
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  
  isCheckingSequence = false;
  actionBtn.innerText = '[ CHECK ALL FILTERED ]';
  actionBtn.style.color = '#ffb000';
  if (consoleOut) consoleOut.innerText += `> SEQUENTIAL CHECK COMPLETE. PROCESSED ${count} ALBUMS.\n`;
};

window.downloadSingleAlbum = async function(buttonEl, qobuzUrl) {
  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.innerText = '[ ... ]';
    buttonEl.style.color = '#ffb000';
    buttonEl.style.borderColor = '#ffb000';
  }
  
  const consoleOut = document.getElementById('console-output');
  if (consoleOut) consoleOut.innerText = `> SENDING DOWNLOAD TO SPOTIFLAC FOR LINK: ${qobuzUrl}\n`;
  
  try {
    const res = await fetch('/api/upgrader/download-album', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qobuzUrl })
    });
    
    if (res.ok) {
      if (buttonEl) {
        buttonEl.innerText = '[ SENT ]';
        buttonEl.style.color = '#00ff00';
        buttonEl.style.borderColor = '#00ff00';
      }
      if (consoleOut) consoleOut.innerText += `> DOWNLOAD REQUEST SUCCESSFULLY RECEIVED AND INJECTED.\n`;
    } else {
      const errData = await res.json();
      if (buttonEl) {
        buttonEl.disabled = false;
        buttonEl.innerText = '[ RETRY ]';
        buttonEl.style.color = '#ff0000';
        buttonEl.style.borderColor = '#ff0000';
      }
      if (consoleOut) consoleOut.innerText += `> ERROR SENDING DOWNLOAD: ${errData.error || 'UNKNOWN'}\n`;
    }
  } catch (err) {
    console.error('Error sending download', err);
    if (buttonEl) {
      buttonEl.disabled = false;
      buttonEl.innerText = '[ RETRY ]';
      buttonEl.style.color = '#ff0000';
      buttonEl.style.borderColor = '#ff0000';
    }
    if (consoleOut) consoleOut.innerText += `> SYSTEM ERROR SENDING DOWNLOAD: ${err.message}\n`;
  }
};

window.downloadAllVerifiedSequentially = async function() {
  if (isDownloadingSequence) {
    isDownloadingSequence = false;
    document.getElementById('btn-download-all-verified').innerText = `[ DOWNLOAD ALL ${upgraderLinks.length} VERIFIED ]`;
    return;
  }
  
  if (upgraderLinks.length === 0) {
    alert('NO VERIFIED HI-RES LINKS AVAILABLE TO DOWNLOAD.');
    return;
  }
  
  isDownloadingSequence = true;
  const actionBtn = document.getElementById('btn-download-all-verified');
  actionBtn.innerText = '[ CANCEL DOWNLOADS ]';
  actionBtn.style.color = '#ff0000';
  
  const consoleOut = document.getElementById('console-output');
  if (consoleOut) consoleOut.innerText = `> INITIATING BULK SPOTIFLAC DOWNLOAD INJECTIONS FOR ${upgraderLinks.length} ALBUMS...\n`;
  
  let count = 0;
  for (const url of upgraderLinks) {
    if (!isDownloadingSequence) {
      if (consoleOut) consoleOut.innerText += `> DOWNLOAD SEQUENCE CANCELLED BY USER.\n`;
      break;
    }
    
    if (consoleOut) consoleOut.innerText += `> INJECTING LINK [${count + 1}/${upgraderLinks.length}] INTO SPOTIFLAC...\n`;
    
    let btnEl = null;
    const buttons = document.querySelectorAll('.btn-download-single');
    for (const btn of buttons) {
      if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(url)) {
        btnEl = btn;
        break;
      }
    }
    
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.innerText = '[ ... ]';
      btnEl.style.color = '#ffb000';
      btnEl.style.borderColor = '#ffb000';
    }
    
    const success = await fetch('/api/upgrader/download-album', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qobuzUrl: url })
    }).then(res => {
      if (res.ok) {
        if (btnEl) {
          btnEl.innerText = '[ SENT ]';
          btnEl.style.color = '#00ff00';
          btnEl.style.borderColor = '#00ff00';
        }
        return true;
      }
      return false;
    }).catch(() => false);
    
    if (success) count++;
    
    // Esperar 2 segundos para dar tiempo holgado
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  isDownloadingSequence = false;
  actionBtn.innerText = `[ DOWNLOAD ALL ${upgraderLinks.length} VERIFIED ]`;
  actionBtn.style.color = '#ffb000';
  if (consoleOut) consoleOut.innerText += `> BULK DOWNLOAD INJECTION COMPLETE. INJECTED ${count} ALBUMS.\n`;
};

// Event listener to trigger scanning
const runUpgraderBtn = document.getElementById('btn-run-upgrader');
if (runUpgraderBtn) {
  runUpgraderBtn.addEventListener('click', async () => {
    const pathInput = document.getElementById('upgrader-path');
    const pathVal = pathInput ? pathInput.value : '';
    const consoleOut = document.getElementById('console-output');
    
    if (!pathVal) {
      if (consoleOut) consoleOut.innerText = '> ERROR: SPECIFY A VALID MUSIC PATH.';
      return;
    }
    
    if (consoleOut) consoleOut.innerText = `> STARTING HERMES UPGRADER ON: ${pathVal.toUpperCase()}...\n`;
    runUpgraderBtn.disabled = true;
    runUpgraderBtn.innerText = '[ SCANNING... ]';
    
    try {
      const res = await fetch('/api/upgrader/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pathVal })
      });
      
      if (res.ok) {
        if (consoleOut) consoleOut.innerText += `> UPGRADER SCAN STARTED IN BACKGROUND.\n`;
        if (upgraderInterval) clearInterval(upgraderInterval);
        upgraderInterval = setInterval(pollUpgraderStatus, 2000);
        pollUpgraderStatus();
      } else {
        const errData = await res.json();
        let errMsg = errData.error || 'UNKNOWN';
        if (errMsg === 'DIRECTORY_NOT_FOUND') {
          errMsg = 'DIRECTORY NOT FOUND OR UNREADABLE ON HOST.';
        }
        if (consoleOut) consoleOut.innerText += `> ERROR STARTING SCAN: ${errMsg}\n`;
        runUpgraderBtn.disabled = false;
        runUpgraderBtn.innerText = '[ SCAN LIBRARY ]';
      }
    } catch (err) {
      if (consoleOut) consoleOut.innerText += `> SYSTEM ERROR: ${err.message}\n`;
      runUpgraderBtn.disabled = false;
      runUpgraderBtn.innerText = '[ SCAN LIBRARY ]';
    }
  });
}

// Event listener to copy links
const copyUpgraderLinksBtn = document.getElementById('btn-copy-upgrader-links');
if (copyUpgraderLinksBtn) {
  copyUpgraderLinksBtn.addEventListener('click', () => {
    const consoleOut = document.getElementById('console-output');
    if (upgraderLinks.length === 0) {
      if (consoleOut) consoleOut.innerText = `> NO LINKS TO COPY.\n`;
      return;
    }
    
    const textToCopy = upgraderLinks.join('\n');
    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        if (consoleOut) {
          consoleOut.innerText = `> SUCCESSFULLY COPIED ${upgraderLinks.length} QOBUZ LINKS TO CLIPBOARD.\n`;
          consoleOut.innerText += `> READY TO PASTE INTO SPOTIFLAC DOWNLOAD BAR.\n`;
        }
      })
      .catch(err => {
        if (consoleOut) {
          consoleOut.innerText = `> FAILED TO COPY LINKS: ${err.message}\n`;
          consoleOut.innerText += `> MANUAL LIST:\n${textToCopy}\n`;
        }
      });
  });
}

// Check if scan in progress on initial load
async function checkUpgraderOnLoad() {
  try {
    const res = await fetch('/api/upgrader/status');
    if (res.ok) {
      const data = await res.json();
      if (data.state === 'scanning') {
        const runBtn = document.getElementById('btn-run-upgrader');
        if (runBtn) {
          runBtn.disabled = true;
          runBtn.innerText = '[ SCANNING... ]';
        }
        upgraderInterval = setInterval(pollUpgraderStatus, 2000);
        pollUpgraderStatus();
      } else if (data.state === 'completed' && data.results.length > 0) {
        pollUpgraderStatus();
      }
    }
  } catch (err) {
    console.error('Error checking initial upgrader status', err);
  }
}

// Initial load & Setup polling
fetchStatus();
setInterval(fetchStatus, 3000);
checkUpgraderOnLoad();

/* --- DLNA MEDIA CASTING LOGIC --- */

const dlnaSelect = document.getElementById('dlna-device-select');
const dlnaScanBtn = document.getElementById('btn-scan-dlna');
const dlnaCastBtn = document.getElementById('btn-cast-dlna');
const dlnaUrlInput = document.getElementById('dlna-video-url');
const dlnaStatusText = document.getElementById('dlna-status-text');

const dlnaPlayBtn = document.getElementById('btn-dlna-play');
const dlnaPauseBtn = document.getElementById('btn-dlna-pause');
const dlnaStopBtn = document.getElementById('btn-dlna-stop');

async function updateDlnaDevices() {
  try {
    const res = await fetch('/api/dlna/devices');
    if (!res.ok) throw new Error('Failed to get DLNA devices');
    
    const devices = await res.json();
    if (!dlnaSelect) return;
    dlnaSelect.innerHTML = '';
    
    if (devices.length === 0) {
      dlnaSelect.innerHTML = '<option value="">[ NO DEVICES DETECTED - CLICK SCAN ]</option>';
      return;
    }
    
    devices.forEach(dev => {
      const opt = document.createElement('option');
      opt.value = dev.controlUrl;
      opt.innerText = `${dev.name} (${dev.ip})`;
      dlnaSelect.appendChild(opt);
    });
  } catch (err) {
    console.error('Error fetching DLNA devices:', err);
  }
}

if (dlnaScanBtn) {
  dlnaScanBtn.addEventListener('click', async () => {
    const consoleOut = document.getElementById('console-output');
    dlnaScanBtn.disabled = true;
    dlnaScanBtn.innerText = '[ SCANNING... ]';
    if (consoleOut) consoleOut.innerText = `> STARTING DLNA NETWORK SCAN (SSDP)...\n`;
    dlnaStatusText.innerText = 'SCANNING NETWORK...';
    
    try {
      await fetch('/api/dlna/scan', { method: 'POST' });
      // Pollear dispositivos después de 2 y 4 segundos para ir actualizando
      setTimeout(async () => {
        await updateDlnaDevices();
      }, 2000);
      
      setTimeout(async () => {
        await updateDlnaDevices();
        dlnaScanBtn.disabled = false;
        dlnaScanBtn.innerText = '[ SCAN DEVICES ]';
        dlnaStatusText.innerText = 'SCAN COMPLETED';
        if (consoleOut) consoleOut.innerText += `> DLNA NETWORK SCAN COMPLETED.\n`;
      }, 4000);
      
    } catch (err) {
      dlnaScanBtn.disabled = false;
      dlnaScanBtn.innerText = '[ SCAN DEVICES ]';
      dlnaStatusText.innerText = 'ERROR SCANNING';
      if (consoleOut) consoleOut.innerText += `> DLNA SCAN ERROR: ${err.message}\n`;
    }
  });
}

if (dlnaCastBtn) {
  dlnaCastBtn.addEventListener('click', async () => {
    const controlUrl = dlnaSelect.value;
    const videoUrl = dlnaUrlInput.value.trim();
    const consoleOut = document.getElementById('console-output');
    
    if (!controlUrl) {
      alert('SELECCIONA UN DISPOSITIVO DLNA/TV DE LA LISTA.');
      return;
    }
    if (!videoUrl) {
      alert('INGRESA UNA URL DE VIDEO VÁLIDA.');
      return;
    }
    
    dlnaCastBtn.disabled = true;
    dlnaCastBtn.innerText = '[ PROCESSING... ]';
    
    let finalUrl = videoUrl;
    
    try {
      // Evaluar si la URL es un flujo directo de video
      const isDirect = videoUrl.toLowerCase().includes('.mp4') || 
                       videoUrl.toLowerCase().includes('.m3u8') || 
                       videoUrl.toLowerCase().includes('.mkv');
                       
      if (!isDirect) {
        dlnaStatusText.innerText = 'RESOLVING WEBPAGE...';
        if (consoleOut) consoleOut.innerText = `> SNIFFING WEB PAGE: ${videoUrl}\n`;
        
        const sniffRes = await fetch('/api/dlna/sniff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pageUrl: videoUrl })
        });
        
        const sniffData = await sniffRes.json();
        if (!sniffRes.ok || !sniffData.success) {
          throw new Error(sniffData.error || 'No video stream found on webpage');
        }
        
        finalUrl = sniffData.videoUrl;
        if (consoleOut) consoleOut.innerText += `> SNIFFER DETECTED: ${finalUrl}\n`;
      }
      
      dlnaCastBtn.innerText = '[ CASTING... ]';
      dlnaStatusText.innerText = 'SENDING TO TV...';
      if (consoleOut) consoleOut.innerText += `> TRANSMITTING STREAM TO DLNA TV...\n`;
      
      const res = await fetch('/api/dlna/cast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ controlUrl, videoUrl: finalUrl })
      });
      
      const data = await res.json();
      dlnaCastBtn.disabled = false;
      dlnaCastBtn.innerText = '[ CAST TO TV ]';
      
      if (res.ok && data.success) {
        dlnaStatusText.innerText = 'PLAYING';
        if (consoleOut) consoleOut.innerText += `> CAST SUCCESSFUL. TV SHOULD BE PLAYING.\n`;
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (err) {
      dlnaCastBtn.disabled = false;
      dlnaCastBtn.innerText = '[ CAST TO TV ]';
      dlnaStatusText.innerText = 'CAST ERROR';
      if (consoleOut) consoleOut.innerText += `> ERROR: ${err.message}\n`;
    }
  });
}

async function sendDlnaControl(action) {
  const controlUrl = dlnaSelect.value;
  const consoleOut = document.getElementById('console-output');
  if (!controlUrl) return;
  
  dlnaStatusText.innerText = `SENDING ${action.toUpperCase()}...`;
  try {
    const res = await fetch('/api/dlna/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ controlUrl, action })
    });
    
    const data = await res.json();
    if (res.ok && data.success) {
      dlnaStatusText.innerText = action === 'Stop' ? 'STOPPED' : action === 'Pause' ? 'PAUSED' : 'PLAYING';
      if (consoleOut) consoleOut.innerText += `> DLNA CONTROL SUCCESS: ${action.toUpperCase()}\n`;
    } else {
      throw new Error(data.error || 'Unknown error');
    }
  } catch (err) {
    dlnaStatusText.innerText = 'CONTROL ERROR';
    if (consoleOut) consoleOut.innerText += `> DLNA CONTROL ERROR: ${err.message}\n`;
  }
}

if (dlnaPlayBtn) dlnaPlayBtn.addEventListener('click', () => sendDlnaControl('Play'));
if (dlnaPauseBtn) dlnaPauseBtn.addEventListener('click', () => sendDlnaControl('Pause'));
if (dlnaStopBtn) dlnaStopBtn.addEventListener('click', () => sendDlnaControl('Stop'));

// === IPTV LOGIC AND INTERACTIVE CHANNELS ===

async function loadIptvPlaylist(url) {
  const tbody = document.getElementById('iptv-tbody');
  const consoleOut = document.getElementById('console-output');
  
  if (consoleOut) consoleOut.innerText = `> LOADING IPTV PLAYLIST FROM: ${url}...\n`;
  tbody.innerHTML = `<tr><td colspan="4" class="sub-text" style="text-align: center; color: #ffb000;">[ DOWNLOADING & PARSING PLAYLIST... ]</td></tr>`;
  
  try {
    const res = await fetch('/api/iptv/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to load playlist');
    }
    
    loadedChannels = data.channels || [];
    if (consoleOut) consoleOut.innerText += `> IPTV PLAYLIST LOADED SUCCESSFULLY. ${loadedChannels.length} CHANNELS FOUND.\n`;
    
    // Rellenar grupos en el selector
    const groups = Array.from(new Set(loadedChannels.map(c => c.group))).sort();
    const select = document.getElementById('iptv-group-select');
    select.innerHTML = '<option value="">[ ALL GROUPS ]</option>';
    groups.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g;
      opt.innerText = g.toUpperCase();
      select.appendChild(opt);
    });
    
    filterAndRenderChannels();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="sub-text" style="text-align: center; color: #E61919;">[ ERROR LOADING PLAYLIST: ${err.message.toUpperCase()} ]</td></tr>`;
    if (consoleOut) consoleOut.innerText += `> IPTV LOAD ERROR: ${err.message}\n`;
  }
}

async function saveAndLoadIptv() {
  const url = document.getElementById('iptv-playlist-url').value.trim();
  if (!url) {
    alert('INGRESA UNA URL DE LISTA IPTV VALIDA.');
    return;
  }
  
  const consoleOut = document.getElementById('console-output');
  if (consoleOut) consoleOut.innerText = `> PERSISTING IPTV URL TO CONFIG.JSON...\n`;
  
  try {
    const res = await fetch('/api/iptv/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to save playlist URL');
    }
    
    if (consoleOut) consoleOut.innerText += `> URL PERSISTED SUCCESSFULLY.\n`;
    loadIptvPlaylist(url);
  } catch (err) {
    if (consoleOut) consoleOut.innerText += `> SAVE CONFIG ERROR: ${err.message}\n`;
    // Intentar cargar de todos modos
    loadIptvPlaylist(url);
  }
}

function filterAndRenderChannels() {
  const searchVal = document.getElementById('iptv-search').value.toLowerCase();
  const groupVal = document.getElementById('iptv-group-select').value;
  
  filteredChannels = loadedChannels.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchVal);
    const matchesGroup = !groupVal || c.group === groupVal;
    return matchesSearch && matchesGroup;
  });
  
  const tbody = document.getElementById('iptv-tbody');
  tbody.innerHTML = '';
  
  if (filteredChannels.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="sub-text" style="text-align: center;">[ NO CHANNELS MATCH FILTER ]</td></tr>`;
    return;
  }
  
  filteredChannels.forEach((chan, idx) => {
    const tr = document.createElement('tr');
    
    // Logo o fallback
    let logoHtml = '';
    if (chan.logo) {
      logoHtml = `<img src="${chan.logo}" class="iptv-logo" alt="LOGO" onerror="this.outerHTML='[TV]'">`;
    } else {
      logoHtml = '[TV]';
    }
    
    tr.innerHTML = `
      <td style="text-align: center; vertical-align: middle;">${logoHtml}</td>
      <td style="font-weight: bold; vertical-align: middle;">${chan.name}</td>
      <td style="vertical-align: middle;">${chan.group}</td>
      <td style="text-align: center; vertical-align: middle;">
        <button onclick="castIptvChannel(${idx})" class="brut-btn-sm">[ CAST ]</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function castIptvChannel(index) {
  if (index < 0 || index >= filteredChannels.length) return;
  
  const controlUrl = document.getElementById('dlna-device-select').value;
  if (!controlUrl) {
    alert('SELECCIONA UN DISPOSITIVO DLNA/TV DE LA LISTA EN EL PANEL CAST.');
    return;
  }
  
  currentChannelIndex = index;
  const chan = filteredChannels[index];
  const consoleOut = document.getElementById('console-output');
  const castStatus = document.getElementById('iptv-status-text');
  
  if (consoleOut) consoleOut.innerText = `> CASTING IPTV CHANNEL: ${chan.name.toUpperCase()}...\n`;
  castStatus.innerText = `CASTING: ${chan.name.toUpperCase()}`;
  
  try {
    const res = await fetch('/api/dlna/cast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ controlUrl, videoUrl: chan.url })
    });
    
    const data = await res.json();
    if (res.ok && data.success) {
      castStatus.innerText = `PLAYING: ${chan.name.toUpperCase()}`;
      if (consoleOut) consoleOut.innerText += `> CAST SUCCESSFUL. TV SHOULD PLAY "${chan.name.toUpperCase()}".\n`;
      
      // Habilitar / Deshabilitar botones de control remoto
      document.getElementById('btn-iptv-prev').disabled = false;
      document.getElementById('btn-iptv-next').disabled = false;
    } else {
      throw new Error(data.error || 'Unknown error');
    }
  } catch (err) {
    castStatus.innerText = `ERROR CASTING: ${chan.name.toUpperCase()}`;
    if (consoleOut) consoleOut.innerText += `> CAST ERROR: ${err.message}\n`;
  }
}

// Bindings globales para onclick en las filas
window.castIptvChannel = castIptvChannel;

// Setup listeners para IPTV
const btnLoadIptv = document.getElementById('btn-load-iptv');
if (btnLoadIptv) {
  btnLoadIptv.addEventListener('click', saveAndLoadIptv);
}

const iptvSearch = document.getElementById('iptv-search');
if (iptvSearch) {
  iptvSearch.addEventListener('input', filterAndRenderChannels);
}

const iptvGroupSelect = document.getElementById('iptv-group-select');
if (iptvGroupSelect) {
  iptvGroupSelect.addEventListener('change', filterAndRenderChannels);
}

const btnIptvPrev = document.getElementById('btn-iptv-prev');
if (btnIptvPrev) {
  btnIptvPrev.addEventListener('click', () => {
    if (currentChannelIndex > 0) {
      castIptvChannel(currentChannelIndex - 1);
    } else if (filteredChannels.length > 0) {
      castIptvChannel(filteredChannels.length - 1);
    }
  });
}

const btnIptvNext = document.getElementById('btn-iptv-next');
if (btnIptvNext) {
  btnIptvNext.addEventListener('click', () => {
    if (currentChannelIndex < filteredChannels.length - 1) {
      castIptvChannel(currentChannelIndex + 1);
    } else if (filteredChannels.length > 0) {
      castIptvChannel(0);
    }
  });
}

// Cargar dispositivos DLNA detectados al inicio
updateDlnaDevices();

