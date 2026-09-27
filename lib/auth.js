const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AUTH_PATH = path.join(__dirname, '..', 'auth.json');
const DEFAULT_PASSWORD = 'password';

const activeSessions = new Set();

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string' || !storedHash.includes(':')) return false;
  const [salt, originalHash] = storedHash.split(':');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === originalHash;
}

function loadAuth() {
  try {
    if (fs.existsSync(AUTH_PATH)) {
      const data = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf8'));
      if (data && data.passwordHash) return data;
    }
  } catch (err) {
    console.error('[Auth] Error reading auth.json:', err.message);
  }

  const defaultAuth = {
    passwordHash: hashPassword(DEFAULT_PASSWORD),
    updatedAt: new Date().toISOString()
  };
  saveAuth(defaultAuth);
  return defaultAuth;
}

function saveAuth(authData) {
  try {
    fs.writeFileSync(AUTH_PATH, JSON.stringify(authData, null, 2), 'utf8');
  } catch (err) {
    console.error('[Auth] Error saving auth.json:', err.message);
  }
}

function authenticatePassword(password) {
  const authData = loadAuth();
  return verifyPassword(password, authData.passwordHash);
}

function updatePassword(currentPassword, newPassword) {
  if (!authenticatePassword(currentPassword)) {
    return { success: false, message: 'Current password is incorrect' };
  }
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 4) {
    return { success: false, message: 'New password must be at least 4 characters long' };
  }

  const newHash = hashPassword(newPassword);
  saveAuth({
    passwordHash: newHash,
    updatedAt: new Date().toISOString()
  });

  activeSessions.clear();
  return { success: true };
}

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  activeSessions.add(token);
  return token;
}

function revokeSession(token) {
  if (token) activeSessions.delete(token);
}

function parseCookies(cookieHeader) {
  const list = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    if (parts.length >= 2) {
      list[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
  });
  return list;
}

function isValidSession(req) {
  if (process.env.DISABLE_AUTH === 'true') {
    return true;
  }

  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const headerToken = req.headers['x-session-token'] || '';
  const queryToken = req.query ? req.query.token : '';
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies.session_token || '';

  const token = bearerToken || headerToken || cookieToken || queryToken;

  if (token && activeSessions.has(token)) {
    return true;
  }
  return false;
}

function requireAuthMiddleware(req, res, next) {
  if (process.env.DISABLE_AUTH === 'true') {
    return next();
  }

  const pathName = (req.path || '').toLowerCase();

  if (pathName === '/login' || pathName === '/v1/auth/login' || pathName === '/health' || pathName.startsWith('/assets/')) {
    return next();
  }

  if (isValidSession(req)) {
    return next();
  }

  const accepts = req.headers.accept || '';
  if (accepts.includes('text/html') || pathName === '/' || pathName === '/docs') {
    return res.redirect('/login');
  }

  return res.status(401).json({
    error: {
      message: 'Unauthorized: login required',
      type: 'unauthorized'
    }
  });
}

loadAuth();

module.exports = {
  loadAuth,
  authenticatePassword,
  updatePassword,
  createSession,
  revokeSession,
  isValidSession,
  requireAuthMiddleware,
  activeSessions
};
