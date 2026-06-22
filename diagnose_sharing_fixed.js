const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
    console.log('SSH connection established to 10.42.0.1');
    const cmds = [
        'cat /proc/sys/net/ipv4/ip_forward',
        'echo satdes2155 | sudo -S iptables -t nat -S',
        'echo satdes2155 | sudo -S iptables -S',
        'ip route',
        'nmcli connection show'
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
