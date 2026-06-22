const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
    console.log('SSH connection established');
    const cmds = [
        'echo satdes2155 | sudo -S sh -c "printf \'no-resolv\\nserver=127.0.0.1#5300\\n\' > /etc/NetworkManager/dnsmasq-shared.d/adguard.conf"',
        'cat /etc/NetworkManager/dnsmasq-shared.d/adguard.conf',
        'echo satdes2155 | sudo -S nmcli connection up "Perfil 1"'
    ];
    let i = 0;
    const runNext = () => {
        if (i >= cmds.length) {
            console.log('Finished.');
            return conn.end();
        }
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
    localAddress: '192.168.0.151'
});
