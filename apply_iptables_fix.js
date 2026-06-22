const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
    console.log('SSH connection established');
    const cmds = [
        'echo satdes2155 | sudo -S iptables -I FORWARD 1 -i enp0s31f6 -j ACCEPT',
        'echo satdes2155 | sudo -S iptables -I FORWARD 1 -o enp0s31f6 -j ACCEPT',
        'echo satdes2155 | sudo -S iptables -t nat -I POSTROUTING 1 -s 10.42.0.0/24 ! -d 10.42.0.0/24 -j MASQUERADE',
        'echo satdes2155 | sudo -S iptables -L FORWARD -vn',
        'echo satdes2155 | sudo -S iptables -t nat -L POSTROUTING -vn'
    ];
    let i = 0;
    const runNext = () => {
        if (i >= cmds.length) return conn.end();
        console.log('\n--- Running: ' + cmds[i] + ' ---');
        conn.exec(cmds[i++], (err, stream) => {
            if (err) {
                console.error(err);
                return conn.end();
            }
            stream.on('close', () => {
                runNext();
            })
            .on('data', d => process.stdout.write(d))
            .stderr.on('data', e => process.stderr.write(e));
        });
    };
    runNext();
}).on('error', (err) => {
    console.error('SSH Error:', err);
}).connect({
    host: '10.42.0.1',
    port: 22,
    username: 'satde',
    password: 'satdes2155',
    localAddress: '192.168.0.221'
});
