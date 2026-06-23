const { Client } = require('ssh2');
const conn = new Client();

const SSH_CONFIG = {
  host: '10.42.0.1',
  port: 22,
  username: 'satde',
  password: 'satdes2155'
};

conn.on('ready', () => {
  console.log('>>> Conexión SSH establecida para verificación');
  
  const cmd = `
    echo "=== Container Status ==="
    echo "satdes2155" | sudo -S docker ps -a --filter name=spotiflac
    echo ""
    echo "=== Network Connection test on Port 8095 ==="
    curl -s -I http://localhost:8095 | head -n 5 || echo "Failed to connect to SpotiFLAC noVNC port"
    echo ""
    echo "=== Container Logs (Last 15 lines) ==="
    echo "satdes2155" | sudo -S docker logs --tail 15 spotiflac
  `;
  
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    let out = '';
    stream.on('close', () => {
      console.log('=== VERIFICATION OUTPUT ===');
      console.log(out);
      conn.end();
    })
    .on('data', d => out += d)
    .stderr.on('data', e => {
      const str = e.toString();
      if (!str.includes('[sudo] password for satde:')) {
        process.stderr.write(e);
      }
    });
  });
}).on('error', (err) => {
  console.error('SSH Verification Error:', err);
}).connect(SSH_CONFIG);
