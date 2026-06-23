const { Client } = require('ssh2');
const conn = new Client();

const SSH_CONFIG = {
  host: '10.42.0.1',
  port: 22,
  username: 'satde',
  password: 'satdes2155'
};

conn.on('ready', () => {
  console.log('SSH connection established to T30');
  
  const cmd = `
    echo "=== CPU Architecture ==="
    uname -m
    echo ""
    echo "=== OS Details ==="
    cat /etc/os-release | grep -E "^(NAME|VERSION)="
    echo ""
    echo "=== Disk Mounts ==="
    df -h
    echo ""
    echo "=== Block Devices ==="
    lsblk
    echo ""
    echo "=== Docker Status ==="
    systemctl is-active docker
  `;
  
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    let out = '';
    stream.on('close', () => {
      console.log(out);
      conn.end();
    })
    .on('data', d => out += d)
    .stderr.on('data', e => process.stderr.write(e));
  });
}).on('error', (err) => {
  console.error('SSH Error:', err);
}).connect(SSH_CONFIG);
