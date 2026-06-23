const { Client } = require('ssh2');
const conn = new Client();

const SSH_CONFIG = {
  host: '10.42.0.1',
  port: 22,
  username: 'satde',
  password: 'satdes2155'
};

const CONFIG_PATH = '/opt/spotiflac-config/.spotiflac/config.json';

conn.on('ready', () => {
  console.log('>>> Conexión SSH establecida con T30 para configuración');
  
  // 1. Detener el contenedor para liberar bloqueos de archivos
  const sudo = (cmd) => `echo "${SSH_CONFIG.password}" | sudo -S ${cmd}`;
  console.log('>>> Deteniendo contenedor spotiflac para liberar archivos...');
  
  conn.exec(sudo('docker stop spotiflac'), (errStop, streamStop) => {
    if (errStop) throw errStop;
    
    streamStop.on('close', () => {
      console.log('>>> Contenedor detenido. Iniciando SFTP...');
      
      // 2. Iniciar SFTP para leer y escribir de forma robusta
      conn.sftp((errSftp, sftp) => {
        if (errSftp) throw errSftp;
        
        console.log(`>>> Leyendo configuración desde ${CONFIG_PATH}...`);
        sftp.readFile(CONFIG_PATH, (errRead, content) => {
          if (errRead) {
            console.error('Error al leer el archivo con SFTP:', errRead);
            conn.end();
            return;
          }
          
          try {
            const config = JSON.parse(content.toString());
            console.log('>>> Configuración leída con éxito. Modificando parámetros...');
            
            // Aplicar configuraciones solicitadas por el usuario
            config.downloadPath = '/storage';
            config.folderPreset = 'custom';
            config.folderTemplate = '{album_artist}/{album}';
            config.applyFolderToSingleTrack = true;
            config.autoQuality = '24';
            config.tidalQuality = 'HI_RES_LOSSLESS';
            config.qobuzQuality = '7'; // Máximo Qobuz (24-bit / 192kHz)
            config.amazonQuality = '24'; // Máximo Amazon (24-bit)
            
            const updatedJSON = JSON.stringify(config, null, 2);
            
            console.log('>>> Escribiendo configuración actualizada mediante SFTP...');
            sftp.writeFile(CONFIG_PATH, updatedJSON, (errWrite) => {
              if (errWrite) {
                console.error('Error al escribir el archivo con SFTP:', errWrite);
                conn.end();
                return;
              }
              
              console.log('>>> Archivo config.json actualizado exitosamente.');
              
              // 3. Iniciar el contenedor de vuelta
              console.log('>>> Arrancando contenedor spotiflac...');
              conn.exec(sudo('docker start spotiflac'), (errStart, streamStart) => {
                if (errStart) throw errStart;
                
                streamStart.on('close', () => {
                  console.log('>>> Contenedor arrancado con éxito. Proceso finalizado.');
                  conn.end();
                })
                .on('data', d => process.stdout.write(d))
                .stderr.on('data', e => {
                  const str = e.toString();
                  if (!str.includes('[sudo] password for satde:')) {
                    process.stderr.write(e);
                  }
                });
              });
            });
            
          } catch (parseErr) {
            console.error('Error al parsear el JSON:', parseErr);
            conn.end();
          }
        });
      });
    })
    .on('data', d => process.stdout.write(d))
    .stderr.on('data', e => {
      const str = e.toString();
      if (!str.includes('[sudo] password for satde:')) {
        process.stderr.write(e);
      }
    });
  });
}).on('error', (err) => {
  console.error('SSH Connection Error:', err);
}).connect(SSH_CONFIG);
