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

// Initial load & Setup polling
fetchStatus();
setInterval(fetchStatus, 3000);
