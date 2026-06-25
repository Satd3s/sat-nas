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
      ],
      iptv_url: config.iptv_url || ''
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
      docker: dockerList,
      iptv_url: config.iptv_url || ''
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Guardar URL de lista IPTV
app.post('/api/iptv/save', requireAuth, (req, res) => {
  const { url } = req.body;
  if (url === undefined) {
    return res.status(400).json({ error: 'MISSING_PLAYLIST_URL' });
  }
  try {
    config.iptv_url = url;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    res.json({ success: true, iptv_url: config.iptv_url });
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

// Redireccionar al login si no tiene sesion
app.get(['/', '/index.html'], (req, res, next) => {
  const { session_token } = req.signedCookies;
  if (session_token && session_token === 'active_admin_session') {
    return next();
  }
  res.redirect('/login.html');
});

// Servir archivos estaticos
app.use(express.static(path.join(__dirname, 'public')));

// === HERMES MUSIC UPGRADER BACKEND LOGIC ===

let upgraderStatus = {
  state: 'idle', // 'idle' | 'scanning' | 'completed' | 'error'
  progress: 0,
  processedFiles: 0,
  totalFiles: 0,
  error: null,
  results: []
};

// Función para buscar recursivamente todos los archivos de audio
function getAllAudioFiles(dirPath, arrayOfFiles = []) {
  try {
    const files = fs.readdirSync(dirPath);
    files.forEach(file => {
      const fullPath = path.join(dirPath, file);
      try {
        if (fs.statSync(fullPath).isDirectory()) {
          arrayOfFiles = getAllAudioFiles(fullPath, arrayOfFiles);
        } else {
          const ext = path.extname(file).toLowerCase();
          if (['.flac', '.mp3', '.m4a', '.wav'].includes(ext)) {
            arrayOfFiles.push(fullPath);
          }
        }
      } catch (statErr) {
        // Ignorar directorios sin permisos
      }
    });
  } catch (err) {
    console.error(`Error leyendo directorio ${dirPath}:`, err);
  }
  return arrayOfFiles;
}

// Obtener metadatos de manera asíncrona mediante mediainfo (disponible nativo en el T30)
function getAudioMetadataAsync(filePath) {
  return new Promise((resolve) => {
    const escapedPath = filePath.replace(/'/g, "'\\''");
    require('child_process').exec(`mediainfo --Output=JSON '${escapedPath}'`, { timeout: 5000 }, (err, stdout, stderr) => {
      if (err) {
        console.error(`Error leyendo metadatos de ${filePath}:`, err.message);
        return resolve(null);
      }
      try {
        const data = JSON.parse(stdout.trim());
        const tracks = data.media && data.media.track ? data.media.track : [];
        const general = tracks.find(t => t['@type'] === 'General') || {};
        const audio = tracks.find(t => t['@type'] === 'Audio') || {};
        
        const artist = general.Performer || general.Album_Performer || 'Unknown Artist';
        const album = general.Album || 'Unknown Album';
        const title = general.Title || 'Unknown Title';
        const bitDepth = parseInt(audio.BitDepth) || 16;
        
        resolve({
          artist: artist ? artist.trim() : 'Unknown Artist',
          album: album ? album.trim() : 'Unknown Album',
          title: title ? title.trim() : 'Unknown Title',
          bitDepth,
          isHiRes: bitDepth >= 24,
          ext: path.extname(filePath).toLowerCase()
        });
      } catch (parseErr) {
        console.error(`Error parseando metadatos de ${filePath}:`, parseErr.message);
        resolve(null);
      }
    });
  });
}

// Consultar la disponibilidad de versión Hi-Res de un álbum en Qobuz público
async function checkQobuzHiRes(artist, album) {
  const query = `${artist} ${album}`;
  const url = `https://www.qobuz.com/es-es/search?q=${encodeURIComponent(query)}&type=albums`;
  
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
      },
      signal: AbortSignal.timeout(5000)
    });
    
    if (!res.ok) return null;
    const html = await res.text();
    
    const hasHiRes = html.includes('hasHiresLogo":true') || html.includes('24-Bit');
    if (!hasHiRes) return null;
    
    // Extraer enlace público del álbum de Qobuz del HTML
    const regex = /\/es-es\/album\/[a-z0-9-]+\/[a-z0-9]+/gi;
    const match = html.match(regex);
    if (match && match.length > 0) {
      return `https://www.qobuz.com${match[0]}`;
    }
    
    return `https://www.qobuz.com/es-es/search?q=${encodeURIComponent(query)}&type=albums`;
  } catch (err) {
    console.error(`Error buscando en Qobuz para ${query}:`, err.message);
    return null;
  }
}

// Orquestador del escáner en segundo plano (Asíncrono y Concurrente)
async function runUpgraderScanner(targetPath) {
  try {
    upgraderStatus.state = 'scanning';
    upgraderStatus.progress = 0;
    upgraderStatus.processedFiles = 0;
    upgraderStatus.results = [];
    upgraderStatus.error = null;
    
    console.log(`>>> Upgrader: Escaneando ${targetPath}...`);
    const files = getAllAudioFiles(targetPath);
    upgraderStatus.totalFiles = files.length;
    
    if (files.length === 0) {
      upgraderStatus.state = 'completed';
      upgraderStatus.progress = 100;
      return;
    }
    
    const albumsMap = new Map();
    const concurrencyLimit = 15; // Procesar hasta 15 archivos en paralelo
    let index = 0;
    
    async function worker() {
      while (index < files.length) {
        const fileIndex = index++;
        const file = files[fileIndex];
        
        const meta = await getAudioMetadataAsync(file);
        
        upgraderStatus.processedFiles++;
        upgraderStatus.progress = Math.round((upgraderStatus.processedFiles / files.length) * 100);
        
        if (meta && meta.artist && meta.album) {
          const key = `${meta.artist.toLowerCase()}|||${meta.album.toLowerCase()}`;
          if (!albumsMap.has(key)) {
            albumsMap.set(key, {
              artist: meta.artist,
              album: meta.album,
              hasHiResLocal: false,
              currentQuality: meta.ext === '.flac' ? `${meta.bitDepth}-Bit FLAC` : meta.ext.substring(1).toUpperCase()
            });
          }
          
          if (meta.isHiRes) {
            albumsMap.get(key).hasHiResLocal = true;
          }
        }
      }
    }
    
    const workers = [];
    for (let w = 0; w < Math.min(concurrencyLimit, files.length); w++) {
      workers.push(worker());
    }
    
    await Promise.all(workers);
    
    // Filtrar los que no son Hi-Res a nivel local y guardarlos como candidatos
    const albumsToCheck = [];
    for (const album of albumsMap.values()) {
      if (!album.hasHiResLocal) {
        albumsToCheck.push({
          artist: album.artist,
          album: album.album,
          currentQuality: album.currentQuality,
          newQuality: '24-Bit Hi-Res',
          qobuzUrl: null,
          checked: false
        });
      }
    }
    
    console.log(`>>> Upgrader: ${albumsMap.size} álbumes únicos detectados. ${albumsToCheck.length} requieren consulta.`);
    
    upgraderStatus.results = albumsToCheck;
    upgraderStatus.state = 'completed';
    upgraderStatus.progress = 100;
    console.log(`>>> Upgrader: Completado escaneo local. ${upgraderStatus.results.length} álbumes listos para comprobación en Qobuz.`);
  } catch (err) {
    console.error('Error en el escáner de Upgrader:', err);
    upgraderStatus.state = 'error';
    upgraderStatus.error = err.message;
    upgraderStatus.progress = 100;
  }
}

// Endpoints APIs
app.post('/api/upgrader/scan', requireAuth, (req, res) => {
  const { path: targetPath } = req.body;
  const resolvedPath = targetPath ? targetPath.trim() : '/mnt/disco_1tb/flac 24';
  
  if (!fs.existsSync(resolvedPath)) {
    return res.status(400).json({ error: 'DIRECTORY_NOT_FOUND' });
  }
  
  if (upgraderStatus.state === 'scanning') {
    return res.json({ success: true, message: 'Scan already in progress' });
  }
  
  runUpgraderScanner(resolvedPath);
  res.json({ success: true, message: 'Scan started' });
});

app.get('/api/upgrader/status', requireAuth, (req, res) => {
  res.json(upgraderStatus);
});

app.get('/api/upgrader/check-album', requireAuth, async (req, res) => {
  const { artist, album } = req.query;
  if (!artist || !album) {
    return res.status(400).json({ error: 'MISSING_PARAMS' });
  }
  
  const qobuzUrl = await checkQobuzHiRes(artist, album);
  const cleanArtist = artist.trim().toLowerCase();
  const cleanAlbum = album.trim().toLowerCase();
  
  const found = upgraderStatus.results.find(r => r.artist.trim().toLowerCase() === cleanArtist && r.album.trim().toLowerCase() === cleanAlbum);
  
  if (qobuzUrl) {
    if (found) {
      found.qobuzUrl = qobuzUrl;
      found.checked = true;
    }
    return res.json({ hasHiRes: true, qobuzUrl });
  } else {
    if (found) {
      found.qobuzUrl = '';
      found.checked = true;
    }
    return res.json({ hasHiRes: false });
  }
});

function downloadAlbumOnSpotiFLAC(qobuzUrl) {
  try {
    const safeUrl = qobuzUrl.replace(/[^a-zA-Z0-9-._~:/?#\[\]@!$&'()*+,;=]/g, '');
    
    const bashScript = `
      export DISPLAY=:0
      echo "${safeUrl}" | xclip -selection clipboard
      WID=$(xdotool search --onlyvisible --class "SpotiFLAC" | head -n 1)
      if [ -n "$WID" ]; then
        xdotool windowactivate "$WID"
        sleep 0.5
        xdotool key ctrl+a Delete
        sleep 0.2
        xdotool key ctrl+v
        sleep 0.2
        xdotool key Return
        echo "SUCCESS"
      else
        echo "WINDOW_NOT_FOUND"
      fi
    `;
    
    const escapedScript = bashScript.replace(/'/g, "'\\''");
    const output = execSync(`echo "satdes2155" | sudo -S docker exec -i spotiflac bash -c '${escapedScript}'`, { encoding: 'utf8', timeout: 6000 }).trim();
    
    console.log(`>>> SpotiFLAC Auto-Downloader Output: ${output}`);
    return output.includes('SUCCESS');
  } catch (err) {
    console.error('Error in downloadAlbumOnSpotiFLAC:', err);
    return false;
  }
}

app.post('/api/upgrader/download-album', requireAuth, (req, res) => {
  const { qobuzUrl } = req.body;
  if (!qobuzUrl) {
    return res.status(400).json({ error: 'MISSING_QOBUZ_URL' });
  }
  
  const success = downloadAlbumOnSpotiFLAC(qobuzUrl);
  if (success) {
    res.json({ success: true });
  } else {
    res.status(500).json({ error: 'FAILED_TO_INJECT_DOWNLOAD' });
  }
});

// === DLNA CASTING & DISCOVERY ENGINE ===
const dgram = require('dgram');
const http = require('http');

let discoveredDevices = {}; // Key: Location, Value: { name, controlUrl, ip }

function getDhcpIps() {
  const ips = [];
  try {
    const leasePath = '/var/lib/NetworkManager/dnsmasq-enp0s31f6.leases';
    if (fs.existsSync(leasePath)) {
      const content = fs.readFileSync(leasePath, 'utf8');
      content.split('\n').forEach(line => {
        if (!line) return;
        const parts = line.split(' ');
        if (parts.length >= 3) {
          const ip = parts[2];
          if (ip.match(/^10\.42\.0\.[0-9]+$/) && ip !== '10.42.0.1') {
            ips.push(ip);
          }
        }
      });
    }
  } catch (err) {
    console.error('>>> DLNA: Error reading DHCP leases:', err.message);
  }
  return ips;
}

function getArpIps() {
  const ips = [];
  try {
    const arpPath = '/proc/net/arp';
    if (fs.existsSync(arpPath)) {
      const content = fs.readFileSync(arpPath, 'utf8');
      content.split('\n').forEach((line, index) => {
        if (index === 0 || !line) return;
        const parts = line.replace(/\s+/g, ' ').trim().split(' ');
        if (parts.length >= 1) {
          const ip = parts[0];
          if (ip.match(/^10\.42\.0\.[0-9]+$/) && ip !== '10.42.0.1') {
            ips.push(ip);
          }
        }
      });
    }
  } catch (err) {
    console.error('>>> DLNA: Error reading ARP table:', err.message);
  }
  return ips;
}

function probeDeviceDirectly(ip) {
  const candidates = [
    `http://${ip}:9197/dmr`,
    `http://${ip}:7676/smp_2_`,
    `http://${ip}:7676/smp_3_`,
    `http://${ip}:7676/smp_4_`
  ];
  
  candidates.forEach(location => {
    if (discoveredDevices[location]) return;
    
    const req = http.get(location, { timeout: 1500 }, (res) => {
      if (res.statusCode !== 200) return;
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const nameMatch = data.match(/<friendlyName>([^<]+)<\/friendlyName>/);
        const friendlyName = nameMatch ? nameMatch[1].trim() : 'DLNA Device';
        
        const avtIndex = data.indexOf('urn:schemas-upnp-org:service:AVTransport:1');
        if (avtIndex === -1) return;
        
        const serviceBlock = data.substring(avtIndex, data.indexOf('</service>', avtIndex));
        const controlMatch = serviceBlock.match(/<controlURL>([^<]+)<\/controlURL>/);
        if (!controlMatch) return;
        
        let controlURL = controlMatch[1].trim();
        const urlObj = new URL(location);
        if (!controlURL.startsWith('http')) {
          controlURL = `${urlObj.protocol}//${urlObj.host}${controlURL.startsWith('/') ? '' : '/'}${controlURL}`;
        }
        
        discoveredDevices[location] = {
          name: friendlyName,
          controlUrl: controlURL,
          ip: urlObj.hostname
        };
        console.log(`>>> DLNA (Direct Probe): Discovered "${friendlyName}" at ${urlObj.hostname}`);
      });
    });
    
    req.on('error', () => {});
    req.on('timeout', () => req.destroy());
  });
}

function startDiscovery() {
  // Ejecutar sondeo directo híbrido sobre hosts activos de la red local
  try {
    const uniqueIps = Array.from(new Set([...getDhcpIps(), ...getArpIps()]));
    console.log(`>>> DLNA: Starting direct IP probing on active hosts:`, uniqueIps);
    uniqueIps.forEach(probeDeviceDirectly);
  } catch (err) {
    console.error('>>> DLNA: Error starting direct IP prober:', err.message);
  }

  const socket = dgram.createSocket('udp4');
  
  socket.on('error', (err) => {
    console.error('>>> DLNA/SSDP Socket Error:', err.message);
  });
  
  socket.on('message', (msg) => {
    const headers = msg.toString();
    const locMatch = headers.match(/LOCATION:\s*(http:\/\/\S+)/i);
    if (!locMatch) return;
    
    const location = locMatch[1];
    if (discoveredDevices[location]) return;
    
    // Consultar el XML del dispositivo
    http.get(location, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const nameMatch = data.match(/<friendlyName>([^<]+)<\/friendlyName>/);
        const friendlyName = nameMatch ? nameMatch[1].trim() : 'DLNA Device';
        
        const avtIndex = data.indexOf('urn:schemas-upnp-org:service:AVTransport:1');
        if (avtIndex === -1) return;
        
        const serviceBlock = data.substring(avtIndex, data.indexOf('</service>', avtIndex));
        const controlMatch = serviceBlock.match(/<controlURL>([^<]+)<\/controlURL>/);
        if (!controlMatch) return;
        
        let controlURL = controlMatch[1].trim();
        const urlObj = new URL(location);
        if (!controlURL.startsWith('http')) {
          controlURL = `${urlObj.protocol}//${urlObj.host}${controlURL.startsWith('/') ? '' : '/'}${controlURL}`;
        }
        
        discoveredDevices[location] = {
          name: friendlyName,
          controlUrl: controlURL,
          ip: urlObj.hostname
        };
        console.log(`>>> DLNA: Discovered "${friendlyName}" at ${urlObj.hostname}`);
      });
    }).on('error', () => {});
  });
  
  socket.bind(0, '10.42.0.1', () => {
    try {
      socket.setMulticastInterface('10.42.0.1');
    } catch (e) {
      console.error('>>> DLNA: Error setting multicast interface:', e.message);
    }
    
    const ssdpMsg = 
      'M-SEARCH * HTTP/1.1\r\n' +
      'HOST: 239.255.255.250:1900\r\n' +
      'MAN: "ssdp:discover"\r\n' +
      'MX: 2\r\n' +
      'ST: ssdp:all\r\n\r\n';
      
    socket.send(Buffer.from(ssdpMsg), 1900, '239.255.255.250', (err) => {
      if (err) console.error('>>> DLNA: Error sending SSDP:', err.message);
    });
  });
  
  setTimeout(() => {
    try { socket.close(); } catch(e) {}
  }, 4000);
}

// Iniciar un escaneo inicial al arrancar el servidor
setTimeout(startDiscovery, 2000);

function postSOAP(controlUrl, action, bodyContent) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(controlUrl);
    const soapEnvelope = 
      `<?xml version="1.0" encoding="utf-8"?>` +
      `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">` +
        `<s:Body>${bodyContent}</s:Body>` +
      `</s:Envelope>`;
      
    const req = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset="utf-8"',
        'SOAPAction': `"urn:schemas-upnp-org:service:AVTransport:1#${action}"`,
        'Content-Length': Buffer.byteLength(soapEnvelope)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`SOAP Action ${action} failed (${res.statusCode}): ${data}`));
        }
      });
    });
    
    req.on('error', (err) => reject(err));
    req.write(soapEnvelope);
    req.end();
  });
}

function castVideo(controlUrl, videoUrl) {
  let castUrl = videoUrl;
  if (videoUrl.startsWith('http')) {
    const base64Url = Buffer.from(videoUrl).toString('base64');
    castUrl = `http://10.42.0.1:8090/api/dlna/proxy?url=${encodeURIComponent(base64Url)}`;
    console.log(`>>> DLNA: Wrapping target stream in local HTTP proxy. Cast URL: ${castUrl}`);
  }

  const metadata = `<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:dlna="urn:schemas-dlna-org:metadata-1-0/">` +
    `<item id="0" parentID="0" restricted="1">` +
      `<dc:title>Video Stream</dc:title>` +
      `<upnp:class>object.item.videoItem</upnp:class>` +
      `<res protocolInfo="http-get:*:*:*">${castUrl}</res>` +
    `</item>` +
  `</DIDL-Lite>`;
  
  const escapedMetadata = metadata
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  const setUriBody = 
    `<u:SetAVTransportURI xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">` +
      `<InstanceID>0</InstanceID>` +
      `<CurrentURI>${castUrl}</CurrentURI>` +
      `<CurrentURIMetaData>${escapedMetadata}</CurrentURIMetaData>` +
    `</u:SetAVTransportURI>`;

  const playBody = 
    `<u:Play xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">` +
      `<InstanceID>0</InstanceID>` +
      `<Speed>1</Speed>` +
    `</u:Play>`;

  return postSOAP(controlUrl, 'SetAVTransportURI', setUriBody)
    .then(() => new Promise(resolve => setTimeout(resolve, 1000)))
    .then(() => postSOAP(controlUrl, 'Play', playBody));
}

function fetchHtmlWithCurl(url) {
  return new Promise((resolve, reject) => {
    const escapedUrl = url.replace(/'/g, "'\\''");
    const cmd = `curl -s -L --connect-timeout 8 --max-time 15 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" -e "${escapedUrl}" "${escapedUrl}"`;
    const { exec } = require('child_process');
    exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve(stdout);
    });
  });
}

async function sniffVideoUrl(targetUrl, depth = 0) {
  if (depth > 3) return null;
  
  // 1. Descodificar Base64 de parámetro 'r' si existe (usado por Rojadirecta)
  try {
    const urlObj = new URL(targetUrl);
    const rParam = urlObj.searchParams.get('r');
    if (rParam) {
      const decoded = Buffer.from(rParam, 'base64').toString('utf8');
      if (decoded.startsWith('http')) {
        targetUrl = decoded;
      }
    }
  } catch (e) {}

  // 2. Extraer parámetro 'get' si existe (creación de iframe dinámica en JS de Rojadirecta)
  try {
    const urlObj2 = new URL(targetUrl);
    const getParam = urlObj2.searchParams.get('get');
    if (getParam && getParam.startsWith('http')) {
      targetUrl = getParam;
    }
  } catch (e) {}

  console.log(`>>> Sniffer: Fetching (${depth}) ${targetUrl}`);
  
  try {
    const html = await fetchHtmlWithCurl(targetUrl);
    if (!html || html.trim() === '') return null;
    
    // A. Buscar links de video directos (.m3u8 o .mp4)
    const streamRegex = /(https?:\/\/[^"'\s>]+?\.(?:m3u8|mp4)(?:\?[^"'\s>]+)?)/gi;
    const matches = html.match(streamRegex);
    if (matches && matches.length > 0) {
      let videoUrl = matches[0].replace(/&amp;/g, '&');
      console.log(`>>> Sniffer: Found stream! ${videoUrl}`);
      return videoUrl;
    }
    
    // A2. Buscar en la configuración JSON del reproductor (stream_url)
    const streamUrlRegex = /"stream_url"\s*:\s*"([^"]+)"/i;
    const jsonMatch = html.match(streamUrlRegex);
    if (jsonMatch && jsonMatch[1]) {
      let videoUrl = jsonMatch[1].replace(/\\/g, ''); // Desescapar barras inclinadas \/ -> /
      console.log(`>>> Sniffer: Found stream in JSON config! ${videoUrl}`);
      return videoUrl;
    }
    
    // B. Buscar iframes embebidos si no encontramos link directo
    const iframeRegex = /<iframe[^>]+src=["'](https?:\/\/[^"']+)["']/gi;
    let iframeMatch;
    while ((iframeMatch = iframeRegex.exec(html)) !== null) {
      const iframeUrl = iframeMatch[1].replace(/&amp;/g, '&');
      if (iframeUrl !== targetUrl) { // Evitar bucles infinitos
        const found = await sniffVideoUrl(iframeUrl, depth + 1);
        if (found) return found;
      }
    }
  } catch (err) {
    console.error(`>>> Sniffer Error: ${err.message}`);
  }
  
  return null;
}

// Endpoint de proxy local para hacer bridge de streams de video HTTP/HTTPS sin requireAuth para permitir el acceso directo de la TV
app.get('/api/dlna/proxy', async (req, res) => {
  const { url: encodedUrl, referer } = req.query;
  if (!encodedUrl) return res.status(400).send('Missing URL');
  
  try {
    const targetUrl = Buffer.from(encodedUrl, 'base64').toString('utf8');
    const urlObj = new URL(targetUrl);
    const isM3U8 = urlObj.pathname.endsWith('.m3u8') || targetUrl.includes('.m3u8');
    
    console.log(`>>> Stream Proxy: Piping ${targetUrl} (M3U8: ${isM3U8})`);
    
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
    if (referer) {
      headers['Referer'] = referer;
    } else {
      headers['Referer'] = urlObj.origin;
    }
    
    const transport = targetUrl.startsWith('https') ? require('https') : require('http');
    
    const proxyReq = transport.request(targetUrl, {
      method: 'GET',
      headers: headers,
      timeout: 10000
    }, (proxyRes) => {
      const contentType = proxyRes.headers['content-type'] || '';
      
      if (isM3U8 || contentType.includes('mpegurl') || contentType.includes('application/x-mpegURL')) {
        // Recolectar datos en memoria para reescribir URLs HLS
        let data = [];
        proxyRes.on('data', chunk => data.push(chunk));
        proxyRes.on('end', () => {
          const body = Buffer.concat(data).toString('utf8');
          const lines = body.split('\n');
          const rewrittenLines = lines.map(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return line;
            
            // Convertir a absoluta
            let absoluteUrl = trimmed;
            try {
              if (!trimmed.startsWith('http')) {
                absoluteUrl = new URL(trimmed, targetUrl).href;
              }
            } catch (e) {
              return line;
            }
            
            const base64Url = Buffer.from(absoluteUrl).toString('base64');
            return `http://10.42.0.1:8090/api/dlna/proxy?url=${encodeURIComponent(base64Url)}`;
          });
          
          const rewrittenBody = rewrittenLines.join('\n');
          res.writeHead(proxyRes.statusCode, {
            'Content-Type': 'application/x-mpegURL',
            'Access-Control-Allow-Origin': '*',
            'Connection': 'keep-alive',
            'Content-Length': Buffer.byteLength(rewrittenBody)
          });
          res.end(rewrittenBody);
        });
      } else {
        // Binario directo (Pipe) para segmentos .ts u otros archivos de video
        res.writeHead(proxyRes.statusCode, {
          'Content-Type': contentType || 'application/octet-stream',
          'Access-Control-Allow-Origin': '*',
          'Connection': 'keep-alive'
        });
        proxyRes.pipe(res);
      }
    });
    
    proxyReq.on('error', (err) => {
      console.error(`>>> Stream Proxy Error:`, err.message);
      res.status(500).send(err.message);
    });
    
    proxyReq.end();
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Endpoints de DLNA
app.post('/api/dlna/sniff', requireAuth, async (req, res) => {
  const { pageUrl } = req.body;
  if (!pageUrl) {
    return res.status(400).json({ error: 'MISSING_PAGE_URL' });
  }
  
  try {
    const videoUrl = await sniffVideoUrl(pageUrl);
    if (videoUrl) {
      res.json({ success: true, videoUrl });
    } else {
      res.status(404).json({ error: 'NO_STREAM_FOUND' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/dlna/scan', requireAuth, (req, res) => {
  startDiscovery();
  res.json({ success: true, message: 'Scan started' });
});

app.get('/api/dlna/devices', requireAuth, (req, res) => {
  res.json(Object.values(discoveredDevices));
});

app.post('/api/dlna/cast', requireAuth, async (req, res) => {
  const { controlUrl, videoUrl } = req.body;
  if (!controlUrl || !videoUrl) {
    return res.status(400).json({ error: 'MISSING_PARAMETERS' });
  }
  
  try {
    await castVideo(controlUrl, videoUrl);
    res.json({ success: true });
  } catch (err) {
    console.error('>>> DLNA: Cast error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/dlna/control', requireAuth, async (req, res) => {
  const { controlUrl, action } = req.body;
  if (!controlUrl || !['Play', 'Pause', 'Stop'].includes(action)) {
    return res.status(400).json({ error: 'INVALID_PARAMETERS' });
  }
  
  const bodyContent = 
    `<u:${action} xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">` +
      `<InstanceID>0</InstanceID>` +
      (action === 'Play' ? `<Speed>1</Speed>` : '') +
    `</u:${action}>`;
    
  try {
    await postSOAP(controlUrl, action, bodyContent);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Parser de listas de canales IPTV M3U
function parseM3U(content) {
  const lines = content.split('\n');
  const channels = [];
  let currentChannel = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXTINF:')) {
      currentChannel = {};
      const groupMatch = line.match(/group-title="([^"]+)"/i);
      const logoMatch = line.match(/tvg-logo="([^"]+)"/i);
      const nameMatch = line.match(/tvg-name="([^"]+)"/i);
      
      currentChannel.group = groupMatch ? groupMatch[1] : 'Otros';
      currentChannel.logo = logoMatch ? logoMatch[1] : '';
      currentChannel.tvgName = nameMatch ? nameMatch[1] : '';
      
      const lastComma = line.lastIndexOf(',');
      if (lastComma !== -1) {
        currentChannel.name = line.substring(lastComma + 1).trim();
      } else {
        currentChannel.name = 'Canal sin nombre';
      }
    } else if (line.startsWith('http') && currentChannel) {
      currentChannel.url = line;
      channels.push(currentChannel);
      currentChannel = null;
    }
  }
  return channels;
}
app.parseM3U = parseM3U;

// Descargar y parsear lista IPTV
app.post('/api/iptv/load', requireAuth, async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'MISSING_PLAYLIST_URL' });
  }
  try {
    console.log(`>>> IPTV: Fetching playlist from ${url}`);
    const content = await fetchHtmlWithCurl(url);
    if (!content) {
      throw new Error('Empty response from playlist URL');
    }
    const channels = parseM3U(content);
    console.log(`>>> IPTV: Loaded ${channels.length} channels`);
    res.json({ success: true, channels });
  } catch (err) {
    console.error(`>>> IPTV Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// === SERVER LISTEN BLOCK ===
if (require.main === module) {
  app.listen(8090, () => console.log('Server active on port 8090'));
} else {
  module.exports = app; // Para tests
}
