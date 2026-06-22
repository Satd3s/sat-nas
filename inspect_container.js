const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
    console.log('SSH connection established');
    const containerName = process.argv[2] || 'intelligent_atsushi-main_app-1';
    const cmd = `echo satdes2155 | sudo -S docker inspect ${containerName}`;
    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        let out = '';
        stream.on('close', () => {
            try {
                const data = JSON.parse(out);
                if (data.length > 0) {
                    const c = data[0];
                    console.log('\n===== CONTAINER DETAILS =====');
                    console.log('Name:', c.Name);
                    console.log('Image:', c.Config.Image);
                    console.log('Status:', c.State.Status);
                    console.log('Created:', c.Created);
                    console.log('Ports:', c.NetworkSettings.Ports);
                    console.log('Mounts:', c.Mounts.map(m => `${m.Source} -> ${m.Destination}`));
                    console.log('Env:', c.Config.Env);
                } else {
                    console.log(`Container "${containerName}" not found`);
                }
            } catch (e) {
                console.log('Raw output:', out);
            }
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
    console.error('SSH Error:', err);
}).connect({
    host: '10.42.0.1',
    port: 22,
    username: 'satde',
    password: 'satdes2155',
    localAddress: '192.168.0.151'
});
