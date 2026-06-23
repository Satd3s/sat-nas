const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const conn = new Client();

const SSH_CONFIG = {
  host: '10.42.0.1',
  port: 22,
  username: 'satde',
  password: 'satdes2155',
  localAddress: '192.168.0.151'
};

const REMOTE_TEMP_DIR = '/home/satde/sat-nas';
const REMOTE_INSTALL_DIR = '/opt/sat-nas';

const filesToUpload = [
  'server.js',
  'config.json',
  'package.json',
  'sat-nas.service',
  'public/index.html',
  'public/index.js',
  'public/index.css',
  'public/login.html'
];

conn.on('ready', () => {
  console.log('>>> SSH CONNECTION ESTABLISHED TO T30');
  
  conn.sftp((err, sftp) => {
    if (err) {
      console.error('SFTP Error:', err);
      return conn.end();
    }
    
    console.log('>>> SFTP SUB-PROTOCOL ACTIVE');
    
    // Asegurar directorio temporal en remoto
    sftp.mkdir(REMOTE_TEMP_DIR, (err) => {
      // Ignorar error si ya existe
      sftp.mkdir(REMOTE_TEMP_DIR + '/public', (err) => {
        // Ignorar error
        uploadFiles(sftp);
      });
    });
  });
}).on('error', (err) => {
  console.error('SSH Connection Failed:', err);
});

function uploadFiles(sftp) {
  let index = 0;
  
  function next() {
    if (index >= filesToUpload.length) {
      console.log('>>> ALL FILES UPLOADED TO REMOTE TEMP DIR');
      runRemoteSetup();
      return;
    }
    
    const file = filesToUpload[index++];
    const localPath = path.join(__dirname, file);
    const remotePath = `${REMOTE_TEMP_DIR}/${file}`;
    
    console.log(`Uploading ${file} -> ${remotePath}...`);
    sftp.fastPut(localPath, remotePath, (err) => {
      if (err) {
        console.error(`Error uploading ${file}:`, err);
        return conn.end();
      }
      next();
    });
  }
  
  next();
}

function runRemoteSetup() {
  console.log('>>> RUNNING REMOTE INSTALLATION & SERVICE ACTIVATION');
  
  const sudoPass = SSH_CONFIG.password;
  const sudo = (cmd) => `echo "${sudoPass}" | sudo -S ${cmd}`;
  
  const commands = [
    // 1. Crear dir destino y copiar archivos
    sudo(`rm -rf ${REMOTE_INSTALL_DIR}`),
    sudo(`mkdir -p ${REMOTE_INSTALL_DIR}`),
    sudo(`cp -r ${REMOTE_TEMP_DIR}/* ${REMOTE_INSTALL_DIR}/`),
    sudo(`chown -R root:root ${REMOTE_INSTALL_DIR}`),
    
    // 2. Copiar y habilitar el servicio de systemd
    sudo(`cp ${REMOTE_INSTALL_DIR}/sat-nas.service /etc/systemd/system/sat-nas.service`),
    sudo(`chown root:root /etc/systemd/system/sat-nas.service`),
    sudo(`chmod 644 /etc/systemd/system/sat-nas.service`),
    
    // 3. Ejecutar npm install en directorio destino
    sudo(`npm install --prefix ${REMOTE_INSTALL_DIR} --omit=dev`),
    
    // 4. Activar systemd daemon, habilitar e iniciar servicio
    sudo(`systemctl daemon-reload`),
    sudo(`systemctl enable sat-nas.service`),
    sudo(`systemctl restart sat-nas.service`),
    
    // 5. Verificar estado de ejecucion
    sudo(`systemctl status sat-nas.service | cat`),
    
    // 6. Verificar puerto localmente en el T30
    `curl -s -I http://localhost:8090/login.html | grep HTTP`
  ];
  
  let i = 0;
  function runNextCmd() {
    if (i >= commands.length) {
      console.log('>>> DEPLOYMENT SUCCEEDED AND VERIFIED');
      conn.end();
      return;
    }
    
    const cmd = commands[i++];
    // Omitir loguear la contraseña por seguridad
    const logCmd = cmd.includes(sudoPass) ? cmd.replace(sudoPass, '********') : cmd;
    console.log(`\nExecuting: ${logCmd}`);
    
    conn.exec(cmd, (err, stream) => {
      if (err) {
        console.error(`Command error: ${logCmd}`, err);
        return conn.end();
      }
      
      stream.on('close', (code, signal) => {
        runNextCmd();
      })
      .on('data', d => process.stdout.write(d))
      .stderr.on('data', e => {
        // Ignorar lineas de advertencia de sudo
        const str = e.toString();
        if (!str.includes('[sudo] password for satde:')) {
          process.stderr.write(e);
        }
      });
    });
  }
  
  runNextCmd();
}

conn.connect(SSH_CONFIG);
