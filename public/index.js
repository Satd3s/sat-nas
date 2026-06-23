/* --- DASHBOARD LOGIC: SAT_NAS TELEMETRY --- */

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
        
        upgraderLinks = data.results.map(r => r.qobuzUrl);
        
        if (data.results.length === 0) {
          tbody.innerHTML = `
            <tr>
              <td colspan="5" class="sub-text" style="text-align: center;">[ NO UPGRADES DETECTED. ALL ALBUMS ARE 24-BIT OR NOT FOUND ON QOBUZ ]</td>
            </tr>
          `;
          if (copyBtn) copyBtn.style.display = 'none';
        } else {
          tbody.innerHTML = '';
          data.results.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
              <td>${item.artist.toUpperCase()}</td>
              <td>${item.album.toUpperCase()}</td>
              <td style="color: #888;">${item.currentQuality.toUpperCase()}</td>
              <td style="color: #00ff00;">${item.newQuality.toUpperCase()}</td>
              <td><a href="${item.qobuzUrl}" target="_blank" style="color: #ffb000; text-decoration: underline;">[ LINK ]</a></td>
            `;
            tbody.appendChild(row);
          });
          if (copyBtn) copyBtn.style.display = 'inline-block';
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
      }
    }
  } catch (err) {
    console.error('Error fetching upgrader status', err);
  }
}

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
