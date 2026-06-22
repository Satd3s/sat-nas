const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
    console.log('SSH connection established');
    const cmds = [
        'echo satdes2155 | sudo -S mkdir -p /opt/adguardhome/work /opt/adguardhome/conf',
        'echo satdes2155 | sudo -S chmod -R 777 /opt/adguardhome',
        'echo satdes2155 | sudo -S docker stop adguardhome || true',
        'echo satdes2155 | sudo -S docker rm adguardhome || true',
        'echo satdes2155 | sudo -S docker run -d --name adguardhome --restart always -v /opt/adguardhome/work:/opt/adguardhome/work -v /opt/adguardhome/conf:/opt/adguardhome/conf -p 5300:53/tcp -p 5300:53/udp -p 8585:80/tcp -p 3000:3000/tcp adguard/adguardhome:latest',
        'sleep 3',
        'echo satdes2155 | sudo -S docker ps | grep adguardhome'
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
