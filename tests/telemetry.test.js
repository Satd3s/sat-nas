const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const app = require('../server.js');

test('Validar estructura de /api/status con sesion', (t, done) => {
  const server = app.listen(0, () => {
    const port = server.address().port;
    const baseUrl = `http://localhost:${port}`;

    // Primero iniciamos sesion para obtener la cookie
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

      // Hacemos peticion a status con la cookie
      const reqStatus = http.request({
        hostname: 'localhost',
        port: port,
        path: '/api/status',
        method: 'GET',
        headers: {
          'Cookie': cookie
        }
      }, (resStatus) => {
        assert.strictEqual(resStatus.statusCode, 200);
        
        let body = '';
        resStatus.on('data', chunk => body += chunk);
        resStatus.on('end', () => {
          const data = JSON.parse(body);
          
          // Verificar propiedades requeridas por el dashboard
          assert.ok(data.uptime, 'Debe incluir la propiedad uptime');
          
          assert.ok(data.internet, 'Debe incluir la propiedad internet');
          assert.ok(data.internet.status, 'Debe incluir status de internet');

          assert.ok(data.interfaces, 'Debe incluir interfaces');
          assert.ok(data.interfaces.usb, 'Debe incluir interfaz usb');
          assert.ok(data.interfaces.ethernet, 'Debe incluir interfaz ethernet');
          assert.ok(data.interfaces.usb.status, 'Debe tener status usb');
          assert.ok(data.interfaces.usb.ip, 'Debe tener ip usb');

          assert.ok(data.resources, 'Debe incluir resources');
          assert.ok(typeof data.resources.cpu_usage_pct === 'number', 'cpu_usage_pct debe ser un numero');
          assert.ok(typeof data.resources.ram_used_mb === 'number', 'ram_used_mb debe ser un numero');
          assert.ok(typeof data.resources.ram_total_mb === 'number', 'ram_total_mb debe ser un numero');

          assert.ok(Array.isArray(data.disks), 'disks debe ser una lista');
          assert.ok(Array.isArray(data.docker), 'docker debe ser una lista');

          server.close();
          done();
        });
      });
      reqStatus.end();
    });
    reqLogin.write(validData);
    reqLogin.end();
  });
});
