const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const app = require('../server.js');

test('Validar endpoints de accion con y sin sesion', (t, done) => {
  const server = app.listen(0, () => {
    const port = server.address().port;
    const baseUrl = `http://localhost:${port}`;

    // 1. Probar acceso no autorizado a /api/actions/restart-network
    const reqUnauth = http.request({
      hostname: 'localhost',
      port: port,
      path: '/api/actions/restart-network',
      method: 'POST'
    }, (resUnauth) => {
      assert.strictEqual(resUnauth.statusCode, 401);

      // Ahora iniciamos sesion
      const loginData = JSON.stringify({ username: 'admin', password: 'satdes2155' });
      const reqLogin = http.request({
        hostname: 'localhost',
        port: port,
        path: '/api/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': loginData.length
        }
      }, (resLogin) => {
        assert.strictEqual(resLogin.statusCode, 200);
        const cookie = resLogin.headers['set-cookie'][0].split(';')[0];

        // 2. Probar restart-network
        const reqRestart = http.request({
          hostname: 'localhost',
          port: port,
          path: '/api/actions/restart-network',
          method: 'POST',
          headers: { 'Cookie': cookie }
        }, (resRestart) => {
          assert.strictEqual(resRestart.statusCode, 200);
          let bodyRestart = '';
          resRestart.on('data', chunk => bodyRestart += chunk);
          resRestart.on('end', () => {
            const data = JSON.parse(bodyRestart);
            assert.strictEqual(data.success, true);
            assert.ok(data.output);

            // 3. Probar fix-usb
            const reqFix = http.request({
              hostname: 'localhost',
              port: port,
              path: '/api/actions/fix-usb',
              method: 'POST',
              headers: { 'Cookie': cookie }
            }, (resFix) => {
              assert.strictEqual(resFix.statusCode, 200);
              let bodyFix = '';
              resFix.on('data', chunk => bodyFix += chunk);
              resFix.on('end', () => {
                const dataFix = JSON.parse(bodyFix);
                assert.strictEqual(dataFix.success, true);
                assert.ok(dataFix.output);

                // 4. Probar docker-toggle
                const dockerData = JSON.stringify({ name: 'adguardhome', action: 'stop' });
                const reqDocker = http.request({
                  hostname: 'localhost',
                  port: port,
                  path: '/api/actions/docker-toggle',
                  method: 'POST',
                  headers: {
                    'Cookie': cookie,
                    'Content-Type': 'application/json',
                    'Content-Length': dockerData.length
                  }
                }, (resDocker) => {
                  assert.strictEqual(resDocker.statusCode, 200);
                  let bodyDocker = '';
                  resDocker.on('data', chunk => bodyDocker += chunk);
                  resDocker.on('end', () => {
                    const dataDocker = JSON.parse(bodyDocker);
                    assert.strictEqual(dataDocker.success, true);

                    // 5. Probar diagnose (ping)
                    const diagData = JSON.stringify({ command: 'ping', target: 'google.com' });
                    const reqDiag = http.request({
                      hostname: 'localhost',
                      port: port,
                      path: '/api/actions/diagnose',
                      method: 'POST',
                      headers: {
                        'Cookie': cookie,
                        'Content-Type': 'application/json',
                        'Content-Length': diagData.length
                      }
                    }, (resDiag) => {
                      assert.strictEqual(resDiag.statusCode, 200);
                      let bodyDiag = '';
                      resDiag.on('data', chunk => bodyDiag += chunk);
                      resDiag.on('end', () => {
                        const dataDiag = JSON.parse(bodyDiag);
                        assert.ok(dataDiag.output);
                        server.close();
                        done();
                      });
                    });
                    reqDiag.write(diagData);
                    reqDiag.end();
                  });
                });
                reqDocker.write(dockerData);
                reqDocker.end();
              });
            });
            reqFix.end();
          });
        });
        reqRestart.end();
      });
      reqLogin.write(loginData);
      reqLogin.end();
    });
    reqUnauth.end();
  });
});
