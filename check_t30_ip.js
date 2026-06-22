const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
    console.log('SSH connection established');
    conn.exec('ip addr', (err, stream) => {
        if (err) throw err;
        stream.on('close', () => conn.end())
        .on('data', d => process.stdout.write(d))
        .stderr.on('data', e => process.stderr.write(e));
    });
}).on('error', (err) => {
    console.error('SSH Error:', err);
}).connect({
    host: '10.42.0.1',
    port: 22,
    username: 'satde',
    password: 'satdes2155',
    localAddress: '192.168.0.151'
});
