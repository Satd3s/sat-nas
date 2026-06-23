const { Client } = require('ssh2');
const conn = new Client();

const SSH_CONFIG = {
  host: '10.42.0.1',
  port: 22,
  username: 'satde',
  password: 'satdes2155'
};

conn.on('ready', () => {
  console.log('SSH connection established');
  
  const cmd = `
    echo "=== Reading SpotiFLAC config.json ==="
    cat /opt/spotiflac-config/.spotiflac/config.json
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
}).connect(SSH_CONFIG);
