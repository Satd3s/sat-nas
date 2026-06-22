const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cookieParser('sat_nas_secret_key_12345')); // Firmar cookies

// Cargar configuracion
const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Middleware de autenticacion
function requireAuth(req, res, next) {
  const { session_token } = req.signedCookies;
  if (session_token && session_token === 'active_admin_session') {
    return next();
  }
  res.status(401).json({ error: 'UNAUTHORIZED' });
}

// API Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === config.username && password === config.password_hash) {
    res.cookie('session_token', 'active_admin_session', { signed: true, httpOnly: true });
    return res.json({ success: true });
  }
  res.status(400).json({ error: 'INVALID_CREDENTIALS' });
});

// API Logout
app.post('/api/logout', (req, res) => {
  res.clearCookie('session_token');
  res.json({ success: true });
});

app.get('/api/status', requireAuth, (req, res) => {
  res.json({ status: 'OK' });
});

if (require.main === module) {
  app.listen(8090, () => console.log('Server active on port 8090'));
} else {
  module.exports = app; // Para tests
}
