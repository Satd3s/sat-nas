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

// Obtener metadatos mediante mediainfo (disponible nativo en el T30)
function getAudioMetadata(filePath) {
  try {
    const escapedPath = filePath.replace(/'/g, "'\\''");
    const jsonStr = execSync(`mediainfo --Output=JSON '${escapedPath}'`, { encoding: 'utf8', timeout: 5000 }).trim();
    const data = JSON.parse(jsonStr);
    
    const tracks = data.media && data.media.track ? data.media.track : [];
    const general = tracks.find(t => t['@type'] === 'General') || {};
    const audio = tracks.find(t => t['@type'] === 'Audio') || {};
    
    const artist = general.Performer || general.Album_Performer || 'Unknown Artist';
    const album = general.Album || 'Unknown Album';
    const title = general.Title || 'Unknown Title';
    const bitDepth = parseInt(audio.BitDepth) || 16;
    
    return {
      artist: artist ? artist.trim() : 'Unknown Artist',
      album: album ? album.trim() : 'Unknown Album',
      title: title ? title.trim() : 'Unknown Title',
      bitDepth,
      isHiRes: bitDepth >= 24,
      ext: path.extname(filePath).toLowerCase()
    };
  } catch (err) {
    console.error(`Error leyendo metadatos de ${filePath}:`, err);
    return null;
  }
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

// Orquestador del escáner en segundo plano
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
    
    // Fase 1: Leer metadatos locales (ocupa el 100% del progreso local)
    for (const file of files) {
      const meta = getAudioMetadata(file);
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

// === SERVER LISTEN BLOCK ===
if (require.main === module) {
  app.listen(8090, () => console.log('Server active on port 8090'));
} else {
  module.exports = app; // Para tests
}
