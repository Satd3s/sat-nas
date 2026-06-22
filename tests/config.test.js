const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('path');

test('Carga de configuracion valida', () => {
  const configPath = path.join(__dirname, '../config.json');
  assert.strictEqual(fs.existsSync(configPath), true, 'El archivo config.json debe existir');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.strictEqual(config.username, 'admin', 'El usuario por defecto debe ser admin');
  assert.strictEqual(config.password_hash, 'satdes2155', 'La contraseña por defecto debe ser satdes2155');
});
