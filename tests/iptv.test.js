const test = require('node:test');
const assert = require('node:assert');
const serverModule = require('../server.js');
const parseM3U = serverModule.parseM3U;

test('parseM3U deberia parsear correctamente una lista M3U estandar', () => {
  const m3uSample = `#EXTM3U
#EXTINF:-1 tvg-id="CNN" tvg-name="CNN" tvg-logo="http://logo.com/cnn.png" group-title="Noticias",CNN International
http://stream.cnn.com/hls.m3u8
#EXTINF:-1 group-title="Deportes",ESPN Deportes
https://stream.espn.com/espn.m3u8`;

  assert.strictEqual(typeof parseM3U, 'function', 'parseM3U debe ser una funcion');
  const channels = parseM3U(m3uSample);
  
  assert.strictEqual(channels.length, 2);
  
  // Canal 1
  assert.strictEqual(channels[0].name, 'CNN International');
  assert.strictEqual(channels[0].group, 'Noticias');
  assert.strictEqual(channels[0].logo, 'http://logo.com/cnn.png');
  assert.strictEqual(channels[0].url, 'http://stream.cnn.com/hls.m3u8');
  
  // Canal 2
  assert.strictEqual(channels[1].name, 'ESPN Deportes');
  assert.strictEqual(channels[1].group, 'Deportes');
  assert.strictEqual(channels[1].logo, '');
  assert.strictEqual(channels[1].url, 'https://stream.espn.com/espn.m3u8');
});

test('parseM3U deberia usar valores por defecto si faltan atributos', () => {
  const m3uSample = `#EXTM3U
#EXTINF:-1,Canal Simple
http://simple.com/stream.m3u8`;

  assert.strictEqual(typeof parseM3U, 'function', 'parseM3U debe ser una funcion');
  const channels = parseM3U(m3uSample);
  
  assert.strictEqual(channels.length, 1);
  assert.strictEqual(channels[0].name, 'Canal Simple');
  assert.strictEqual(channels[0].group, 'Otros');
  assert.strictEqual(channels[0].logo, '');
  assert.strictEqual(channels[0].url, 'http://simple.com/stream.m3u8');
});

test('Endpoint /api/iptv/load deberia fallar con HTTP 500 ante formato M3U invalido', (t, done) => {
  const http = require('node:http');
  const app = serverModule;
  
  const server = app.listen(0, () => {
    const port = server.address().port;
    
    // Iniciar sesion
    const validData = JSON.stringify({ username: 'admin', password: 'satdes2155' });
    const reqLogin = http.request({
      hostname: 'localhost',
      port: port,
      path: '/api/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': validData.length
      }
    }, (resLogin) => {
      assert.strictEqual(resLogin.statusCode, 200);
      const setCookie = resLogin.headers['set-cookie'];
      const cookie = setCookie[0].split(';')[0];
      
      // Hacemos peticion a load pasandole una URL que retorna JSON (invalida para M3U)
      const testPayload = JSON.stringify({ url: `http://localhost:${port}/api/status` });
      
      const reqLoad = http.request({
        hostname: 'localhost',
        port: port,
        path: '/api/iptv/load',
        method: 'POST',
        headers: {
          'Cookie': cookie,
          'Content-Type': 'application/json',
          'Content-Length': testPayload.length
        }
      }, (resLoad) => {
        // Deberia responder con error 500
        assert.strictEqual(resLoad.statusCode, 500);
        
        let body = '';
        resLoad.on('data', chunk => body += chunk);
        resLoad.on('end', () => {
          const data = JSON.parse(body);
          assert.ok(data.error, 'Debe incluir un mensaje de error');
          assert.match(data.error, /invalid playlist format/i);
          
          server.close();
          done();
        });
      });
      
      reqLoad.write(testPayload);
      reqLoad.end();
    });
    
    reqLogin.write(validData);
    reqLogin.end();
  });
});

