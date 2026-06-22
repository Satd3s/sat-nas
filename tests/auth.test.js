const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const app = require('../server.js');

test('Flujo completo de autenticacion', (t, done) => {
  const server = app.listen(0, () => {
    const port = server.address().port;
    const baseUrl = `http://localhost:${port}`;

    // 1. Probar acceso no autorizado
    http.get(`${baseUrl}/api/status`, (res) => {
      assert.strictEqual(res.statusCode, 401, 'Debe retornar 401 sin sesion');

      // 2. Probar login fallido
      const invalidData = JSON.stringify({ username: 'admin', password: 'wrongpassword' });
      const reqFail = http.request({
        hostname: 'localhost',
        port: port,
        path: '/api/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': invalidData.length
        }
      }, (resFail) => {
        assert.strictEqual(resFail.statusCode, 400, 'Debe retornar 400 con clave invalida');

        // 3. Probar login exitoso
        const validData = JSON.stringify({ username: 'admin', password: 'satdes2155' });
        const reqSuccess = http.request({
          hostname: 'localhost',
          port: port,
          path: '/api/login',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': validData.length
          }
        }, (resSuccess) => {
          assert.strictEqual(resSuccess.statusCode, 200, 'Debe retornar 200 con clave valida');
          const setCookie = resSuccess.headers['set-cookie'];
          assert.ok(setCookie, 'Debe retornar una cookie de sesion');
          const cookie = setCookie[0].split(';')[0];

          // 4. Probar acceso autorizado
          const reqStatus = http.request({
            hostname: 'localhost',
            port: port,
            path: '/api/status',
            method: 'GET',
            headers: {
              'Cookie': cookie
            }
          }, (resStatus) => {
            assert.strictEqual(resStatus.statusCode, 200, 'Debe retornar 200 con sesion activa');
            
            let body = '';
            resStatus.on('data', chunk => body += chunk);
            resStatus.on('end', () => {
              const data = JSON.parse(body);
              assert.ok(data.uptime, 'Debe incluir la propiedad uptime');

              // 5. Probar logout
              const reqLogout = http.request({
                hostname: 'localhost',
                port: port,
                path: '/api/logout',
                method: 'POST',
                headers: {
                  'Cookie': cookie
                }
              }, (resLogout) => {
                assert.strictEqual(resLogout.statusCode, 200, 'Debe retornar 200 al hacer logout');
                server.close();
                done();
              });
              reqLogout.end();
            });
          });
          reqStatus.end();
        });
        reqSuccess.write(validData);
        reqSuccess.end();
      });
      reqFail.write(invalidData);
      reqFail.end();
    });
  });
});
