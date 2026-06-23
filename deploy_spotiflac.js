const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const conn = new Client();

const SSH_CONFIG = {
  host: '10.42.0.1',
  port: 22,
  username: 'satde',
  password: 'satdes2155'
};

const REMOTE_DIR = '/home/satde/spotiflac';

const filesToUpload = [
  'Dockerfile.spotiflac',
  'startapp.sh',
  'update_spotiflac.sh'
];

conn.on('ready', () => {
  console.log('>>> Conexión SSH establecida con T30');
  
  conn.sftp((err, sftp) => {
    if (err) throw err;
    
    sftp.mkdir(REMOTE_DIR, () => {
      uploadFiles(sftp);
    });
  });
}).on('error', (err) => {
  console.error('SSH Connection Error:', err);
}).connect(SSH_CONFIG);

function uploadFiles(sftp) {
  let index = 0;
  
  function next() {
    if (index >= filesToUpload.length) {
      console.log('>>> Archivos subidos. Iniciando setup remoto...');
      runRemoteSetup();
      return;
    }
    
    const file = filesToUpload[index++];
    const localPath = path.join(__dirname, file);
    const remotePath = `${REMOTE_DIR}/${file}`;
    
    console.log(`Subiendo ${file} -> ${remotePath}...`);
    sftp.fastPut(localPath, remotePath, (err) => {
      if (err) {
        console.error(`Error al subir ${file}:`, err);
        conn.end();
        return;
      }
      next();
    });
  }
  
  next();
}

function runRemoteSetup() {
  const sudoPass = SSH_CONFIG.password;
  const sudo = (cmd) => `echo "${sudoPass}" | sudo -S ${cmd}`;
  
  const commands = [
    // 1. Crear directorios de configuración y descargas en host
    sudo(`mkdir -p /opt/spotiflac-config`),
    sudo(`chown -R satde:satde /opt/spotiflac-config`),
    sudo(`mkdir -p "/mnt/disco_1tb/flac 24"`),
    sudo(`chown -R satde:satde "/mnt/disco_1tb/flac 24"`),
    sudo(`chmod 777 "/mnt/disco_1tb/flac 24"`),
    
    // 2. Dar permisos de ejecución a los scripts
    `chmod +x ${REMOTE_DIR}/startapp.sh`,
    `chmod +x ${REMOTE_DIR}/update_spotiflac.sh`,
    
    // 3. Compilar la imagen Docker
    sudo(`docker build -f ${REMOTE_DIR}/Dockerfile.spotiflac -t spotiflac:latest ${REMOTE_DIR}`),
    
    // 4. Detener y remover contenedor previo si existiera
    sudo(`docker stop spotiflac || true`),
    sudo(`docker rm spotiflac || true`),
    
    // 5. Iniciar el nuevo contenedor mapeando al disco de 1 TB
    sudo(`docker run -d --name spotiflac --restart unless-stopped -p 8095:5800 -v /opt/spotiflac-config:/config -v "/mnt/disco_1tb/flac 24":/storage spotiflac:latest`),
    
    // 6. Copiar script de actualización al home para fácil acceso
    `cp ${REMOTE_DIR}/update_spotiflac.sh /home/satde/update_spotiflac.sh`,
    `chmod +x /home/satde/update_spotiflac.sh`
  ];
  
  let i = 0;
  function runNextCmd() {
    if (i >= commands.length) {
      console.log('>>> Despliegue e inicialización finalizada.');
      conn.end();
      return;
    }
    
    const cmd = commands[i++];
    const logCmd = cmd.includes(sudoPass) ? 'sudo [docker/setup command]' : cmd;
    console.log(`\nEjecutando: ${logCmd}`);
    
    conn.exec(cmd, (err, stream) => {
      if (err) {
        console.error('Command Execution Error:', err);
        conn.end();
        return;
      }
      stream.on('close', () => {
        runNextCmd();
      })
      .on('data', d => process.stdout.write(d))
      .stderr.on('data', e => {
        const str = e.toString();
        if (!str.includes('[sudo] password for satde:')) {
          process.stderr.write(e);
        }
      });
    });
  }
  
  runNextCmd();
}
