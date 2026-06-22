const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cookieParser('sat_nas_secret_key_12345')); // Firmar cookies

// Cargar configuracion
const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Middleware de autenticacion
function requireAuth(req, res, next) {
  const { session_token } = req.signedCookies;
  if (session_token && session_token === 'active_admin_session') {
    return next();
  }
  res.status(401).json({ error: 'UNAUTHORIZED' });
}

// API Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === config.username && password === config.password_hash) {
    res.cookie('session_token', 'active_admin_session', { signed: true, httpOnly: true });
    return res.json({ success: true });
  }
  res.status(400).json({ error: 'INVALID_CREDENTIALS' });
});

// API Logout
app.post('/api/logout', (req, res) => {
  res.clearCookie('session_token');
  res.json({ success: true });
});

const isLinux = process.platform === 'linux';
const { execSync } = require('child_process');

function runCmd(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 3000 }).trim();
  } catch (e) {
    return '';
  }
}

app.get('/api/status', requireAuth, (req, res) => {
  if (!isLinux) {
    // Retornar datos simulados para tests en Windows
    return res.json({
      uptime: 'up 2 hours, 15 minutes',
      internet: { status: 'OK' },
      interfaces: {
        usb: { name: 'enx0a2f530b6e65', status: 'ACTIVE', ip: '10.42.0.12' },
        ethernet: { name: 'enp0s31f6', status: 'ACTIVE', ip: '10.42.0.1' }
      },
      resources: {
        cpu_usage_pct: 12.5,
        ram_used_mb: 2048,
        ram_total_mb: 16065
      },
      disks: [
        { mount: '/', used_gb: '45G', total_gb: '447G', percentage: 10 },
        { mount: '/mnt/disco_1tb', used_gb: '200G', total_gb: '931G', percentage: 21 },
        { mount: '/mnt/NAS_STORAGE', used_gb: '800G', total_gb: '1.8T', percentage: 44 },
        { mount: '/mnt/disco_4tb', used_gb: '1.2T', total_gb: '3.6T', percentage: 33 }
      ],
      docker: [
        { name: 'adguardhome', status: 'running' },
        { name: 'casaos', status: 'running' },
        { name: 'tailscale', status: 'exited' }
      ]
    });
  }

  // Si es Linux, recolectamos datos reales
  try {
    const uptime = runCmd('uptime -p') || 'unknown';

    let internetStatus = 'DOWN';
    try {
      execSync('curl -s -I --connect-timeout 2 https://www.google.com', { stdio: 'ignore' });
      internetStatus = 'OK';
    } catch (e) {}

    const ipAddrOut = runCmd('ip addr show dev enx0a2f530b6e65') || '';
    const usbActive = ipAddrOut.includes('state UP') || ipAddrOut.includes('lowerup');
    let usbIp = 'none';
    const ipMatch = ipAddrOut.match(/inet\s+([0-9.]+)/);
    if (ipMatch) usbIp = ipMatch[1];

    const freeOut = runCmd('free -m') || '';
    let ramUsed = 0, ramTotal = 16000;
    const lines = freeOut.split('\n');
    if (lines.length > 1) {
      const parts = lines[1].replace(/\s+/g, ' ').split(' ');
      ramTotal = parseInt(parts[1]) || 16000;
      ramUsed = parseInt(parts[2]) || 0;
    }
    
    // Obtener uso de CPU. Si falla o no se puede parsear, usar top/loadavg o similar.
    let cpuUsage = 0;
    try {
      const cpuOut = runCmd("top -bn1 | grep 'Cpu(s)' | sed 's/.*, *\\([0-9.]*\\)%* id.*/\\1/' | awk '{print 100 - $1}'");
      cpuUsage = parseFloat(cpuOut) || 0;
    } catch (e) {}

    const dfOut = runCmd("df -h") || '';
    const diskList = [];
    dfOut.split('\n').forEach(line => {
      if (!line) return;
      const parts = line.replace(/\s+/g, ' ').split(' ');
      if (parts.length >= 6) {
        const mount = parts[5];
        if (['/', '/mnt/disco_1tb', '/mnt/NAS_STORAGE', '/mnt/disco_4tb'].includes(mount)) {
          diskList.push({
            mount: mount,
            used_gb: parts[2],
            total_gb: parts[1],
            percentage: parseInt(parts[4].replace('%', '')) || 0
          });
        }
      }
    });

    // Si algun disco no esta en dfOut (por ejemplo no montado todavia), podemos listarlo con valor por defecto
    const expectedMounts = ['/', '/mnt/disco_1tb', '/mnt/NAS_STORAGE', '/mnt/disco_4tb'];
    expectedMounts.forEach(m => {
      if (!diskList.some(d => d.mount === m)) {
        diskList.push({ mount: m, used_gb: '0G', total_gb: '0G', percentage: 0 });
      }
    });

    const dockerOut = runCmd("sudo docker ps -a --format '{{.Names}}|{{.State}}'") || '';
    const dockerList = [];
    dockerOut.split('\n').forEach(line => {
      if (!line) return;
      const [name, state] = line.split('|');
      if (name && state) {
        dockerList.push({ name, status: state });
      }
    });

    res.json({
      uptime,
      internet: { status: internetStatus },
      interfaces: {
        usb: { name: 'enx0a2f530b6e65', status: usbActive ? 'ACTIVE' : 'OFFLINE', ip: usbIp },
        ethernet: { name: 'enp0s31f6', status: 'ACTIVE', ip: '10.42.0.1' }
      },
      resources: {
        cpu_usage_pct: cpuUsage,
        ram_used_mb: ramUsed,
        ram_total_mb: ramTotal
      },
      disks: diskList,
      docker: dockerList
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const { exec } = require('child_process');

// Accion: Reiniciar Red
app.post('/api/actions/restart-network', requireAuth, (req, res) => {
  if (!isLinux) {
    return res.json({ success: true, output: 'SIMULATED: Network restarted connection "Perfil 1"' });
  }
  exec('sudo nmcli connection up "Perfil 1"', (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: stderr || err.message });
    res.json({ success: true, output: stdout || 'Network connection Perfil 1 activated.' });
  });
});

// Accion: Corregir Ahorro de Energia USB (Autosuspend)
app.post('/api/actions/fix-usb', requireAuth, (req, res) => {
  if (!isLinux) {
    return res.json({ success: true, output: 'SIMULATED: USB autosuspend set to -1, control set to on' });
  }
  const cmd = `echo -1 | sudo tee /sys/module/usbcore/parameters/autosuspend && for f in /sys/bus/usb/devices/*/power/control; do echo on | sudo tee $f; done && sudo udevadm control --reload-rules && sudo udevadm trigger`;
  exec(cmd, (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: stderr || err.message });
    res.json({ success: true, output: 'USB fix applied successfully' });
  });
});

// Accion: Alternar estado de Contenedor Docker
app.post('/api/actions/docker-toggle', requireAuth, (req, res) => {
  const { name, action } = req.body;
  if (!name || !['start', 'stop'].includes(action)) {
    return res.status(400).json({ error: 'INVALID_PARAMETERS' });
  }
  if (!isLinux) {
    return res.json({ success: true });
  }
  const cmd = `sudo docker ${action} ${name}`;
  exec(cmd, (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: stderr || err.message });
    res.json({ success: true });
  });
});

// Accion: Diagnosticos de Red (Ping, NSLookup, Traceroute)
app.post('/api/actions/diagnose', requireAuth, (req, res) => {
  const { command, target } = req.body;
  if (!['ping', 'nslookup', 'traceroute'].includes(command) || !target) {
    return res.status(400).json({ error: 'INVALID_PARAMETERS' });
  }

  const safeTarget = target.replace(/[^a-zA-Z0-9.-]/g, '');
  let shellCmd = '';
  if (command === 'ping') {
    shellCmd = isLinux ? `ping -c 4 ${safeTarget}` : `ping -n 4 ${safeTarget}`;
  } else if (command === 'nslookup') {
    shellCmd = `nslookup ${safeTarget}`;
  } else if (command === 'traceroute') {
    shellCmd = isLinux ? `traceroute -m 15 ${safeTarget}` : `tracert -h 15 ${safeTarget}`;
  }

  exec(shellCmd, { timeout: 15000 }, (err, stdout, stderr) => {
    res.json({ output: stdout + (stderr ? '\n' + stderr : '') });
  });
});

if (require.main === module) {
  app.listen(8090, () => console.log('Server active on port 8090'));
} else {
  module.exports = app; // Para tests
}
