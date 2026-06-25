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
