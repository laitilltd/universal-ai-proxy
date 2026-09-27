const express = require('express');
const path = require('path');
require('dotenv').config();

const freemodels = require('./providers/freemodels');
const unlimitedai = require('./providers/unlimitedai');
const aibanglachat = require('./providers/aibanglachat');
const aichatting = require('./providers/aichatting');
const eye2ai = require('./providers/eye2ai');
const duckai = require('./providers/duckai');
const custom = require('./providers/custom');
const auto = require('./providers/auto');
const combos = require('./providers/combos');
const logger = require('./lib/logger');
const auth = require('./lib/auth');

const app = express();
app.use(express.json({ limit: '64mb' }));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use(auth.requireAuthMiddleware);

// Auth endpoints
app.post('/v1/auth/login', (req, res) => {
  const { password } = req.body || {};
  if (!password || !auth.authenticatePassword(password)) {
    return res.status(401).json({ error: { message: 'Incorrect password', type: 'unauthorized' } });
  }
  const token = auth.createSession();
  res.setHeader('Set-Cookie', `session_token=${token}; Path=/; SameSite=Lax`);
  return res.json({ status: 'ok', token });
});

app.post('/v1/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const headerToken = req.headers['x-session-token'] || '';
  const token = bearerToken || headerToken;
  auth.revokeSession(token);
  res.setHeader('Set-Cookie', 'session_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  return res.json({ status: 'ok' });
});

app.post('/v1/auth/change-password', (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const result = auth.updatePassword(currentPassword, newPassword);
  if (!result.success) {
    return res.status(400).json({ error: { message: result.message } });
  }
  res.setHeader('Set-Cookie', 'session_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  return res.json({ status: 'ok', message: 'Password updated successfully' });
});

app.get('/login', (req, res) => {
  if (auth.isValidSession(req)) {
    return res.redirect('/');
  }
  res.setHeader('Content-Type', 'text/html');
  res.send('<!DOCTYPE html>' +
'<html lang="en">' +
'<head>' +
'  <meta charset="UTF-8">' +
'  <meta name="viewport" content="width=device-width, initial-scale=1.0">' +
'  <title>Login - Universal AI Proxy</title>' +
'  <link href="/assets/css/bootstrap.min.css" rel="stylesheet">' +
'  <link href="/assets/css/sweetalert2.min.css" rel="stylesheet">' +
'  <script src="/assets/js/sweetalert2.all.min.js"></script>' +
'  <style>' +
'    body { background: #0b1120; color: #f8fafc; font-family: "Segoe UI", system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }' +
'    .login-card { background: #0f172a; border: 1px solid #1e293b; border-radius: 16px; padding: 32px; width: 100%; max-width: 400px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }' +
'    .brand-title { font-weight: 800; font-size: 1.25rem; background: linear-gradient(135deg, #60a5fa, #c084fc); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }' +
'    .form-control { background: #0b1120; border: 1px solid #334155; color: #ffffff; border-radius: 10px; padding: 10px 14px; }' +
'    .form-control::placeholder { color: #a1a1aa !important; opacity: 1 !important; -webkit-text-fill-color: #a1a1aa !important; }' +
'    .form-control:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.25); background: #0b1120; color: #fff; }' +
'    .btn-login { background: linear-gradient(135deg, #6366f1, #a855f7); border: none; font-weight: 700; padding: 10px; border-radius: 10px; transition: transform 0.15s, opacity 0.15s; }' +
'    .btn-login:hover { transform: translateY(-1px); opacity: 0.95; }' +
'    .note-box { background: rgba(59,130,246,0.08); border: 1px solid rgba(59,130,246,0.2); border-radius: 10px; padding: 10px 12px; font-size: 0.8rem; color: #94a3b8; }' +
'  </style>' +
'</head>' +
'<body>' +
'  <div class="login-card">' +
'    <div class="text-center mb-4">' +
'      <div class="fs-1 mb-2">🔒</div>' +
'      <div class="brand-title">Universal AI Proxy</div>' +
'      <div class="small text-secondary mt-1">Admin authentication required</div>' +
'    </div>' +
'    <form id="loginForm" onsubmit="handleLogin(event)">' +
'      <div class="mb-3">' +
'        <label class="form-label small text-secondary text-uppercase fw-bold" style="letter-spacing:0.8px;">Password</label>' +
'        <input type="password" id="loginPassword" class="form-control" placeholder="Enter admin password" required autofocus>' +
'      </div>' +
'      <div id="loginError" class="alert alert-danger py-2 px-3 small d-none mb-3"></div>' +
'      <button type="submit" id="loginBtn" class="btn btn-primary btn-login w-100 mb-3">Log In</button>' +
'    </form>' +
'    <div class="note-box text-center">' +
'      Default admin password: <code>password</code><br>' +
'      <span class="small" style="font-size: 0.72rem;">You can change this password after logging in.</span>' +
'    </div>' +
'  </div>' +
'  <script>' +
'    async function handleLogin(e) {' +
'      e.preventDefault();' +
'      const password = document.getElementById("loginPassword").value;' +
'      const errorDiv = document.getElementById("loginError");' +
'      const btn = document.getElementById("loginBtn");' +
'      errorDiv.classList.add("d-none");' +
'      btn.disabled = true;' +
'      btn.textContent = "Authenticating...";' +
'      try {' +
'        const resp = await fetch("/v1/auth/login", {' +
'          method: "POST",' +
'          headers: { "Content-Type": "application/json" },' +
'          body: JSON.stringify({ password })' +
'        });' +
'        const data = await resp.json();' +
'        if (resp.ok && data.status === "ok") {' +
'          if (data.token) {' +
'            localStorage.setItem("up_session_token", data.token);' +
'            document.cookie = "session_token=" + data.token + "; Path=/; SameSite=Lax";' +
'          }' +
'          window.location.href = "/";' +
'        } else {' +
'          errorDiv.textContent = (data.error && data.error.message) || "Incorrect password";' +
'          errorDiv.classList.remove("d-none");' +
'        }' +
'      } catch (err) {' +
'        errorDiv.textContent = "Network error: " + err.message;' +
'        errorDiv.classList.remove("d-none");' +
'      } finally {' +
'        btn.disabled = false;' +
'        btn.textContent = "Log In";' +
'      }' +
'    }' +
'  </script>' +
'</body>' +
'</html>');
});

function generateId() {
  return 'chatcmpl-' + Math.random().toString(36).substring(2, 14);
}

function extractPromptPreview(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return '';
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUser) return '';
  const c = lastUser.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c.filter(p => p.type === 'text' && p.text).map(p => p.text).join(' ');
  }
  return c ? String(c) : '';
}

function getProviderFromModel(modelId) {
  const m = (modelId || '').toLowerCase();
  if (m === 'auto' || m.startsWith('auto/')) return 'auto';
  if (m.startsWith('combo/')) return 'combo';
  if (m.includes('/')) return m.split('/')[0];
  return 'unknown';
}

function createLoggingResponse(res, reqInfo, startTime) {
  let accumulatedStreamText = '';
  let streamError = null;
  let logged = false;

  const originalJson = res.json.bind(res);
  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);
  const originalStatus = res.status ? res.status.bind(res) : null;

  function doLog(status, responseText, errorMsg, extraModel) {
    if (logged) return;
    logged = true;
    const durationMs = Date.now() - startTime;
    logger.addLog({
      ...reqInfo,
      actualModel: extraModel || reqInfo.actualModel || reqInfo.model,
      status: status || res.statusCode || 200,
      durationMs,
      response: responseText || '',
      error: errorMsg || null
    });
  }

  if (originalStatus) {
    res.status = function (code) {
      res.statusCode = code;
      return originalStatus(code);
    };
  }

  res.json = function (data) {
    let text = '';
    let err = null;
    let actualMdl = data?.model || null;
    if (data?.error) {
      err = data.error.message || String(data.error);
    } else if (data?.choices?.[0]?.message?.content) {
      text = data.choices[0].message.content;
    }
    doLog(res.statusCode || 200, text, err, actualMdl);
    return originalJson(data);
  };

  res.write = function (chunk, encoding, cb) {
    if (typeof chunk === 'string' || Buffer.isBuffer(chunk)) {
      const str = String(chunk);
      for (const line of str.split('\n')) {
        const t = line.trim();
        if (t.startsWith('data:')) {
          const j = t.slice(5).trim();
          if (j && j !== '[DONE]') {
            try {
              const p = JSON.parse(j);
              if (p.model) reqInfo.actualModel = p.model;
              if (p.error) streamError = p.error.message || String(p.error);
              const content = p.choices?.[0]?.delta?.content || p.choices?.[0]?.message?.content || '';
              if (content) accumulatedStreamText += content;
            } catch {}
          }
        }
      }
    }
    return originalWrite(chunk, encoding, cb);
  };

  res.end = function (chunk, encoding, cb) {
    if (chunk) {
      if (typeof chunk === 'string' || Buffer.isBuffer(chunk)) {
        const str = String(chunk);
        for (const line of str.split('\n')) {
          const t = line.trim();
          if (t.startsWith('data:')) {
            const j = t.slice(5).trim();
            if (j && j !== '[DONE]') {
              try {
                const p = JSON.parse(j);
                if (p.model) reqInfo.actualModel = p.model;
                if (p.error) streamError = p.error.message || String(p.error);
                const content = p.choices?.[0]?.delta?.content || p.choices?.[0]?.message?.content || '';
                if (content) accumulatedStreamText += content;
              } catch {}
            }
          }
        }
      }
    }
    doLog(res.statusCode || 200, accumulatedStreamText, streamError, reqInfo.actualModel);
    return originalEnd(chunk, encoding, cb);
  };

  return res;
}

function requireAdminAuth(req, res, next) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) return next();

  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const xAdminKey = req.headers['x-admin-key'] || '';
  const queryKey = req.query.admin_key || '';

  if (bearerToken === adminKey || xAdminKey === adminKey || queryKey === adminKey) {
    return next();
  }

  return res.status(401).json({
    error: {
      message: 'Unauthorized: missing or invalid admin key (ADMIN_KEY protection enabled)',
      type: 'unauthorized'
    }
  });
}

const MODEL_ALIAS_MAP = {
  'duck-gpt-luna':   'duckai/gpt-5.6-luna',
  'duck-haiku':      'duckai/claude-haiku-4-5',
  'eye2-chatgpt':    'eye2ai/chatgpt',
  'eye2-gemini':     'eye2ai/gemini',
  'gpt-5.6-luna':    'aichatting/gpt-5.6-luna',
  'ask-ai':          'aichatting/ask-ai',
  'bangla-ai':       'aibanglachat/bangla-ai',
  'bangla-ai-web':   'aibanglachat/bangla-ai-web',
  'chatgpt':         'unlimitedai/chatgpt',
  'gemini':          'unlimitedai/gemini',
  'deepseek':        'unlimitedai/deepseek',
  'claude':          'unlimitedai/claude',
  'grok':            'unlimitedai/grok',
  'perplexity':      'unlimitedai/perplexity',
  'meta':            'unlimitedai/meta',
  'qwen':            'unlimitedai/qwen',
  'claude-sonnet-5': 'freemodels/claude-sonnet-5',
  'gpt-5.6-sol':     'freemodels/gpt-5.6-sol',
  'glm-5.2':         'freemodels/glm-5.2',
  'kimi-k3':         'freemodels/kimi-k3',
};

function resolveModelAlias(requestedModel) {
  if (!requestedModel) return requestedModel;

  const raw = String(requestedModel).trim();
  const lower = raw.toLowerCase();

  if (raw.includes('/')) {
    const parts = raw.split('/');
    const providerId = parts[0];
    const subModel = parts.slice(1).join('/');

    const customProviders = custom.getProviders();
    const cp = customProviders.find(p => p.id.toLowerCase() === providerId.toLowerCase());
    if (cp && cp.models) {
      const match = cp.models.find(m => (typeof m === 'string' ? m : m.id).toLowerCase() === subModel.toLowerCase());
      if (match) {
        const exactSub = typeof match === 'string' ? match : (match.id || subModel);
        return cp.id + '/' + exactSub;
      }
    }
    return raw;
  }

  const customProviders = custom.getProviders();
  for (const cp of customProviders) {
    if (cp.models) {
      const match = cp.models.find(m => (typeof m === 'string' ? m : m.id).toLowerCase() === lower);
      if (match) {
        const exactSub = typeof match === 'string' ? match : (match.id || raw);
        return cp.id + '/' + exactSub;
      }
    }
  }

  if (MODEL_ALIAS_MAP[lower]) {
    return MODEL_ALIAS_MAP[lower];
  }

  const builtinProviders = [freemodels, duckai, eye2ai, unlimitedai, aichatting, aibanglachat];
  for (const bp of builtinProviders) {
    if (typeof bp.getModels === 'function') {
      const models = bp.getModels();
      const match = models.find(m => {
        const id = (m.id || '').toLowerCase();
        const shortName = id.includes('/') ? id.slice(id.indexOf('/') + 1) : id;
        return shortName === lower;
      });
      if (match) return match.id;
    }
  }

  return raw;
}

const PROVIDER_ROUTES = [
  { prefix: 'aibanglachat/', handler: aibanglachat },
  { prefix: 'duckai/',       handler: duckai },
  { prefix: 'eye2ai/',       handler: eye2ai },
  { prefix: 'aichatting/',   handler: aichatting },
  { prefix: 'unlimitedai/',  handler: unlimitedai },
  { prefix: 'freemodels/',   handler: freemodels },
];

// Custom Provider CRUD endpoints
app.get('/v1/custom-providers', (req, res) => {
  res.json({ object: 'list', data: custom.getProviders() });
});

app.post('/v1/custom-providers', requireAdminAuth, async (req, res) => {
  try {
    const { id, name, type, url, apiKey, models } = req.body;
    const providerType = (type || 'openai').toLowerCase();

    if (providerType === 'openai' && !url) {
      return res.status(400).json({ error: { message: 'URL is required for OpenAI-compatible providers' } });
    }

    const newProvider = await custom.addProvider({ id, name, type: providerType, url, apiKey, models });
    res.json({ status: 'ok', provider: newProvider });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

app.delete('/v1/custom-providers/:id', requireAdminAuth, (req, res) => {
  try {
    const result = custom.removeProvider(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

app.post('/v1/custom-providers/:id/refresh', requireAdminAuth, async (req, res) => {
  try {
    const models = await custom.refreshProviderModels(req.params.id);
    res.json({ status: 'ok', models });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

// Custom Combo Routers CRUD endpoints
app.get('/v1/combos', (req, res) => {
  res.json({
    object: 'list',
    data: combos.getCombos(),
    autoSequence: combos.getAutoSequence()
  });
});

app.post('/v1/combos', requireAdminAuth, (req, res) => {
  try {
    const { id, name, sequence } = req.body;
    const newCombo = combos.saveCombo({ id, name, sequence });
    res.json({ status: 'ok', combo: newCombo });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

app.post('/v1/combos/auto-sequence', requireAdminAuth, (req, res) => {
  try {
    const { sequence } = req.body;
    const updated = combos.setAutoSequence(sequence);
    res.json({ status: 'ok', autoSequence: updated });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

app.delete('/v1/combos/:id', requireAdminAuth, (req, res) => {
  try {
    const result = combos.removeCombo(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

// Unified models endpoint
app.get('/v1/models', (req, res) => {
  const allModels = [
    ...auto.getModels(),
    ...combos.getModels(),
    ...freemodels.getModels(),
    ...unlimitedai.getModels(),
    ...aibanglachat.getModels(),
    ...aichatting.getModels(),
    ...eye2ai.getModels(),
    ...duckai.getModels(),
    ...custom.getModels(),
  ];
  res.json({ object: 'list', data: allModels });
});

// Logs API endpoints
app.get('/v1/logs', (req, res) => {
  const all = logger.getLogs();
  const since = parseInt(req.query.since, 10);
  if (Number.isFinite(since)) {
    // Incremental sync: the UI polls every 2s, so only ship entries the
    // client has not seen yet instead of the whole 300-entry buffer.
    return res.json({ object: 'list', data: all.filter(l => l.id > since), total: all.length });
  }
  res.json({ object: 'list', data: all });
});

app.delete('/v1/logs', requireAdminAuth, (req, res) => {
  res.json(logger.clearLogs());
});

// Unified chat completions endpoint
app.post('/v1/chat/completions', async (req, res) => {
  const startTime = Date.now();
  const rawModel = req.body.model || req.body.modelId || '';
  let requestedModel = resolveModelAlias(rawModel);
  req.body.model = req.body.modelId = requestedModel;

  // Single canonical web-search flag: accept the snake_case alias, never forward both
  if (req.body.webSearch === undefined && req.body.web_search !== undefined) {
    req.body.webSearch = req.body.web_search;
  }
  delete req.body.web_search;

  const reqInfo = {
    provider: getProviderFromModel(requestedModel),
    model: requestedModel,
    stream: req.body.stream !== false,
    webSearch: !!req.body.webSearch,
    prompt: extractPromptPreview(req.body.messages)
  };
  const loggingRes = createLoggingResponse(res, reqInfo, startTime);

  // 0. Auto Failback Router
  if (requestedModel === 'auto' || requestedModel.startsWith('auto/')) {
    return auto.handleChat(req.body, loggingRes, generateId, req.headers, combos.getAutoSequence());
  }

  // 0b. Custom Combo Router
  if (requestedModel.startsWith('combo/')) {
    const comboObj = combos.getComboById(requestedModel);
    if (!comboObj || !Array.isArray(comboObj.sequence) || comboObj.sequence.length === 0) {
      const known = combos.getCombos().map(c => 'combo/' + c.id).join(', ') || 'none';
      return loggingRes.status(404).json({
        error: {
          message: `Combo router '${requestedModel}' not found or empty. Available combos: ${known}`,
          type: 'invalid_request_error'
        }
      });
    }
    return auto.handleChat(req.body, loggingRes, generateId, req.headers, comboObj.sequence);
  }

  // 1. Check custom providers
  const customProviders = custom.getProviders();
  const isCustom = customProviders.some(p => {
    const prefix = p.id.toLowerCase();
    if (requestedModel.startsWith(prefix + '/')) return true;
    if (p.models && p.models.some(m => (typeof m === 'string' ? m : m.id).toLowerCase() === requestedModel)) return true;
    return false;
  });
  if (isCustom) return custom.handleChat(req.body, loggingRes, generateId, req.headers);

  // 2. Built-in providers (first match wins)
  for (const route of PROVIDER_ROUTES) {
    if (requestedModel.startsWith(route.prefix)) {
      return route.handler.handleChat(req.body, loggingRes, generateId);
    }
  }

  // 3. Unknown model: let custom handle it (it produces the 404)
  return custom.handleChat(req.body, loggingRes, generateId, req.headers);
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    providers: ['auto', 'eye2ai','aibanglachat', 'aichatting', 'freemodels', 'unlimitedai',    'duckai', 'custom'],
    customProvidersCount: custom.getProviders().length,
    autoCandidates: auto.getCandidateModels(),
    browsers: {
      unlimitedai: typeof unlimitedai.status === 'function' ? unlimitedai.status() : null,
      duckai: typeof duckai.status === 'function' ? duckai.status() : null
    }
  });
});

// Side-by-Side Dual View UI (Chat & Console Logs)
app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Universal AI Proxy - Side-by-Side Chat & Logs</title>
  <link href="/assets/css/bootstrap.min.css" rel="stylesheet">
  <link href="/assets/css/sweetalert2.min.css" rel="stylesheet">
  <script src="/assets/js/bootstrap.bundle.min.js"></script>
  <script src="/assets/js/sweetalert2.all.min.js"></script>
  <style>
    :root {
      --bg-main: #000000;
      --card-bg: #09090b;
      --card-border: #27272a;
      --header-bg: #18181b;
      --text-bright: #ffffff;
      --text-muted: #a1a1aa;
      --input-bg: #000000;
      --input-border: #3f3f46;
    }
    body { background: #000000; color: var(--text-bright); font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; overflow-x: hidden; }
    .navbar { background: #09090b !important; border-bottom: 1px solid var(--card-border); box-shadow: 0 4px 20px rgba(0,0,0,0.8); }
    .navbar-brand { font-weight: 800; letter-spacing: 0.5px; color: #ffffff !important; background: none; -webkit-text-fill-color: initial; }
    
    .panel-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 14px; box-shadow: 0 8px 32px rgba(0,0,0,0.6); overflow: hidden; }
    .panel-header { background: var(--header-bg); border-bottom: 1px solid var(--card-border); padding: 10px 14px; }
    
    .split-container { display: flex; flex-direction: column; gap: 16px; width: 100%; }
    @media (min-width: 992px) {
      .split-container { flex-direction: row; gap: 0; align-items: stretch; min-height: calc(100vh - 90px); }
      .split-pane { overflow: hidden; display: flex; flex-direction: column; }
      .split-left { width: 50%; }
      .split-right { width: 50%; }
      .split-resizer { width: 14px; cursor: col-resize; display: flex; align-items: center; justify-content: center; position: relative; z-index: 10; margin: 0 -4px; user-select: none; transition: background 0.15s; }
      .split-resizer:hover, .split-resizer.is-dragging { background: rgba(59,130,246,0.15); }
      .resizer-handle { width: 4px; height: 36px; background: #334155; border-radius: 2px; transition: background 0.15s, height 0.15s; }
      .split-resizer:hover .resizer-handle, .split-resizer.is-dragging .resizer-handle { background: #3b82f6; height: 50px; box-shadow: 0 0 10px rgba(59,130,246,0.7); }
    }

    .layout-chat-only .split-left { width: 100% !important; display: flex !important; }
    .layout-chat-only .split-right, .layout-chat-only .split-resizer { display: none !important; }
    
    .layout-logs-only .split-right { width: 100% !important; display: flex !important; }
    .layout-logs-only .split-left, .layout-logs-only .split-resizer { display: none !important; }

    .chat-box { flex: 1; min-height: 380px; max-height: calc(100vh - 215px); overflow-y: auto; padding: 1rem; background: #070a12; border-radius: 8px; border: 1px solid var(--card-border); }
    .logs-box { flex: 1; min-height: 380px; max-height: calc(100vh - 170px); overflow-y: auto; padding: 1rem; background: #070a12; border-radius: 8px; border: 1px solid var(--card-border); }
    
    @media (max-width: 991.98px) {
      .chat-box { height: 480px; max-height: 60vh; }
      .logs-box { height: 380px; max-height: 50vh; }
    }
    @media (max-width: 575.98px) {
      .chat-box { height: 400px; padding: 0.75rem; }
      .logs-box { height: 320px; padding: 0.75rem; }
      .msg { max-width: 95%; font-size: 0.88rem; padding: 10px 12px; }
      .navbar-brand { font-size: 1.05rem !important; }
      .btn-sm { font-size: 0.8rem; padding: 0.25rem 0.5rem; }
    }
    
    .msg { padding: 12px 16px; border-radius: 12px; margin-bottom: 12px; max-width: 88%; word-wrap: break-word; white-space: pre-wrap; font-size: 0.93rem; line-height: 1.55; }
    .msg.user { background: #ffffff; color: #000000; margin-left: auto; border-bottom-right-radius: 3px; border: 1px solid #ffffff; font-weight: 500; }
    .msg.assistant { background: #18181b; border: 1px solid #27272a; border-left: 3px solid #ffffff; color: #ffffff; margin-right: auto; border-bottom-left-radius: 3px; }
    .msg.system { background: #18181b; border: 1px solid #3f3f46; color: #ffffff; margin: 0 auto; text-align: center; font-size: 0.85rem; max-width: 95%; font-weight: 600; border-radius: 10px; }
    .msg pre { background: #000000; border: 1px solid #27272a; padding: 10px 14px; border-radius: 8px; overflow-x: auto; margin: 8px 0 0 0; }
    .msg code { color: #ffffff; font-size: 0.88rem; font-family: 'Consolas', monospace; }
    .msg img.msg-attached-img { max-width: 300px; max-height: 200px; border-radius: 8px; margin-top: 8px; display: block; border: 1px solid #3f3f46; }
    
    .msg-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 10px; padding-top: 8px; border-top: 1px dashed #3f3f46; font-size: 0.76rem; }
    .msg-meta .mm-provider { background: #ffffff; color: #000000; font-weight: 700; letter-spacing: 0.4px; }
    .msg-meta .mm-model { color: #ffffff; font-family: 'Consolas', monospace; font-weight: 600; }
    .msg-meta .mm-auto { background: #27272a; color: #ffffff; border: 1px solid #52525b; font-weight: 600; }
    .msg-meta .mm-time { margin-left: auto; color: #a1a1aa; font-family: monospace; }
    
    #input-area { display: flex; gap: 8px; align-items: center; }
    #input-area textarea { flex: 1; resize: none; background: var(--input-bg); color: #f8fafc; border-color: var(--input-border); border-radius: 8px; font-size: 0.9rem; }
    ::placeholder, .form-control::placeholder, .pm-search::placeholder, .cp-select2-search::placeholder, #input-area textarea::placeholder { color: #a1a1aa !important; opacity: 1 !important; -webkit-text-fill-color: #a1a1aa !important; }
    ::-webkit-input-placeholder { color: #a1a1aa !important; opacity: 1 !important; -webkit-text-fill-color: #a1a1aa !important; }
    ::-moz-placeholder { color: #a1a1aa !important; opacity: 1 !important; }
    #input-area textarea { flex: 1; resize: none; background: var(--input-bg); color: #ffffff; border-color: var(--input-border); border-radius: 8px; font-size: 0.9rem; }
    #input-area textarea:focus { background: #000000; color: #ffffff; border-color: #ffffff; box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.25); }
    
    .form-select, .form-control { background-color: var(--input-bg); color: #ffffff; border-color: var(--input-border); font-size: 0.85rem; }
    .form-select:focus, .form-control:focus { background-color: #000000; color: #ffffff; border-color: #ffffff; box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.25); }
    .form-check-label { color: #cbd5e1; font-size: 0.85rem; }
    .text-secondary, .text-muted { color: #94a3b8 !important; }
    
    optgroup { background: #1e293b; color: #38bdf8; font-weight: bold; }
    option { background: #0f172a; color: #f8fafc; }
    
    .modal-content { background: #0f172a; color: #f8fafc; border: 1px solid #334155; }
    .modal-header { border-bottom-color: #1e293b; }
    .modal-footer { border-top-color: #1e293b; }
    
    .log-card { background: #0f172a; border: 1px solid var(--card-border); border-radius: 10px; margin-bottom: 10px; padding: 12px; transition: border-color 0.2s ease; }
    .log-card:hover { border-color: #334155; }
    .log-header { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 0.78rem; }
    .badge-status-200 { background: #052e16; color: #4ade80; border: 1px solid #166534; font-weight: 600; }
    .badge-status-error { background: #450a0a; color: #fca5a5; border: 1px solid #991b1b; font-weight: 600; }
    .badge-provider { background: #1d4ed8; color: #ffffff; font-weight: 600; }
    .badge-model { background: #1e293b; color: #4ade80; border: 1px solid #334155; font-family: 'Consolas', monospace; }
    .badge-latency { background: #334155; color: #f8fafc; font-weight: 500; }
    .log-time { color: #cbd5e1; margin-left: auto; font-family: monospace; font-size: 0.76rem; }
    .log-prompt { background: #070a12; border: 1px solid #1e293b; border-radius: 6px; padding: 6px 10px; margin-top: 6px; font-size: 0.82rem; color: #93c5fd; white-space: pre-wrap; word-break: break-word; }
    .log-response { background: #070a12; border: 1px solid #1e293b; border-radius: 6px; padding: 6px 10px; margin-top: 6px; font-size: 0.82rem; color: #f8fafc; white-space: pre-wrap; word-break: break-word; max-height: 200px; overflow-y: auto; }
    .log-error { background: #2d0606; border: 1px solid #b91c1c; border-radius: 6px; padding: 6px 10px; margin-top: 6px; font-size: 0.82rem; color: #fca5a5; }
    
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #070a12; }
    ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #475569; }

    /* === Modern Providers / Combo Manager UI === */
    #customProviderModal .modal-content { background: linear-gradient(180deg, #0f172a 0%, #0b1120 100%); border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 24px 64px rgba(0,0,0,0.65); }
    #customProviderModal .modal-header { background: linear-gradient(90deg, rgba(59,130,246,0.14), rgba(168,85,247,0.10)); border-bottom: 1px solid #1e293b; padding: 16px 22px; }
    #customProviderModal .modal-title { font-weight: 700; letter-spacing: 0.3px; display: flex; align-items: center; gap: 10px; }
    #customProviderModal .modal-title .title-ico { font-size: 1.2rem; }
    #customProviderModal .modal-subtitle { font-size: 0.75rem; font-weight: 400; color: #64748b; margin-top: 2px; }
    #customProviderModal .modal-body { padding: 20px 22px; }
    #customProviderModal .modal-footer { background: rgba(11,17,32,0.7); border-top: 1px solid #1e293b; }

    .pm-tabs { display: flex; gap: 6px; background: #0b1120; border: 1px solid #1e293b; border-radius: 12px; padding: 5px; margin-bottom: 18px; }
    .pm-tabs .nav-item { flex: 1; display: flex; }
    .pm-tabs .nav-link { flex: 1; border: none; background: transparent; color: #94a3b8; font-weight: 600; font-size: 0.85rem; padding: 10px 12px; border-radius: 8px; transition: all 0.18s ease; text-align: center; white-space: nowrap; }
    .pm-tabs .nav-link:hover { color: #e2e8f0; background: rgba(51,65,85,0.45); }
    .pm-tabs .nav-link.active { background: linear-gradient(135deg, #6366f1, #a855f7); color: #fff; box-shadow: 0 4px 14px rgba(99,102,241,0.35); }

    .pm-card { background: #0f172a; border: 1px solid #1e293b; border-radius: 14px; padding: 18px; box-shadow: 0 4px 14px rgba(0,0,0,0.25); }
    .pm-section-title { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 0.95rem; color: #e2e8f0; margin: 0 0 4px 0; }
    .pm-section-desc { font-size: 0.78rem; color: #64748b; margin-bottom: 14px; }
    .pm-label { display: block; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; font-weight: 700; margin-bottom: 5px; }

    .pm-pane { background: #0b1120; border: 1px dashed #243044; border-radius: 12px; padding: 10px; height: 330px; overflow-y: auto; transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease; }
    .pm-pane.drop-active { border-color: #6366f1; border-style: solid; background: rgba(99,102,241,0.07); box-shadow: inset 0 0 0 1px rgba(99,102,241,0.4); }
    .pm-pane.warn-pane { border-color: rgba(217,119,6,0.4); }
    .pm-pane.warn-pane.drop-active { border-color: #d97706; background: rgba(217,119,6,0.07); box-shadow: inset 0 0 0 1px rgba(217,119,6,0.4); }
    .pm-pane-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-bottom: 8px; margin-bottom: 8px; border-bottom: 1px solid #1e293b; position: sticky; top: -10px; background: #0b1120; z-index: 3; }
    .pm-pane-title { font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: #60a5fa; display: flex; align-items: center; gap: 6px; }
    .pm-pane.warn-pane .pm-pane-title { color: #fbbf24; }
    .pm-search { background: #0f172a; border: 1px solid #334155; color: #f8fafc; border-radius: 8px; font-size: 0.78rem; padding: 4px 10px; width: 46%; min-width: 110px; }
    .pm-search:focus { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99,102,241,0.25); outline: none; }
    .pm-search::placeholder { color: #64748b; }

    .pm-prov-group { background: #0f172a; border: 1px solid #1e293b; border-radius: 10px; margin-bottom: 8px; overflow: hidden; }
    .pm-prov-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 10px; background: linear-gradient(90deg, rgba(99,102,241,0.12), rgba(99,102,241,0.02)); border-bottom: 1px solid #1e293b; }
    .pm-prov-name { font-family: 'Consolas', monospace; font-weight: 700; font-size: 0.74rem; color: #818cf8; letter-spacing: 0.5px; text-transform: uppercase; }
    .pm-prov-count { font-size: 0.66rem; color: #64748b; background: #0b1120; border: 1px solid #1e293b; border-radius: 20px; padding: 1px 8px; white-space: nowrap; }
    .pm-prov-models { padding: 6px; display: flex; flex-direction: column; gap: 4px; }
    .pm-model-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 8px; background: #0b1120; border: 1px solid #1b2536; border-radius: 8px; transition: border-color 0.15s, transform 0.1s; }
    .pm-model-row:hover { border-color: #6366f1; transform: translateX(3px); }
    .pm-model-name { font-size: 0.77rem; color: #cbd5e1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .pm-add-btn { border: 1px solid #059669; background: rgba(16,185,129,0.12); color: #34d399; font-size: 0.68rem; font-weight: 700; border-radius: 6px; padding: 3px 9px; transition: all 0.15s; white-space: nowrap; flex-shrink: 0; }
    .pm-add-btn:hover { background: #059669; color: #fff; border-color: #059669; transform: scale(1.05); }

    .cp-select2-trigger { background: #0b1120 !important; border: 1px solid #334155 !important; color: #f8fafc !important; cursor: pointer; text-align: left; }
    .cp-select2-trigger:focus, .cp-select2-trigger.active { border-color: #6366f1 !important; box-shadow: 0 0 0 2px rgba(99,102,241,0.25) !important; outline: none; }
    .cp-select2-menu { background: #0f172a !important; border: 1px solid #334155 !important; border-radius: 10px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); padding: 8px; z-index: 1060; }
    .cp-select2-search { background: #0b1120 !important; border: 1px solid #334155 !important; color: #f8fafc !important; border-radius: 6px !important; font-size: 0.8rem !important; }
    .cp-select2-search:focus { border-color: #6366f1 !important; box-shadow: 0 0 0 2px rgba(99,102,241,0.25) !important; outline: none; }
    .cp-select2-option { padding: 6px 10px; border-radius: 6px; cursor: pointer; color: #cbd5e1; font-size: 0.82rem; transition: background 0.12s ease; display: flex; align-items: center; justify-content: space-between; }
    .cp-select2-option:hover { background: #1e293b; color: #818cf8; }
    .cp-select2-option.selected { background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #ffffff; font-weight: 600; }
    .cp-select2-option-tag { font-size: 0.65rem; padding: 1px 6px; border-radius: 4px; background: rgba(255,255,255,0.15); color: inherit; }
    .cp-select2-group-title { font-size: 0.68rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: #818cf8; padding: 6px 8px 2px 8px; margin-top: 4px; border-bottom: 1px solid rgba(255,255,255,0.06); }

    .pm-seq-item { display: flex; align-items: center; gap: 8px; padding: 7px 10px; background: #0f172a; border: 1px solid #1e293b; border-radius: 10px; margin-bottom: 6px; cursor: grab; transition: border-color 0.15s, box-shadow 0.15s, opacity 0.15s; user-select: none; }
    .pm-seq-item:hover { border-color: #334155; box-shadow: 0 2px 8px rgba(0,0,0,0.35); }
    .pm-seq-item.dragging { opacity: 0.35; border-style: dashed; }
    .pm-seq-item .grip { color: #475569; font-size: 0.95rem; letter-spacing: -3px; line-height: 1; flex-shrink: 0; }
    .pm-seq-item:hover .grip { color: #94a3b8; }
    .pm-order { min-width: 27px; height: 22px; display: inline-flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #6366f1, #a855f7); color: #fff; font-size: 0.68rem; font-weight: 800; border-radius: 6px; font-family: 'Consolas', monospace; flex-shrink: 0; }
    .pm-order.warn { background: linear-gradient(135deg, #d97706, #b45309); }
    .pm-seq-model { font-family: 'Consolas', monospace; font-size: 0.75rem; color: #cbd5e1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
    .pm-seq-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; margin-left: auto; }
    .pm-icon-btn { width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid #334155; background: #0b1120; color: #94a3b8; border-radius: 6px; font-size: 0.72rem; line-height: 1; transition: all 0.12s; padding: 0; cursor: pointer; }
    .pm-icon-btn:hover { background: #1e293b; color: #f8fafc; border-color: #475569; transform: scale(1.08); }
    .pm-icon-btn.danger:hover { background: #7f1d1d; color: #fecaca; border-color: #b91c1c; }

    .pm-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 34px 12px; color: #475569; font-size: 0.78rem; text-align: center; }
    .pm-empty .big { font-size: 1.5rem; opacity: 0.8; }

    .pm-combo-card { background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 13px 15px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; gap: 12px; transition: border-color 0.15s, transform 0.12s, box-shadow 0.15s; }
    .pm-combo-card:hover { border-color: #6366f1; transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,0.4); }
    .pm-combo-name { font-weight: 700; font-size: 0.92rem; color: #f8fafc; }
    .pm-combo-id { background: linear-gradient(135deg, #6366f1, #a855f7); color: #fff; font-family: 'Consolas', monospace; font-size: 0.68rem; font-weight: 700; border-radius: 20px; padding: 2px 9px; margin-left: 8px; }
    .pm-combo-seq { font-family: 'Consolas', monospace; font-size: 0.72rem; color: #818cf8; margin-top: 5px; line-height: 1.6; word-break: break-all; }
    .pm-combo-seq .arrow { color: #475569; margin: 0 3px; }

    .pm-prov-card { background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 13px 15px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; gap: 12px; transition: border-color 0.15s, transform 0.12s, box-shadow 0.15s; }
    .pm-prov-card:hover { border-color: #6366f1; transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,0.4); }

    .pm-btn-primary { background: linear-gradient(135deg, #6366f1, #a855f7) !important; border: none !important; color: #fff !important; font-weight: 600; box-shadow: 0 4px 14px rgba(99,102,241,0.3); transition: all 0.15s; }
    .pm-btn-primary:hover { filter: brightness(1.15); transform: translateY(-1px); box-shadow: 0 6px 18px rgba(168,85,247,0.4); color: #fff !important; }
    .pm-btn-emerald { background: linear-gradient(135deg, #059669, #10b981) !important; border: none !important; color: #fff !important; font-weight: 600; box-shadow: 0 4px 14px rgba(16,185,129,0.3); transition: all 0.15s; }
    .pm-btn-emerald:hover { filter: brightness(1.15); transform: translateY(-1px); box-shadow: 0 6px 18px rgba(16,185,129,0.4); color: #fff !important; }
    .pm-drop-hint { font-size: 0.7rem; color: #475569; font-weight: 400; text-transform: none; letter-spacing: 0; }

    /* Toast notifications */
    .pm-toast-wrap { position: fixed; top: 18px; right: 18px; z-index: 3000; display: flex; flex-direction: column; gap: 8px; max-width: 340px; }
    .pm-toast { display: flex; align-items: flex-start; gap: 10px; padding: 11px 14px; border-radius: 12px; font-size: 0.83rem; color: #f8fafc; background: #0f172a; border: 1px solid #334155; box-shadow: 0 10px 30px rgba(0,0,0,0.55); animation: pmToastIn 0.25s ease; }
    .pm-toast.success { border-color: #166534; background: linear-gradient(135deg, rgba(22,101,52,0.35), #0f172a); }
    .pm-toast.error { border-color: #b91c1c; background: linear-gradient(135deg, rgba(127,29,29,0.4), #0f172a); }
    .pm-toast.out { opacity: 0; transform: translateX(20px); transition: all 0.3s ease; }
    @keyframes pmToastIn { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: none; } }
  </style>
</head>
<body>
  <nav class="navbar navbar-dark px-3 py-2 sticky-top" style="background: rgba(15,23,42,0.85); backdrop-filter: blur(12px); border-bottom: 1px solid #1e293b;">
    <div class="container-fluid px-0">
      <div class="d-flex align-items-center gap-2">
        <span class="navbar-brand mb-0 h1 fs-5 fw-bold" style="background: linear-gradient(135deg, #60a5fa, #c084fc); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Universal AI Proxy</span>
        <span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2 py-1 small d-none d-md-inline-block">🟢 Active</span>
      </div>

      <!-- View Mode Switcher (Desktop/Tablet) -->
      <div class="btn-group btn-group-sm d-none d-md-inline-flex" role="group" aria-label="Layout view mode">
        <button type="button" id="btnViewSplit" class="btn btn-primary px-2 py-1 small active" onclick="setLayoutMode('split')" title="Split View">⚡ Split</button>
        <button type="button" id="btnViewChat" class="btn btn-outline-secondary px-2 py-1 small" onclick="setLayoutMode('chat')" title="Full Chat">💬 Chat</button>
        <button type="button" id="btnViewLogs" class="btn btn-outline-secondary px-2 py-1 small" onclick="setLayoutMode('logs')" title="Full Logs">📋 Logs</button>
      </div>

      <div class="d-flex align-items-center gap-2">
        <button class="btn btn-sm pm-btn-emerald px-3 fw-semibold" data-bs-toggle="modal" data-bs-target="#customProviderModal" onclick="loadCustomProvidersList()">Providers</button>
        <a href="/docs" class="btn btn-sm btn-outline-light">API</a>
        <button class="btn btn-sm btn-outline-warning" data-bs-toggle="modal" data-bs-target="#changePasswordModal" title="Change Admin Password">🔑 Password</button>
        <button class="btn btn-sm btn-outline-danger" onclick="handleLogout()" title="Log out">🚪 Logout</button>
      </div>
    </div>
  </nav>

  <div class="container-fluid px-3 py-3">
    <div class="split-container" id="splitContainer">
      <!-- Left Column: Chatting Feature -->
      <div class="split-pane split-left" id="chatPane">
        <div class="panel-card p-3 mb-0 h-100 d-flex flex-column">
          <div class="row g-2 align-items-center mb-2">
            <div class="col-auto">
              <span class="fw-bold text-info me-1 fs-6">💬 Chat</span>
            </div>
            <!-- Searchable Provider Select -->
            <div class="col-6 col-sm-auto" style="min-width: 140px;">
              <select id="providerSelect" class="d-none" onchange="filterModels()" title="Filter by Provider">
                <option value="all">All Providers</option>
              </select>
              <div class="prov-select2-container position-relative">
                <button type="button" id="provSelect2Trigger" class="form-select form-select-sm text-start d-flex align-items-center justify-content-between cp-select2-trigger" onclick="toggleProvSelect2Menu(event)">
                  <span id="provSelect2Label" class="text-truncate">All Providers</span>
                </button>
                <div id="provSelect2Menu" class="cp-select2-menu d-none position-absolute mt-1" style="left:0; top:100%; width: 220px; z-index: 1055;">
                  <div class="mb-2">
                    <input type="text" id="provSelect2Search" class="form-control form-control-sm cp-select2-search" placeholder="🔍 Search provider..." oninput="filterProvSelect2Options()" onclick="event.stopPropagation()">
                  </div>
                  <div id="provSelect2Options" class="cp-select2-options-list" style="max-height: 200px; overflow-y: auto;">
                    <!-- Provider options -->
                  </div>
                </div>
              </div>
            </div>

            <!-- Searchable Model Select -->
            <div class="col-12 col-sm">
              <input type="hidden" id="modelSearch" value="">
              <select id="model" class="d-none" title="Select Model">
                <!-- Dynamically loaded & filtered models -->
              </select>
              <div class="model-select2-container position-relative">
                <button type="button" id="modelSelect2Trigger" class="form-select form-select-sm text-start d-flex align-items-center justify-content-between cp-select2-trigger" onclick="toggleModelSelect2Menu(event)">
                  <span id="modelSelect2Label" class="text-truncate">Select Model...</span>
                </button>
                <div id="modelSelect2Menu" class="cp-select2-menu d-none position-absolute w-100 mt-1" style="left:0; top:100%; min-width: 260px; z-index: 1055;">
                  <div class="mb-2">
                    <input type="text" id="modelSelect2Search" class="form-control form-control-sm cp-select2-search" placeholder="🔍 Search model by name or ID..." oninput="filterModelSelect2Options()" onclick="event.stopPropagation()">
                  </div>
                  <div id="modelSelect2Options" class="cp-select2-options-list" style="max-height: 240px; overflow-y: auto;">
                    <!-- Model options grouped by provider -->
                  </div>
                </div>
              </div>
            </div>
            <div class="col-auto ms-auto d-flex align-items-center gap-2">
              <div class="form-check form-switch mb-0">
                <input class="form-check-input" type="checkbox" id="webSearchToggle" checked>
                <label class="form-check-label text-nowrap small fw-medium" for="webSearchToggle">Search</label>
              </div>
              <div class="form-check form-switch mb-0">
                <input class="form-check-input" type="checkbox" id="streamToggle" checked>
                <label class="form-check-label text-nowrap small fw-medium" for="streamToggle">Stream</label>
              </div>
              <button class="btn btn-sm btn-outline-danger ms-1" onclick="clearChat()">Clear</button>
            </div>
          </div>

          <div class="chat-box" id="chatBox"></div>

          <div id="input-area" class="mt-2">
            <label class="btn btn-sm btn-outline-secondary position-relative m-0" title="Attach Image or File">
              📎
              <input type="file" id="fileInput" class="d-none" accept="image/*,.pdf,.txt" onchange="handleFileSelect(event)">
              <span id="fileBadge" class="position-absolute top-0 start-100 translate-middle p-1 bg-primary border border-light rounded-circle d-none">
                <span class="visually-hidden">Attached</span>
              </span>
            </label>
            <textarea id="msgInput" class="form-control form-control-sm" rows="2" placeholder="Type a message... (Enter to send)"></textarea>
            <button id="sendBtn" class="btn btn-primary px-3 fw-semibold" onclick="send()">Send</button>
            <button id="stopBtn" class="btn btn-warning px-3 d-none fw-semibold" onclick="stopStream()">Stop</button>
          </div>
          <div id="attachedPreview" class="small text-info mt-1 d-none"></div>
        </div>
      </div>

      <!-- Draggable Resizer Bar (Visible on Desktop >= 992px) -->
      <div class="split-resizer d-none d-lg-flex" id="splitResizer" title="Drag to adjust view ratio">
        <div class="resizer-handle"></div>
      </div>

      <!-- Right Column: Console Log Feature -->
      <div class="split-pane split-right" id="logsPane">
        <div class="panel-card p-3 mb-0 h-100 d-flex flex-column">
          <div class="row g-2 align-items-center mb-2">
            <div class="col-auto">
              <span class="fw-bold text-warning me-1 fs-6">📋 Console Logs</span>
            </div>
            <div class="col-6 col-sm-auto">
              <select id="providerFilter" class="form-select form-select-sm" onchange="renderLogs()">
                <option value="all">All Providers</option>
                <option value="auto">auto</option>
                <option value="freemodels">freemodels</option>
                <option value="duckai">duckai</option>
                <option value="unlimitedai">unlimitedai</option>
                <option value="aichatting">aichatting</option>
                <option value="aibanglachat">aibanglachat</option>
                <option value="eye2ai">eye2ai</option>
                <option value="custom">custom</option>
                <option value="combo">combo</option>
              </select>
            </div>
            <div class="col-6 col-sm-auto">
              <select id="statusFilter" class="form-select form-select-sm" onchange="renderLogs()">
                <option value="all">All Statuses</option>
                <option value="200">200 OK</option>
                <option value="error">Errors</option>
              </select>
            </div>
            <div class="col-12 col-sm">
              <input type="text" id="searchInput" class="form-control form-control-sm" placeholder="Search logs..." oninput="debouncedRenderLogs()">
            </div>
            <div class="col-auto ms-auto d-flex align-items-center gap-1">
              <div class="form-check form-switch mb-0">
                <input class="form-check-input" type="checkbox" id="autoRefreshToggle" checked onchange="toggleAutoRefresh()">
                <label class="form-check-label text-nowrap small fw-medium" for="autoRefreshToggle">Live</label>
              </div>
              <button class="btn btn-sm btn-outline-info" title="Refresh Logs" onclick="fetchLogs()">🔄</button>
              <button class="btn btn-sm btn-outline-danger" onclick="clearLogs()">Clear</button>
              <span id="logCountBadge" class="badge bg-secondary fs-7">0 Logs</span>
            </div>
          </div>

          <div class="logs-box" id="logsContainer">
            <div class="text-center text-secondary py-5">Loading provider logs...</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Custom Provider & Combo Router Modal -->
  <div class="modal fade" id="customProviderModal" tabindex="-1" aria-labelledby="customProviderModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-xl modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <div>
            <h5 class="modal-title" id="customProviderModalLabel"><span class="title-ico">🧩</span> Manage Providers & Combo Routers</h5>
            <div class="modal-subtitle">Connect custom APIs · Build drag & drop failover sequences</div>
          </div>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <ul class="nav pm-tabs" id="providerModalTabs" role="tablist">
            <li class="nav-item" role="presentation">
              <button class="nav-link active" id="tab-custom-prov" data-bs-toggle="tab" data-bs-target="#panel-custom-prov" type="button" role="tab">🔌 Custom API Providers</button>
            </li>
            <li class="nav-item" role="presentation">
              <button class="nav-link" id="tab-combo-router" data-bs-toggle="tab" data-bs-target="#panel-combo-router" type="button" role="tab" onclick="loadComboManager()">🔀 Combo Routers & Auto Route</button>
            </li>
          </ul>

          <div class="tab-content" id="providerModalTabContent">
            <!-- TAB 1: CUSTOM PROVIDERS -->
            <div class="tab-pane fade show active" id="panel-custom-prov" role="tabpanel">
              <div class="pm-card mb-4">
                <div class="pm-section-title"><span>➕</span> <span id="cpFormTitle">Add Custom API Provider</span></div>
                <div class="pm-section-desc">Register an OpenAI-compatible, Gemini, or Claude endpoint. Models auto-discover on save.</div>
                <div class="row g-3">
                  <div class="col-md-4">
                    <label class="pm-label">Compatibility Type</label>
                    <select id="cpType" class="d-none" onchange="onCpTypeChange()">
                      <option value="openai">OpenAI Compatible (Custom)</option>
                      <option value="google">Google Gemini</option>
                      <option value="anthropic">Anthropic Claude</option>
                      <option value="openrouter">OpenRouter</option>
                      <option value="opencode">OpenCode Zen</option>
                      <option value="ollama">Ollama Cloud / Local</option>
                      <option value="mistral">Mistral AI</option>
                      <option value="grok">xAI Grok</option>
                      <option value="poolside">Poolside</option>
                      <option value="bazaarlink">BazaarLink</option>
                      <option value="kilo">Kilo Gateway</option>
                      <option value="groq">Groq Cloud</option>
                      <option value="deepseek">DeepSeek</option>
                    </select>
                    <div class="cp-select2-container position-relative">
                      <button type="button" id="cpTypeSelect2Trigger" class="form-select form-select-sm text-start d-flex align-items-center justify-content-between cp-select2-trigger" onclick="toggleCpTypeSelect2Menu(event)">
                        <span id="cpTypeSelect2Label" class="text-truncate">OpenAI Compatible (Custom)</span>
                      </button>
                      <div id="cpTypeSelect2Menu" class="cp-select2-menu d-none position-absolute w-100 mt-1" style="left:0; top:100%;">
                        <div class="mb-2">
                          <input type="text" id="cpTypeSelect2Search" class="form-control form-control-sm cp-select2-search" placeholder="🔍 Search compatibility..." oninput="filterCpTypeSelect2Options()" onclick="event.stopPropagation()">
                        </div>
                        <div id="cpTypeSelect2Options" class="cp-select2-options-list" style="max-height: 200px; overflow-y: auto;">
                          <!-- Dynamically rendered -->
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="col-md-4">
                    <label class="pm-label">Provider ID / Prefix</label>
                    <input type="text" id="cpId" class="form-control form-control-sm" placeholder="e.g. groq, openrouter, claude">
                  </div>
                  <div class="col-md-4">
                    <label class="pm-label">Display Name</label>
                    <input type="text" id="cpName" class="form-control form-control-sm" placeholder="e.g. OpenRouter / Groq Cloud">
                  </div>
                  <div class="col-12" id="cpUrlGroup">
                    <label class="pm-label">Base URL</label>
                    <input type="text" id="cpUrl" class="form-control form-control-sm" placeholder="https://api.groq.com/openai/v1 (or http://localhost:11434/v1)">
                  </div>
                  <div class="col-12">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                      <label class="pm-label mb-0">API Key(s) · comma-separated for multi-key rotation</label>
                      <a id="cpKeyLink" href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" class="small text-decoration-none" style="color: #60a5fa; font-size: 0.82rem;">
                        🔑 Get API Key ↗
                      </a>
                    </div>
                    <textarea id="cpKey" class="form-control form-control-sm" rows="2" placeholder="key1, key2, key3..."></textarea>
                  </div>
                  <div class="col-12">
                    <label class="pm-label">Models · comma-separated, or leave empty to auto-fetch</label>
                    <input type="text" id="cpModels" class="form-control form-control-sm" placeholder="model1, model2 (or leave empty)">
                  </div>
                  <div class="col-12 d-flex justify-content-end gap-2 mt-1">
                    <button id="cpCancelEditBtn" type="button" class="btn btn-sm btn-outline-secondary d-none" onclick="resetCustomProviderForm()">Cancel Edit</button>
                    <button class="btn btn-sm pm-btn-primary px-4" onclick="saveCustomProvider()">💾 Save & Auto-Discover</button>
                  </div>
                </div>
              </div>

              <div class="pm-section-title mb-2"><span>📁</span> Configured Providers <span class="pm-prov-count" id="cpCountBadge">0</span></div>
              <div id="customProvidersList">
                <p class="text-secondary small">No custom providers configured yet.</p>
              </div>
            </div>

            <!-- TAB 2: COMBO ROUTERS & DRAG & DROP FAILOVER -->
            <div class="tab-pane fade" id="panel-combo-router" role="tabpanel">
              <div class="pm-card mb-4">
                <div class="pm-section-title"><span>🔀</span> <span id="comboFormTitle">Create / Edit Custom Combo Router</span></div>
                <div class="pm-section-desc">Pick models from the pool → drag to set failover priority → call it as <code>combo/your-id</code>.</div>
                <div class="row g-3">
                  <div class="col-md-6">
                    <label class="pm-label">Combo Display Name</label>
                    <input type="text" id="comboName" class="form-control form-control-sm" placeholder="e.g. Fast Claude & GPT Failover">
                  </div>
                  <div class="col-md-6">
                    <label class="pm-label">Combo ID / Prefix → <code>combo/your-id</code></label>
                    <input type="text" id="comboId" class="form-control form-control-sm" placeholder="e.g. fast-mix">
                  </div>

                  <div class="col-12 mt-1">
                    <div class="row g-3">
                      <!-- Available Models Pool -->
                      <div class="col-md-5">
                        <label class="pm-label">📦 Model Pool <span class="pm-drop-hint">· grouped by provider</span></label>
                        <div class="pm-pane" id="comboPoolPane">
                          <div class="pm-pane-head">
                            <span class="pm-pane-title">Available Models</span>
                            <input type="text" id="comboModelPoolSearch" class="pm-search" placeholder="🔍 Filter models..." oninput="debouncedFilterComboPool()">
                          </div>
                          <div id="comboAvailableModelsPool">
                            <!-- Dynamically loaded available models -->
                          </div>
                        </div>
                      </div>

                      <!-- Active Fallback Sequence Dropzone -->
                      <div class="col-md-7">
                        <label class="pm-label">🎯 Failover Priority Sequence <span class="pm-drop-hint">· drag to reorder (top = first try)</span></label>
                        <div class="pm-pane" id="comboSequencePane">
                          <div class="pm-pane-head">
                            <span class="pm-pane-title">Active Sequence</span>
                            <span class="pm-drop-hint" id="comboSeqCount">0 models</span>
                          </div>
                          <ul id="comboSequenceList" class="list-unstyled mb-0">
                            <li class="pm-empty"><span class="big">🎯</span><span>No models yet.<br>Click <strong>+ Add</strong> from the pool.</span></li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="col-12 d-flex justify-content-end gap-2 mt-1">
                    <button id="comboCancelEditBtn" type="button" class="btn btn-sm btn-outline-secondary d-none" onclick="resetComboForm()">Cancel Edit</button>
                    <button class="btn btn-sm pm-btn-primary px-4" onclick="saveComboRouter()">💾 Save Combo Router</button>
                  </div>
                </div>
              </div>

              <div class="pm-section-title mb-2"><span>📁</span> Configured Custom Combo Routers <span class="pm-prov-count" id="comboCountBadge">0</span></div>
              <div id="customCombosList" class="mb-4">
                <p class="text-secondary small">No custom combo routers configured yet.</p>
              </div>

              <!-- Global Auto Router Sequence Editor -->
              <div class="pm-card">
                <div class="pm-section-title"><span>🌍</span> Global Auto Fallback Sequence</div>
                <div class="pm-section-desc">Priority order used by the default <code>auto</code> router when no custom sequence is given. Drag to reorder.</div>
                <div class="pm-pane warn-pane" style="height: 250px;">
                  <div class="pm-pane-head">
                    <span class="pm-pane-title">⚡ auto router order</span>
                    <span class="pm-drop-hint" id="autoSeqCount">0 models</span>
                  </div>
                  <ul id="autoSequenceList" class="list-unstyled mb-0">
                    <!-- Auto sequence items -->
                  </ul>
                </div>
                <div class="text-end mt-3">
                  <button class="btn btn-sm pm-btn-warn px-4" onclick="saveAutoSequenceOrder()">⚡ Save Auto Failover Sequence</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="modal">Close</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    // --- CHAT LOGIC ---
    const chatBox = document.getElementById('chatBox');
    const msgInput = document.getElementById('msgInput');
    const sendBtn = document.getElementById('sendBtn');
    const stopBtn = document.getElementById('stopBtn');
    const fileBadge = document.getElementById('fileBadge');
    const attachedPreview = document.getElementById('attachedPreview');
    let messages = [];
    let modelProviderMap = {};
    let modelNames = {};
    let attachedFileDataUrl = null;
    let attachedFileName = '';
    let abortCtrl = null;
    let busy = false;

    msgInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });

    function handleFileSelect(event) {
      const file = event.target.files[0];
      if (!file) return;

      attachedFileName = file.name;
      const reader = new FileReader();
      reader.onload = function(e) {
        attachedFileDataUrl = e.target.result;
        fileBadge.classList.remove('d-none');
        attachedPreview.classList.remove('d-none');
        attachedPreview.textContent = '📎 Attached: ' + attachedFileName;
      };
      reader.readAsDataURL(file);
    }

    function clearAttachedFile() {
      attachedFileDataUrl = null;
      attachedFileName = '';
      document.getElementById('fileInput').value = '';
      fileBadge.classList.add('d-none');
      attachedPreview.classList.add('d-none');
      attachedPreview.textContent = '';
    }

    const CP_PRESETS = {
      openai: {
        url: '',
        id: '',
        name: '',
        placeholder: 'https://api.groq.com/openai/v1 (or http://localhost:11434/v1)',
        keyUrl: 'https://platform.openai.com/api-keys'
      },
      google: {
        url: 'https://generativelanguage.googleapis.com',
        id: 'google',
        name: 'Google Gemini',
        placeholder: 'https://generativelanguage.googleapis.com (default)',
        keyUrl: 'https://aistudio.google.com/app/apikey'
      },
      anthropic: {
        url: 'https://api.anthropic.com',
        id: 'anthropic',
        name: 'Anthropic Claude',
        placeholder: 'https://api.anthropic.com (default)',
        keyUrl: 'https://console.anthropic.com/settings/keys'
      },
      openrouter: {
        url: 'https://openrouter.ai/api/v1',
        id: 'openrouter',
        name: 'OpenRouter',
        placeholder: 'https://openrouter.ai/api/v1',
        keyUrl: 'https://openrouter.ai/keys'
      },
      opencode: {
        url: 'https://opencode.zen/api/v1',
        id: 'opencode',
        name: 'OpenCode Zen',
        placeholder: 'https://opencode.zen/api/v1',
        keyUrl: 'https://opencode.ai/'
      },
      ollama: {
        url: 'http://localhost:11434/v1',
        id: 'ollama',
        name: 'Ollama',
        placeholder: 'http://localhost:11434/v1 (or https://ollama.com/v1)',
        keyUrl: 'https://ollama.com/'
      },
      mistral: {
        url: 'https://api.mistral.ai/v1',
        id: 'mistral',
        name: 'Mistral AI',
        placeholder: 'https://api.mistral.ai/v1',
        keyUrl: 'https://console.mistral.ai/api-keys'
      },
      grok: {
        url: 'https://api.x.ai/v1',
        id: 'grok',
        name: 'xAI Grok',
        placeholder: 'https://api.x.ai/v1',
        keyUrl: 'https://console.x.ai/'
      },
      poolside: {
        url: 'https://api.poolside.ai/v1',
        id: 'poolside',
        name: 'Poolside',
        placeholder: 'https://api.poolside.ai/v1',
        keyUrl: 'https://poolside.ai/'
      },
      bazaarlink: {
        url: 'https://api.bazaarlink.com/v1',
        id: 'bazaarlink',
        name: 'BazaarLink',
        placeholder: 'https://api.bazaarlink.com/v1',
        keyUrl: 'https://bazaarlink.com/'
      },
      kilo: {
        url: 'https://api.kilo.ai/v1',
        id: 'kilo',
        name: 'Kilo Gateway',
        placeholder: 'https://api.kilo.ai/v1',
        keyUrl: 'https://kilo.ai/'
      },
      groq: {
        url: 'https://api.groq.com/openai/v1',
        id: 'groq',
        name: 'Groq Cloud',
        placeholder: 'https://api.groq.com/openai/v1',
        keyUrl: 'https://console.groq.com/keys'
      },
      deepseek: {
        url: 'https://api.deepseek.com/v1',
        id: 'deepseek',
        name: 'DeepSeek',
        placeholder: 'https://api.deepseek.com/v1',
        keyUrl: 'https://platform.deepseek.com/api_keys'
      }
    };

    function onCpTypeChange() {
      const type = document.getElementById('cpType').value;
      const preset = CP_PRESETS[type] || CP_PRESETS.openai;
      const urlInput = document.getElementById('cpUrl');
      const idInput = document.getElementById('cpId');
      const nameInput = document.getElementById('cpName');
      const keyLink = document.getElementById('cpKeyLink');

      const current = urlInput.value.trim();
      const isPresetUrl = !current || Object.keys(CP_PRESETS).some(function (k) {
        return CP_PRESETS[k].url && CP_PRESETS[k].url === current;
      });

      if (isPresetUrl) {
        urlInput.value = preset.url || '';
      }
      urlInput.placeholder = preset.placeholder || '';

      if (!idInput.value.trim() && preset.id) {
        idInput.value = preset.id;
      }
      if (!nameInput.value.trim() && preset.name) {
        nameInput.value = preset.name;
      }

      if (preset.keyUrl) {
        keyLink.href = preset.keyUrl;
        keyLink.textContent = '🔑 Get ' + (preset.name || 'API') + ' Key ↗';
        keyLink.classList.remove('d-none');
      } else {
        keyLink.classList.add('d-none');
      }
      syncCpTypeSelect2UI();
    }

    function initCpTypeSelect2() {
      const select = document.getElementById('cpType');
      if (!select) return;
      const optionsContainer = document.getElementById('cpTypeSelect2Options');
      if (!optionsContainer) return;

      let html = '';
      for (const opt of select.options) {
        const isSel = opt.selected || opt.value === select.value;
        html += \`<div class="cp-select2-option \${isSel ? 'selected' : ''}" data-value="\${opt.value}" onclick="selectCpTypeOption('\${opt.value}')">
          <span>\${escapeHtml(opt.textContent)}</span>
          \${isSel ? '<span class="cp-select2-option-tag">✓</span>' : ''}
        </div>\`;
      }
      optionsContainer.innerHTML = html;
      syncCpTypeSelect2UI();
    }

    function toggleCpTypeSelect2Menu(e) {
      if (e) e.stopPropagation();
      const menu = document.getElementById('cpTypeSelect2Menu');
      const trigger = document.getElementById('cpTypeSelect2Trigger');
      if (!menu) return;

      const isHidden = menu.classList.contains('d-none');
      if (isHidden) {
        menu.classList.remove('d-none');
        if (trigger) trigger.classList.add('active');
        const search = document.getElementById('cpTypeSelect2Search');
        if (search) {
          search.value = '';
          filterCpTypeSelect2Options();
          setTimeout(() => search.focus(), 50);
        }
      } else {
        closeCpTypeSelect2Menu();
      }
    }

    function closeCpTypeSelect2Menu() {
      const menu = document.getElementById('cpTypeSelect2Menu');
      const trigger = document.getElementById('cpTypeSelect2Trigger');
      if (menu) menu.classList.add('d-none');
      if (trigger) trigger.classList.remove('active');
    }

    function filterCpTypeSelect2Options() {
      const search = (document.getElementById('cpTypeSelect2Search')?.value || '').trim().toLowerCase();
      const options = document.querySelectorAll('#cpTypeSelect2Options .cp-select2-option');
      options.forEach(opt => {
        const text = opt.textContent.toLowerCase();
        if (!search || text.includes(search)) {
          opt.style.display = 'flex';
        } else {
          opt.style.display = 'none';
        }
      });
    }

    function selectCpTypeOption(value) {
      const select = document.getElementById('cpType');
      if (select) {
        select.value = value;
        onCpTypeChange();
      }
      syncCpTypeSelect2UI();
      closeCpTypeSelect2Menu();
    }

    function syncCpTypeSelect2UI() {
      const select = document.getElementById('cpType');
      const label = document.getElementById('cpTypeSelect2Label');
      if (!select || !label) return;

      const selectedOpt = select.options[select.selectedIndex];
      if (selectedOpt) {
        label.textContent = selectedOpt.textContent;
      }

      const options = document.querySelectorAll('#cpTypeSelect2Options .cp-select2-option');
      options.forEach(opt => {
        const val = opt.getAttribute('data-value');
        if (val === select.value) {
          opt.classList.add('selected');
          if (!opt.querySelector('.cp-select2-option-tag')) {
            opt.insertAdjacentHTML('beforeend', '<span class="cp-select2-option-tag">✓</span>');
          }
        } else {
          opt.classList.remove('selected');
          const tag = opt.querySelector('.cp-select2-option-tag');
          if (tag) tag.remove();
        }
      });
    }

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('click', e => {
        const inCp = e.target && e.target.closest ? e.target.closest('.cp-select2-container') : null;
        if (!inCp) closeCpTypeSelect2Menu();

        const inProv = e.target && e.target.closest ? e.target.closest('.prov-select2-container') : null;
        if (!inProv) closeProvSelect2Menu();

        const inModel = e.target && e.target.closest ? e.target.closest('.model-select2-container') : null;
        if (!inModel) closeModelSelect2Menu();
      });
    }

    function syncProvSelect2Options() {
      const select = document.getElementById('providerSelect');
      const container = document.getElementById('provSelect2Options');
      if (!select || !container) return;

      let html = '';
      for (const opt of select.options) {
        const isSel = opt.selected || opt.value === select.value;
        html += \`<div class="cp-select2-option \${isSel ? 'selected' : ''}" data-value="\${opt.value}" onclick="selectProvOption('\${opt.value}')">
          <span>\${escapeHtml(opt.textContent)}</span>
          \${isSel ? '<span class="cp-select2-option-tag">✓</span>' : ''}
        </div>\`;
      }
      container.innerHTML = html;
      syncProvSelect2UI();
    }

    function toggleProvSelect2Menu(e) {
      if (e) e.stopPropagation();
      closeModelSelect2Menu();
      closeCpTypeSelect2Menu();
      const menu = document.getElementById('provSelect2Menu');
      const trigger = document.getElementById('provSelect2Trigger');
      if (!menu) return;

      const isHidden = menu.classList.contains('d-none');
      if (isHidden) {
        menu.classList.remove('d-none');
        if (trigger) trigger.classList.add('active');
        const search = document.getElementById('provSelect2Search');
        if (search) {
          search.value = '';
          filterProvSelect2Options();
          setTimeout(() => search.focus(), 50);
        }
      } else {
        closeProvSelect2Menu();
      }
    }

    function closeProvSelect2Menu() {
      const menu = document.getElementById('provSelect2Menu');
      const trigger = document.getElementById('provSelect2Trigger');
      if (menu) menu.classList.add('d-none');
      if (trigger) trigger.classList.remove('active');
    }

    function filterProvSelect2Options() {
      const search = (document.getElementById('provSelect2Search')?.value || '').trim().toLowerCase();
      const options = document.querySelectorAll('#provSelect2Options .cp-select2-option');
      options.forEach(opt => {
        const text = opt.textContent.toLowerCase();
        if (!search || text.includes(search)) {
          opt.style.display = 'flex';
        } else {
          opt.style.display = 'none';
        }
      });
    }

    function selectProvOption(value) {
      const select = document.getElementById('providerSelect');
      if (select) {
        select.value = value;
        filterModels();
      }
      syncProvSelect2UI();
      closeProvSelect2Menu();
    }

    function syncProvSelect2UI() {
      const select = document.getElementById('providerSelect');
      const label = document.getElementById('provSelect2Label');
      if (!select || !label) return;

      const selectedOpt = select.options[select.selectedIndex];
      if (selectedOpt) {
        label.textContent = selectedOpt.textContent;
      }

      const options = document.querySelectorAll('#provSelect2Options .cp-select2-option');
      options.forEach(opt => {
        const val = opt.getAttribute('data-value');
        if (val === select.value) {
          opt.classList.add('selected');
          if (!opt.querySelector('.cp-select2-option-tag')) {
            opt.insertAdjacentHTML('beforeend', '<span class="cp-select2-option-tag">✓</span>');
          }
        } else {
          opt.classList.remove('selected');
          const tag = opt.querySelector('.cp-select2-option-tag');
          if (tag) tag.remove();
        }
      });
    }

    function syncModelSelect2Options(grouped) {
      const container = document.getElementById('modelSelect2Options');
      const select = document.getElementById('model');
      if (!container || !select) return;

      let html = '';
      let hasAny = false;

      for (const [prov, models] of Object.entries(grouped)) {
        if (!models || models.length === 0) continue;
        hasAny = true;
        const groupTitle = prov.toUpperCase() + (prov === 'auto' ? ' ROUTER' : ' PROVIDER');
        html += \`<div class="cp-select2-group-title">\${escapeHtml(groupTitle)}</div>\`;

        for (const m of models) {
          const isSel = m.id === select.value;
          const displayName = m.meta?.name || m.id;
          html += \`<div class="cp-select2-option \${isSel ? 'selected' : ''}" data-value="\${escapeHtml(m.id)}" onclick="selectModelOption('\${escapeHtml(m.id)}')">
            <div class="d-flex flex-column" style="min-width:0;">
              <span class="text-truncate fw-medium">\${escapeHtml(displayName)}</span>
              <span class="small text-secondary text-truncate" style="font-size:0.7rem; font-family: monospace;">\${escapeHtml(m.id)}</span>
            </div>
            \${isSel ? '<span class="cp-select2-option-tag ms-2">✓</span>' : ''}
          </div>\`;
        }
      }

      if (!hasAny) {
        html = '<div class="p-3 text-center text-secondary small">No matching models found</div>';
      }

      container.innerHTML = html;
      syncModelSelect2UI();
    }

    function toggleModelSelect2Menu(e) {
      if (e) e.stopPropagation();
      closeProvSelect2Menu();
      closeCpTypeSelect2Menu();
      const menu = document.getElementById('modelSelect2Menu');
      const trigger = document.getElementById('modelSelect2Trigger');
      if (!menu) return;

      const isHidden = menu.classList.contains('d-none');
      if (isHidden) {
        menu.classList.remove('d-none');
        if (trigger) trigger.classList.add('active');
        const search = document.getElementById('modelSelect2Search');
        if (search) {
          search.value = '';
          filterModelSelect2Options();
          setTimeout(() => search.focus(), 50);
        }
      } else {
        closeModelSelect2Menu();
      }
    }

    function closeModelSelect2Menu() {
      const menu = document.getElementById('modelSelect2Menu');
      const trigger = document.getElementById('modelSelect2Trigger');
      if (menu) menu.classList.add('d-none');
      if (trigger) trigger.classList.remove('active');
    }

    function filterModelSelect2Options() {
      const search = (document.getElementById('modelSelect2Search')?.value || '').trim().toLowerCase();
      const hiddenInput = document.getElementById('modelSearch');
      if (hiddenInput) hiddenInput.value = search;
      filterModels();
    }

    function selectModelOption(value) {
      const select = document.getElementById('model');
      if (select) {
        select.value = value;
      }
      syncModelSelect2UI();
      closeModelSelect2Menu();
    }

    function syncModelSelect2UI() {
      const select = document.getElementById('model');
      const label = document.getElementById('modelSelect2Label');
      if (!select || !label) return;

      const currentVal = select.value;
      if (currentVal) {
        const prov = modelProviderMap[currentVal] || (currentVal.includes('/') ? currentVal.split('/')[0] : 'model');
        const name = modelNames[currentVal] || currentVal;
        label.innerHTML = \`<span>\${escapeHtml(prov.toUpperCase())} · \${escapeHtml(name)}</span>\`;
      } else {
        label.textContent = 'Select Model...';
      }

      const options = document.querySelectorAll('#modelSelect2Options .cp-select2-option');
      options.forEach(opt => {
        const val = opt.getAttribute('data-value');
        if (val === select.value) {
          opt.classList.add('selected');
          if (!opt.querySelector('.cp-select2-option-tag')) {
            opt.insertAdjacentHTML('beforeend', '<span class="cp-select2-option-tag ms-2">✓</span>');
          }
        } else {
          opt.classList.remove('selected');
          const tag = opt.querySelector('.cp-select2-option-tag');
          if (tag) tag.remove();
        }
      });
    }

    let allModelsList = [];

    async function loadModels() {
      const resp = await fetch('/v1/models');
      const data = await resp.json();
      allModelsList = data.data || [];

      const provSelect = document.getElementById('providerSelect');
      if (provSelect) {
        const currentProv = provSelect.value || 'all';
        const providers = Array.from(new Set(allModelsList.map(m => m.provider || 'default')));
        let phtml = '<option value="all">All Providers</option>';
        for (const p of providers) {
          phtml += \`<option value="\${p}">\${p.toUpperCase()}</option>\`;
        }
        provSelect.innerHTML = phtml;
        provSelect.value = currentProv;
        syncProvSelect2Options();
      }

      filterModels();
    }

    function filterModels() {
      const pFilter = (document.getElementById('providerSelect')?.value || 'all').toLowerCase();
      const query = (document.getElementById('modelSearch')?.value || '').trim().toLowerCase();
      const select = document.getElementById('model');
      if (!select) return;

      const prevValue = select.value;
      select.innerHTML = '';

      const filtered = allModelsList.filter(m => {
        const prov = (m.provider || 'default').toLowerCase();
        if (pFilter !== 'all' && prov !== pFilter) return false;
        if (query) {
          const matchId = m.id.toLowerCase().includes(query);
          const matchName = m.meta && m.meta.name && m.meta.name.toLowerCase().includes(query);
          const matchProv = prov.includes(query);
          if (!matchId && !matchName && !matchProv) return false;
        }
        return true;
      });

      const grouped = {};
      for (const m of filtered) {
        const prov = m.provider || 'default';
        grouped[prov] = grouped[prov] || [];
        grouped[prov].push(m);
        modelProviderMap[m.id] = prov;
        if (m.meta && m.meta.name) modelNames[m.id] = m.meta.name;
      }

      let foundPrev = false;
      for (const [prov, models] of Object.entries(grouped)) {
        const group = document.createElement('optgroup');
        group.label = prov.toUpperCase() + (prov === 'auto' ? ' ROUTER' : ' PROVIDER');
        for (const m of models) {
          const opt = document.createElement('option');
          opt.value = m.id;
          opt.textContent = m.meta?.name || m.id;
          if (m.id === prevValue || (!prevValue && m.id === 'auto')) {
            opt.selected = true;
            foundPrev = true;
          }
          group.appendChild(opt);
        }
        select.appendChild(group);
      }

      if (!foundPrev && select.options.length > 0) {
        select.options[0].selected = true;
      }

      syncModelSelect2Options(grouped);
    }
    loadModels();

    // --- COMBO ROUTERS & DRAG AND DROP AUTO ROUTE LOGIC ---
    let allCombosData = [];
    let autoSequenceData = [];
    let allModelsCache = [];

    function pmToast(message, type = 'success') {
      if (typeof Swal !== 'undefined' && typeof Swal.fire === 'function') {
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: type === 'error' ? 'error' : 'success',
          title: message,
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true,
          background: '#0f172a',
          color: '#f8fafc'
        });
        return;
      }
      if (typeof document === 'undefined' || !document.body) return;
      let wrap = document.querySelector('.pm-toast-wrap');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'pm-toast-wrap';
        document.body.appendChild(wrap);
      }
      const t = document.createElement('div');
      t.className = 'pm-toast ' + (type === 'error' ? 'error' : 'success');
      t.innerHTML = '<span>' + (type === 'error' ? '⚠️' : '✅') + '</span><span style="flex:1;"></span>';
      t.lastElementChild.textContent = message;
      wrap.appendChild(t);
      setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 350); }, 3200);
    }

    async function confirmSwal(title, text = '') {
      if (typeof Swal !== 'undefined' && typeof Swal.fire === 'function') {
        const res = await Swal.fire({
          title: title,
          text: text,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#ef4444',
          cancelButtonColor: '#64748b',
          confirmButtonText: 'Yes, proceed!',
          cancelButtonText: 'Cancel',
          background: '#0f172a',
          color: '#f8fafc'
        });
        return res.isConfirmed;
      }
      return typeof confirm === 'function' ? confirm(title) : true;
    }

    async function promptSwal(title, inputLabel = '') {
      if (typeof Swal !== 'undefined' && typeof Swal.fire === 'function') {
        const { value: input } = await Swal.fire({
          title: title,
          input: 'password',
          inputLabel: inputLabel,
          inputPlaceholder: 'Enter ADMIN_KEY',
          showCancelButton: true,
          confirmButtonColor: '#2563eb',
          cancelButtonColor: '#64748b',
          background: '#0f172a',
          color: '#f8fafc'
        });
        return input || null;
      }
      return typeof prompt === 'function' ? prompt(title) : null;
    }

    // Fetch wrapper: network/HTTP failures surface as a toast instead of a
    // silent unhandled rejection. Supports admin key prompt and localStorage.
    async function apiFetch(url, options = {}) {
      try {
        options.headers = options.headers || {};
        const savedKey = localStorage.getItem('up_admin_key');
        if (savedKey && !options.headers['x-admin-key'] && !options.headers['Authorization']) {
          options.headers['x-admin-key'] = savedKey;
        }
        const sessionToken = localStorage.getItem('up_session_token');
        if (sessionToken && !options.headers['x-session-token']) {
          options.headers['x-session-token'] = sessionToken;
        }
        let resp = await fetch(url, options);
        let data = await resp.json().catch(() => null);

        if (resp.status === 401) {
          if (data && data.error && data.error.message && data.error.message.includes('login required')) {
            window.location.href = '/login';
            return null;
          }
          const keyInput = await promptSwal('Admin authentication required', 'Enter ADMIN_KEY:');
          if (keyInput) {
            localStorage.setItem('up_admin_key', keyInput.trim());
            options.headers['x-admin-key'] = keyInput.trim();
            resp = await fetch(url, options);
            data = await resp.json().catch(() => null);
          }
        }

        if (!resp.ok) throw new Error((data && data.error && data.error.message) || ('HTTP ' + resp.status));
        if (data && data.error) throw new Error(data.error.message || 'Request failed');
        return data;
      } catch (err) {
        pmToast(err.message || 'Network error', 'error');
        return null;
      }
    }

    async function loadComboManager() {
      try {
        const [combosResp, modelsResp] = await Promise.all([
          fetch('/v1/combos'),
          fetch('/v1/models')
        ]);
        const combosData = await combosResp.json();
        const modelsData = await modelsResp.json();

        allCombosData = combosData.data || [];
        autoSequenceData = combosData.autoSequence || [];
        allModelsCache = modelsData.data || [];

        renderComboModelPool(allModelsCache);
        renderCustomCombosList();
        renderAutoSequenceList();
      } catch (err) {
        console.error('Failed to load combo manager:', err);
      }
    }

    function renderComboModelPool(models) {
      const poolContainer = document.getElementById('comboAvailableModelsPool');
      if (!poolContainer) return;

      const query = (document.getElementById('comboModelPoolSearch')?.value || '').trim().toLowerCase();
      const filtered = models.filter(m => {
        if (m.provider === 'auto' || m.provider === 'combo') return false;
        if (query) {
          const matchId = m.id.toLowerCase().includes(query);
          const matchProv = (m.provider || '').toLowerCase().includes(query);
          const matchName = m.meta && m.meta.name && m.meta.name.toLowerCase().includes(query);
          if (!matchId && !matchProv && !matchName) return false;
        }
        return true;
      });

      if (filtered.length === 0) {
        poolContainer.innerHTML = '<div class="pm-empty"><span class="big">🔍</span><span>No matching models found.</span></div>';
        return;
      }

      // Group models by provider
      const groupedByProv = {};
      for (const m of filtered) {
        const prov = m.provider || 'default';
        groupedByProv[prov] = groupedByProv[prov] || [];
        groupedByProv[prov].push(m);
      }

      let html = '';
      for (const [prov, provModels] of Object.entries(groupedByProv)) {
        const provModelSummary = provModels.map(m => m.meta?.originalId || m.meta?.name || m.id.replace(prov + '/', '')).join(', ');
        html += \`<div class="pm-prov-group">
          <div class="pm-prov-head">
            <span class="pm-prov-name">\${escapeHtml(prov)}</span>
            <span class="pm-prov-count" title="\${escapeHtml(provModelSummary)}">\${provModels.length} model\${provModels.length !== 1 ? 's' : ''}</span>
          </div>
          <div class="pm-prov-models">\`;

        for (const m of provModels) {
          const label = m.meta?.name || m.id;
          html += \`<div class="pm-model-row">
            <span class="pm-model-name" title="\${escapeHtml(m.id)}">\${escapeHtml(label)}</span>
            <button type="button" class="pm-add-btn" onclick="addModelToComboSequence('\${escapeHtml(m.id)}')">+ Add</button>
          </div>\`;
        }

        html += \`</div></div>\`;
      }
      poolContainer.innerHTML = html;
      updateComboSeqCount();
    }

    function updateComboSeqCount() {
      const countEl = document.getElementById('comboSeqCount');
      const autoEl = document.getElementById('autoSeqCount');
      if (countEl) {
        const n = document.querySelectorAll('#comboSequenceList .pm-seq-item').length;
        countEl.textContent = n + ' model' + (n !== 1 ? 's' : '');
      }
      if (autoEl) {
        const n = document.querySelectorAll('#autoSequenceList .pm-seq-item').length;
        autoEl.textContent = n + ' model' + (n !== 1 ? 's' : '');
      }
    }

    function filterComboModelPool() {
      renderComboModelPool(allModelsCache);
    }

    function addModelToComboSequence(modelId) {
      const listEl = document.getElementById('comboSequenceList');
      if (!listEl) return;

      const existing = listEl.querySelector('[data-model-id="' + CSS.escape(modelId) + '"]');
      if (existing) { existing.style.borderColor = '#f59e0b'; setTimeout(() => existing.style.borderColor = '', 600); return; }

      const emptyItem = listEl.querySelector('.pm-empty');
      if (emptyItem) emptyItem.remove();

      const li = document.createElement('li');
      li.className = 'pm-seq-item';
      li.setAttribute('draggable', 'true');
      li.setAttribute('data-model-id', modelId);

      li.innerHTML = \`<span class="grip" title="Drag to reorder">⠿</span>
        <span class="pm-order">#1</span>
        <span class="pm-seq-model" title="\${escapeHtml(modelId)}">\${escapeHtml(modelId)}</span>
        <span class="pm-seq-actions">
          <button type="button" class="pm-icon-btn" title="Move up" onclick="moveItemUp(this)">↑</button>
          <button type="button" class="pm-icon-btn" title="Move down" onclick="moveItemDown(this)">↓</button>
          <button type="button" class="pm-icon-btn danger" title="Remove" onclick="removeSequenceItem(this)">✕</button>
        </span>\`;

      listEl.appendChild(li);
      attachDragAndDropListeners(listEl);
      updateListOrderBadges(listEl);
      updateComboSeqCount();
    }

    function attachDragAndDropListeners(listEl) {
      if (listEl.dataset.dndBound === '1') return;
      listEl.dataset.dndBound = '1';
      const pane = listEl.closest('.pm-pane') || listEl;
      let draggedEl = null;

      listEl.addEventListener('dragstart', function(e) {
        const item = e.target.closest('.pm-seq-item');
        if (!item || !listEl.contains(item)) return;
        draggedEl = item;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', item.dataset.modelId || ''); } catch (err) {}
      });

      listEl.addEventListener('dragend', function() {
        if (draggedEl) draggedEl.classList.remove('dragging');
        draggedEl = null;
        pane.classList.remove('drop-active');
        updateListOrderBadges(listEl);
        updateComboSeqCount();
      });

      listEl.addEventListener('dragover', function(e) {
        if (!draggedEl) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        pane.classList.add('drop-active');
        const over = e.target.closest('.pm-seq-item');
        if (!over || over === draggedEl || !listEl.contains(over)) return;
        const rect = over.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        listEl.insertBefore(draggedEl, before ? over : over.nextSibling);
      });

      listEl.addEventListener('dragleave', function(e) {
        if (!e.relatedTarget || !pane.contains(e.relatedTarget)) pane.classList.remove('drop-active');
      });

      listEl.addEventListener('drop', function(e) {
        e.preventDefault();
        pane.classList.remove('drop-active');
        updateListOrderBadges(listEl);
        updateComboSeqCount();
      });
    }

    function updateListOrderBadges(listEl) {
      const items = listEl.querySelectorAll('.pm-seq-item');
      items.forEach((item, index) => {
        const badge = item.querySelector('.pm-order');
        if (badge) badge.textContent = \`#\${index + 1}\`;
      });
      updateComboSeqCount();
    }

    function moveItemUp(btn) {
      const li = btn.closest('.pm-seq-item');
      if (!li) return;
      const parent = li.parentElement;
      const prev = li.previousElementSibling;
      if (prev && prev.classList.contains('pm-seq-item')) {
        parent.insertBefore(li, prev);
        updateListOrderBadges(parent);
      }
    }

    function moveItemDown(btn) {
      const li = btn.closest('.pm-seq-item');
      if (!li) return;
      const parent = li.parentElement;
      const next = li.nextElementSibling;
      if (next && next.classList.contains('pm-seq-item')) {
        parent.insertBefore(li, next.nextSibling);
        updateListOrderBadges(parent);
      }
    }

    function removeSequenceItem(btn) {
      const li = btn.closest('.pm-seq-item');
      const parent = li.parentElement;
      li.remove();
      updateListOrderBadges(parent);
      if (!parent.querySelector('.pm-seq-item')) {
        parent.innerHTML = '<li class="pm-empty"><span class="big">🎯</span><span>No models yet.<br>Click <strong>+ Add</strong> from the pool.</span></li>';
      }
      updateComboSeqCount();
    }

    function resetComboForm() {
      const comboIdInput = document.getElementById('comboId');
      if (comboIdInput) {
        comboIdInput.value = '';
        comboIdInput.readOnly = false;
      }
      document.getElementById('comboName').value = '';
      document.getElementById('comboFormTitle').textContent = 'Create / Edit Custom Combo Router';
      const cancelBtn = document.getElementById('comboCancelEditBtn');
      if (cancelBtn) cancelBtn.classList.add('d-none');
      document.getElementById('comboSequenceList').innerHTML = '<li class="pm-empty"><span class="big">🎯</span><span>No models yet.<br>Click <strong>+ Add</strong> from the pool.</span></li>';
      updateComboSeqCount();
    }

    function editCustomCombo(id) {
      const combo = allCombosData.find(c => c.id === id);
      if (!combo) return;

      document.getElementById('comboFormTitle').textContent = 'Edit Custom Combo Router';
      const idInput = document.getElementById('comboId');
      idInput.value = combo.id;
      idInput.readOnly = true;

      document.getElementById('comboName').value = combo.name || '';
      const cancelBtn = document.getElementById('comboCancelEditBtn');
      if (cancelBtn) cancelBtn.classList.remove('d-none');

      const listEl = document.getElementById('comboSequenceList');
      listEl.innerHTML = '';
      if (combo.sequence && combo.sequence.length > 0) {
        combo.sequence.forEach((mId) => addModelToComboSequence(mId));
      } else {
        listEl.innerHTML = '<li class="pm-empty"><span class="big">🎯</span><span>No models yet.<br>Click <strong>+ Add</strong> from the pool.</span></li>';
      }
      updateComboSeqCount();
      const formCard = document.getElementById('comboFormTitle');
      if (formCard) formCard.closest('.pm-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    async function saveComboRouter() {
      const id = document.getElementById('comboId').value.trim();
      const name = document.getElementById('comboName').value.trim();
      const listEl = document.getElementById('comboSequenceList');
      const items = listEl.querySelectorAll('.pm-seq-item');

      const sequence = Array.from(items).map(item => item.getAttribute('data-model-id')).filter(Boolean);

      if (!name && !id) {
        pmToast('Enter a Combo Display Name or Combo ID', 'error');
        return;
      }

      if (sequence.length === 0) {
        pmToast('Add at least 1 model to the sequence', 'error');
        return;
      }

      const data = await apiFetch('/v1/combos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, sequence })
      });
      if (!data) return;
      pmToast('Combo router saved → combo/' + (id || ''), 'success');
      resetComboForm();
      await loadComboManager();
      await loadModels();
    }

    async function deleteCustomCombo(id) {
      if (!await confirmSwal('Delete custom combo router ' + id + '?')) return;
      const data = await apiFetch('/v1/combos/' + id, { method: 'DELETE' });
      if (!data) return;
      pmToast('Combo router deleted', 'success');
      await loadComboManager();
      await loadModels();
    }

    function renderCustomCombosList() {
      const container = document.getElementById('customCombosList');
      if (!container) return;
      const countBadge = document.getElementById('comboCountBadge');
      if (countBadge) countBadge.textContent = allCombosData.length;

      if (allCombosData.length === 0) {
        container.innerHTML = '<div class="pm-empty"><span class="big">🔀</span><span>No custom combo routers yet.<br>Build one above and call it as <code>combo/your-id</code>.</span></div>';
        return;
      }

      let html = '';
      for (const c of allCombosData) {
        const seqParts = (c.sequence || []).map(m => \`<span>\${escapeHtml(m)}</span>\`);
        html += \`<div class="pm-combo-card">
          <div style="min-width:0;">
            <div><span class="pm-combo-name">\${escapeHtml(c.name)}</span><span class="pm-combo-id">combo/\${escapeHtml(c.id)}</span> <span class="pm-prov-count">\${(c.sequence || []).length} steps</span></div>
            <div class="pm-combo-seq">\${seqParts.join('<span class="arrow">→</span>') || 'None'}</div>
          </div>
          <div class="d-flex gap-2 flex-shrink-0">
            <button class="btn btn-sm btn-outline-warning" onclick="editCustomCombo('\${escapeHtml(c.id)}')">✏️ Edit</button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteCustomCombo('\${escapeHtml(c.id)}')">🗑️</button>
          </div>
        </div>\`;
      }
      container.innerHTML = html;
    }

    function renderAutoSequenceList() {
      const listEl = document.getElementById('autoSequenceList');
      if (!listEl) return;
      listEl.innerHTML = '';

      if (!autoSequenceData || autoSequenceData.length === 0) {
        listEl.innerHTML = '<li class="pm-empty"><span class="big">⚡</span><span>No auto sequence items.<br>They will mirror your saved combos &amp; providers.</span></li>';
        updateComboSeqCount();
        return;
      }

      autoSequenceData.forEach((mId, index) => {
        const li = document.createElement('li');
        li.className = 'pm-seq-item';
        li.setAttribute('draggable', 'true');
        li.setAttribute('data-model-id', mId);

        li.innerHTML = \`<span class="grip" title="Drag to reorder">⠿</span>
          <span class="pm-order warn">#\${index + 1}</span>
          <span class="pm-seq-model" title="\${escapeHtml(mId)}">\${escapeHtml(mId)}</span>
          <span class="pm-seq-actions">
            <button type="button" class="pm-icon-btn" title="Move up" onclick="moveItemUp(this)">↑</button>
            <button type="button" class="pm-icon-btn" title="Move down" onclick="moveItemDown(this)">↓</button>
            <button type="button" class="pm-icon-btn danger" title="Remove" onclick="removeSequenceItem(this)">✕</button>
          </span>\`;
        listEl.appendChild(li);
      });

      attachDragAndDropListeners(listEl);
    }

    async function saveAutoSequenceOrder() {
      const listEl = document.getElementById('autoSequenceList');
      const items = listEl.querySelectorAll('.pm-seq-item');
      const sequence = Array.from(items).map(item => item.getAttribute('data-model-id')).filter(Boolean);

      const data = await apiFetch('/v1/combos/auto-sequence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequence })
      });
      if (!data) return;
      pmToast('Global auto failover sequence saved!', 'success');
      await loadComboManager();
    }

    async function saveCustomProvider() {
      const id = document.getElementById('cpId').value.trim();
      const name = document.getElementById('cpName').value.trim();
      const type = document.getElementById('cpType').value;
      const url = document.getElementById('cpUrl').value.trim();
      const apiKey = document.getElementById('cpKey').value.trim();
      const rawModels = document.getElementById('cpModels').value.trim();

      if (!id || !name) {
        pmToast('Provider ID and Display Name are required', 'error');
        return;
      }

      const models = rawModels ? rawModels.split(',').map(s => s.trim()).filter(Boolean) : [];

      const data = await apiFetch('/v1/custom-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, type, url, apiKey, models })
      });
      if (!data) return;
      pmToast('Provider saved → ' + id + '/model', 'success');
      resetCustomProviderForm();
      await loadCustomProvidersList();
      await loadModels();
    }

    async function deleteCustomProvider(id) {
      if (!await confirmSwal('Delete custom provider ' + id + '?')) return;
      const data = await apiFetch('/v1/custom-providers/' + id, { method: 'DELETE' });
      if (!data) return;
      pmToast('Provider deleted', 'success');
      await loadCustomProvidersList();
      await loadModels();
    }

    async function refreshCustomProvider(id) {
      const data = await apiFetch('/v1/custom-providers/' + id + '/refresh', { method: 'POST' });
      if (!data) return;
      pmToast('Models refreshed (' + ((data.models && data.models.length) || 0) + ')', 'success');
      await loadCustomProvidersList();
      await loadModels();
    }

    function scroll() { chatBox.scrollTop = chatBox.scrollHeight; }

    function copyText(text, btn) {
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        const orig = btn.innerHTML;
        btn.innerHTML = '✓ Copied';
        btn.style.color = '#4ade80';
        setTimeout(() => {
          btn.innerHTML = orig;
          btn.style.color = '';
        }, 1500);
      }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        const orig = btn.innerHTML;
        btn.innerHTML = '✓ Copied';
        setTimeout(() => { btn.innerHTML = orig; }, 1500);
      });
    }

    function resendMessage(text) {
      if (!text || busy) return;
      msgInput.value = text;
      send();
    }

    function resendLastUserPrompt() {
      if (busy || !messages || messages.length === 0) return;
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
      if (!lastUserMsg) return;
      let text = '';
      if (typeof lastUserMsg.content === 'string') text = lastUserMsg.content;
      else if (Array.isArray(lastUserMsg.content)) text = lastUserMsg.content.find(p => p.type === 'text')?.text || '';
      if (text) {
        msgInput.value = text;
        send();
      }
    }

    function addMsg(role, content, fileUrl = null, meta = null) {
      const d = document.createElement('div');
      d.className = 'msg ' + role;

      const rawText = typeof content === 'string' ? content : (Array.isArray(content) ? (content[0]?.text || '') : String(content || ''));

      if (role === 'assistant') {
        d.innerHTML = renderMd(rawText);
        d.appendChild(buildMetaBar(meta, rawText));
      } else if (role === 'user') {
        d.textContent = rawText;
        if (fileUrl && fileUrl.startsWith('data:image')) {
          const img = document.createElement('img');
          img.src = fileUrl;
          img.className = 'msg-attached-img';
          d.appendChild(img);
        }

        const actions = document.createElement('div');
        actions.className = 'msg-actions d-flex gap-2 justify-content-end mt-1 pt-1 border-top border-secondary text-nowrap';
        actions.style.fontSize = '0.75rem';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn btn-link btn-xs text-light p-0 text-decoration-none opacity-75';
        copyBtn.innerHTML = '📋 Copy';
        copyBtn.onclick = function() { copyText(rawText, copyBtn); };
        actions.appendChild(copyBtn);

        const resendBtn = document.createElement('button');
        resendBtn.className = 'btn btn-link btn-xs text-info p-0 text-decoration-none opacity-75';
        resendBtn.innerHTML = '🔄 Resend';
        resendBtn.onclick = function() { resendMessage(rawText); };
        actions.appendChild(resendBtn);

        d.appendChild(actions);
      } else {
        d.textContent = rawText;
      }
      chatBox.appendChild(d);
      scroll();
      return d;
    }

    function buildMetaBar(meta, rawText = '') {
      const bar = document.createElement('div');
      bar.className = 'msg-meta d-flex align-items-center flex-wrap gap-2 mt-2 pt-1 border-top border-secondary';

      if (meta) {
        const prov = document.createElement('span');
        prov.className = 'badge mm-provider';
        prov.textContent = meta.provider;
        prov.title = 'Provider';
        bar.appendChild(prov);

        const mdl = document.createElement('span');
        mdl.className = 'mm-model';
        mdl.textContent = meta.model;
        mdl.title = meta.modelId;
        bar.appendChild(mdl);

        if (meta.viaAuto) {
          const a = document.createElement('span');
          a.className = 'badge mm-auto';
          a.textContent = 'auto fallback';
          a.title = 'Chosen by the automatic fallback router';
          bar.appendChild(a);
        }

        const time = document.createElement('span');
        time.className = 'mm-time';
        time.textContent = meta.time;
        bar.appendChild(time);
      }

      const actGroup = document.createElement('div');
      actGroup.className = 'd-flex gap-2 ms-auto align-items-center';

      const copyBtn = document.createElement('button');
      copyBtn.className = 'btn btn-link btn-xs text-light p-0 text-decoration-none opacity-75';
      copyBtn.innerHTML = '📋 Copy';
      copyBtn.title = 'Copy response text';
      copyBtn.onclick = function() { copyText(rawText, copyBtn); };
      actGroup.appendChild(copyBtn);

      const resendBtn = document.createElement('button');
      resendBtn.className = 'btn btn-link btn-xs text-warning p-0 text-decoration-none opacity-75';
      resendBtn.innerHTML = '🔄 Resend';
      resendBtn.title = 'Resend last user prompt';
      resendBtn.onclick = function() { resendLastUserPrompt(); };
      actGroup.appendChild(resendBtn);

      bar.appendChild(actGroup);
      return bar;
    }

    function formatTime(d) {
      const pad = n => (n < 10 ? '0' + n : '' + n);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return pad(d.getDate()) + ' ' + months[d.getMonth()] + ' ' + d.getFullYear() +
        ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    }

    function buildReplyMeta(requestedModel, actualModel) {
      const req = requestedModel || '';
      let id = actualModel || req || 'unknown';
      let viaAuto = false;

      const autoPrefix = 'auto (';
      if (id.indexOf(autoPrefix) === 0 && id.charAt(id.length - 1) === ')') {
        id = id.slice(autoPrefix.length, -1);
        viaAuto = true;
      }
      if (req === 'auto' || req.indexOf('auto/') === 0) viaAuto = true;

      let provider = modelProviderMap[id];
      if (!provider && id.indexOf('/') !== -1) provider = id.split('/')[0];
      if (!provider || provider === 'auto') provider = modelProviderMap[req] || provider || 'unknown';

      const name = modelNames[id] || modelNames[req] || '';
      const label = name && name !== id ? name : id;

      return { provider: provider, model: label, modelId: id, viaAuto: viaAuto, time: formatTime(new Date()) };
    }

    function renderMd(t) {
      let h = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      h = h.replace(/\`\`\`(\\w*)\\n([\\s\\S]*?)\`\`\`/g, '<pre><code>$2</code></pre>');
      h = h.replace(/\`(.*?)\`/g, '<code>$1</code>');
      h = h.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>');
      return h;
    }

    function parsePlainBody(raw, status) {
      const text = (raw || '').trim();
      if (!text) return { text: '[Error: HTTP ' + status + ' - empty response]', model: null };
      try {
        const d = JSON.parse(text);
        if (d.error) return { text: '[Error: ' + (d.error.message || JSON.stringify(d.error)) + ']', model: d.model || null };
        if (d.choices) return { text: d.choices[0]?.message?.content || '', model: d.model || null };
        return { text: '[Unexpected response from the provider]', model: d.model || null };
      } catch (e) {
        return { text: '[Error: HTTP ' + status + ' - ' + text.slice(0, 200) + ']', model: null };
      }
    }

    function addTyping() {
      const d = document.createElement('div');
      d.className = 'msg assistant';
      d.id = 'typing';
      d.innerHTML = '<span class="typing-indicator"><span>.</span><span>.</span><span>.</span></span>';
      chatBox.appendChild(d);
      scroll();
      return d;
    }

    function removeTyping() {
      const t = document.getElementById('typing');
      if (t) t.remove();
    }

    function pruneImages(msgs) {
      let lastImg = -1;
      for (let i = 0; i < msgs.length; i++) {
        const c = msgs[i].content;
        if (msgs[i].role === 'user' && Array.isArray(c) && c.some(p => p.type === 'image_url')) lastImg = i;
      }
      if (lastImg < 0) return msgs;
      const out = msgs.slice();
      for (let i = 0; i < out.length; i++) {
        if (i === lastImg) continue;
        const c = out[i].content;
        if (!Array.isArray(c) || !c.some(p => p.type === 'image_url')) continue;
        const parts = c.filter(p => p.type !== 'image_url');
        out[i] = { role: out[i].role, content: parts.length ? parts : '' };
      }
      return out;
    }

    let lastRenderAt = 0;
    function renderLive(el, text, force) {
      const now = Date.now();
      if (!force && now - lastRenderAt < 80) return;
      lastRenderAt = now;
      el.innerHTML = renderMd(text);
      scroll();
    }

    async function send() {
      let text = msgInput.value.trim();
      if (!text && !attachedFileDataUrl) return;
      if (busy) return;

      const model = document.getElementById('model').value;
      if (!model) { pmToast('Select a model first', 'error'); return; }
      const stream = document.getElementById('streamToggle').checked;
      const webSearch = document.getElementById('webSearchToggle').checked;

      let msgContent = text;
      if (attachedFileDataUrl) {
        if (!text) text = 'Analyze attached file';
        msgContent = [
          { type: 'text', text: text },
          { type: 'image_url', image_url: { url: attachedFileDataUrl } }
        ];
      }

      addMsg('user', text, attachedFileDataUrl);
      messages.push({ role: 'user', content: msgContent });
      messages = pruneImages(messages);

      clearAttachedFile();
      msgInput.value = '';
      msgInput.focus();

      busy = true;
      sendBtn.classList.add('d-none');
      stopBtn.classList.remove('d-none');
      abortCtrl = new AbortController();
      const typingDiv = addTyping();
      let full = '';
      let displayError = '';
      let actualModel = null;
      let aborted = false;
      lastRenderAt = 0;

      try {
        const resp = await fetch('/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages, stream, webSearch }),
          signal: abortCtrl.signal,
        });

        const ctype = (resp.headers.get('content-type') || '').toLowerCase();

        if (ctype.indexOf('text/event-stream') !== -1) {
          const reader = resp.body.getReader();
          const dec = new TextDecoder();
          let buf = '';
          let raw = '';
          let sawData = false;

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const text = dec.decode(value, { stream: true });
              buf += text;
              if (!sawData) raw += text;
              const lines = buf.split('\\n');
              buf = lines.pop() || '';
              for (const line of lines) {
                const t = line.trim();
                if (!t || t === 'data: [DONE]' || !t.startsWith('data:')) continue;
                const j = t.slice(5).trim();
                if (!j || j === '[DONE]') continue;
                sawData = true;
                try {
                  const p = JSON.parse(j);
                  if (p.model) actualModel = p.model;
                  if (p.error) displayError = '\\n[Error: ' + p.error.message + ']';
                  else {
                    const d = p.choices?.[0]?.delta?.content || '';
                    if (d) full += d;
                  }
                  renderLive(typingDiv, full + displayError);
                } catch {}
              }
            }
          } finally {
            reader.cancel().catch(() => {});
          }

          if (!sawData) {
            const parsed = parsePlainBody(raw, resp.status);
            if (parsed.model) actualModel = parsed.model;
            if (parsed.text) full += parsed.text;
          }
        } else {
          const parsed = parsePlainBody(await resp.text(), resp.status);
          if (parsed.model) actualModel = parsed.model;
          full = parsed.text;
          if (full) {
            typingDiv.innerHTML = renderMd(full);
            scroll();
          }
        }
      } catch (e) {
        if (e.name === 'AbortError') {
          aborted = true;
        } else {
          displayError = '\\n[Error: ' + e.message + ']';
          renderLive(typingDiv, full + displayError, true);
        }
      } finally {
        // State must always be restored, or one bad reply bricks the UI.
        removeTyping();
        if (!aborted && !full && !displayError) displayError = '[The provider returned an empty response]';
        const finalDisplay = full + displayError;
        if (finalDisplay) {
          addMsg('assistant', finalDisplay, null, buildReplyMeta(model, actualModel));
        }
        // Errors are shown but never stored in history, so a transient
        // failure is not re-sent to the model on every later turn.
        if (full && !displayError) {
          messages.push({ role: 'assistant', content: full });
        }
        busy = false;
        sendBtn.classList.remove('d-none');
        stopBtn.classList.add('d-none');
      }

      fetchLogs();
    }

    function stopStream() { if (abortCtrl) abortCtrl.abort(); }
    function clearChat() {
      if (abortCtrl) abortCtrl.abort();
      messages = [];
      clearAttachedFile();
      chatBox.innerHTML = '<div class="msg system">Chat cleared. Select a model to start.</div>';
    }

    let customProvidersData = [];

    async function loadCustomProvidersList() {
      initCpTypeSelect2();
      const data = await apiFetch('/v1/custom-providers');
      if (!data) return;
      customProvidersData = data.data || [];
      const container = document.getElementById('customProvidersList');
      const countBadge = document.getElementById('cpCountBadge');
      if (countBadge) countBadge.textContent = customProvidersData.length;
      if (customProvidersData.length === 0) {
        container.innerHTML = '<div class="pm-empty"><span class="big">🔌</span><span>No custom providers yet.<br>Add one above to get started.</span></div>';
        return;
      }
      let html = '';
      for (const p of customProvidersData) {
        const typeBadge = (p.type || 'openai').toUpperCase();
        const cpModelNames = p.models ? p.models.map(m => typeof m === 'string' ? m : (m.name || m.id)).join(', ') : 'Auto-fetch';
        html += \`<div class="pm-prov-card">
          <div style="min-width:0;">
            <div><strong class="pm-combo-name">\${escapeHtml(p.name)}</strong><span class="pm-combo-id">\${escapeHtml(p.id)}</span> <span class="pm-prov-count">\${escapeHtml(typeBadge)}</span></div>
            <div class="small text-secondary mt-1" style="font-size:0.76rem;">🔗 \${escapeHtml(p.url || 'Default API URL')}</div>
            <div class="pm-combo-seq">Models (\${p.models ? p.models.length : 0}): \${escapeHtml(cpModelNames)}</div>
          </div>
          <div class="d-flex gap-2 flex-shrink-0">
            <button class="btn btn-sm btn-outline-warning" onclick="editCustomProvider('\${escapeHtml(p.id)}')">✏️ Edit</button>
            <button class="btn btn-sm btn-outline-info" onclick="refreshCustomProvider('\${escapeHtml(p.id)}')">🔄 Refresh</button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteCustomProvider('\${escapeHtml(p.id)}')">🗑️</button>
          </div>
        </div>\`;
      }
      container.innerHTML = html;
    }

    function editCustomProvider(id) {
      const p = customProvidersData.find(item => item.id === id);
      if (!p) return;

      document.getElementById('cpType').value = p.type || 'openai';
      onCpTypeChange();
      syncCpTypeSelect2UI();

      const cpIdInput = document.getElementById('cpId');
      cpIdInput.value = p.id;
      cpIdInput.readOnly = true;

      document.getElementById('cpName').value = p.name || '';
      document.getElementById('cpUrl').value = p.url || '';
      document.getElementById('cpKey').value = p.apiKey || '';
      document.getElementById('cpModels').value = p.models ? p.models.map(m => typeof m === 'string' ? m : (m.id || m.name)).join(', ') : '';

      const cancelBtn = document.getElementById('cpCancelEditBtn');
      if (cancelBtn) cancelBtn.classList.remove('d-none');

      const cpTitle = document.getElementById('cpFormTitle');
      if (cpTitle) cpTitle.textContent = 'Edit Custom API Provider';

      const modalBody = document.querySelector('#customProviderModal .modal-body');
      if (modalBody) modalBody.scrollTop = 0;
    }

    function resetCustomProviderForm() {
      const cpIdInput = document.getElementById('cpId');
      if (cpIdInput) {
        cpIdInput.value = '';
        cpIdInput.readOnly = false;
      }
      document.getElementById('cpName').value = '';
      document.getElementById('cpUrl').value = '';
      document.getElementById('cpKey').value = '';
      document.getElementById('cpModels').value = '';
      document.getElementById('cpType').value = 'openai';
      onCpTypeChange();
      syncCpTypeSelect2UI();

      const cancelBtn = document.getElementById('cpCancelEditBtn');
      if (cancelBtn) cancelBtn.classList.add('d-none');

      const cpTitle = document.getElementById('cpFormTitle');
      if (cpTitle) cpTitle.textContent = 'Add Custom API Provider';
    }

    // --- CONSOLE LOGS LOGIC ---
    let allLogs = [];
    let autoRefreshTimer = null;

    async function fetchLogs() {
      try {
        const maxId = allLogs.length ? allLogs[0].id : 0;
        const resp = await fetch('/v1/logs?since=' + maxId);
        const data = await resp.json();
        const incoming = data.data || [];
        if (incoming.length === 0) return; // nothing new: skip the DOM rebuild
        if (maxId > 0) {
          const known = new Set(allLogs.map(l => l.id));
          allLogs = incoming.filter(l => !known.has(l.id)).concat(allLogs).slice(0, 500);
        } else {
          allLogs = incoming;
        }
        renderLogs();
      } catch (err) {
        console.error('Failed to fetch logs:', err);
      }
    }

    function renderLogs() {
      const pEl = document.getElementById('providerFilter');
      const sEl = document.getElementById('statusFilter');
      const qEl = document.getElementById('searchInput');
      if (!pEl || !sEl || !qEl) return;
      const pFilter = pEl.value;
      const sFilter = sEl.value;
      const search = qEl.value.trim().toLowerCase();

      const filtered = allLogs.filter(item => {
        if (pFilter !== 'all' && item.provider !== pFilter && !item.model.startsWith(pFilter + '/')) return false;
        if (sFilter === '200' && item.status >= 400) return false;
        if (sFilter === 'error' && item.status < 400) return false;
        if (search) {
          const matchPrompt = item.prompt.toLowerCase().includes(search);
          const matchModel = item.model.toLowerCase().includes(search) || (item.actualModel && item.actualModel.toLowerCase().includes(search));
          const matchResponse = item.response.toLowerCase().includes(search);
          const matchError = item.error && item.error.toLowerCase().includes(search);
          if (!matchPrompt && !matchModel && !matchResponse && !matchError) return false;
        }
        return true;
      });

      const badge = document.getElementById('logCountBadge');
      if (badge) badge.textContent = filtered.length + ' / ' + allLogs.length + ' Logs';

      const container = document.getElementById('logsContainer');
      if (!container) return;
      if (filtered.length === 0) {
        container.innerHTML = '<div class="text-center text-secondary py-5"><p>No provider logs matched.</p><p class="small">Send a message in the chat panel to see real-time request logs here.</p></div>';
        return;
      }

      // Preserve reading position across the rebuild: auto-refresh used to
      // snap the panel back to the top every 2 seconds.
      const prevScroll = container.scrollTop;
      const wasAtBottom = container.scrollHeight - prevScroll - container.clientHeight < 60;

      let html = '';
      for (const log of filtered) {
        const isErr = log.status >= 400 || !!log.error;
        const statusClass = isErr ? 'badge-status-error' : 'badge-status-200';
        const streamText = log.stream ? 'SSE' : 'JSON';
        const webText = log.webSearch ? ' | Web' : '';

        html += \`<div class="log-card">
          <div class="log-header">
            <span class="badge \${statusClass}">\${log.status} \${isErr ? 'Err' : 'OK'}</span>
            <span class="badge badge-provider">\${escapeHtml(log.provider)}</span>
            <span class="badge badge-model" title="Requested: \${escapeHtml(log.model)}">\${escapeHtml(log.actualModel || log.model)}</span>
            <span class="badge badge-latency">\${log.durationMs} ms</span>
            <span class="badge bg-secondary">\${streamText}\${webText}</span>
            <span class="log-time">\${escapeHtml(log.time)}</span>
          </div>
          \${log.prompt ? \`<div class="log-prompt"><strong>Prompt:</strong> \${escapeHtml(log.prompt)}</div>\` : ''}
          \${log.response ? \`<div class="log-response"><strong>Response:</strong> \${escapeHtml(log.response)}</div>\` : ''}
          \${log.error ? \`<div class="log-error"><strong>Error:</strong> \${escapeHtml(log.error)}</div>\` : ''}
        </div>\`;
      }
      container.innerHTML = html;
      container.scrollTop = wasAtBottom ? container.scrollHeight : prevScroll;
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    async function clearLogs() {
      if (!await confirmSwal('Clear all in-memory provider logs?')) return;
      const res = await apiFetch('/v1/logs', { method: 'DELETE' });
      if (!res) return;
      allLogs = [];
      renderLogs();
      await fetchLogs();
    }

    function toggleAutoRefresh() {
      const el = document.getElementById('autoRefreshToggle');
      if (!el) return;
      const enabled = el.checked;
      if (enabled) {
        if (!autoRefreshTimer) autoRefreshTimer = setInterval(fetchLogs, 2000);
      } else {
        if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
      }
    }

    // Debounced keystroke handlers: rebuilding 300 log cards / a whole
    // <select> / the model pool on every character was janky.
    function debounceFn(fn, ms) {
      let t = null;
      return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), ms);
      };
    }
    const debouncedRenderLogs = debounceFn(() => renderLogs(), 150);
    const debouncedFilterModels = debounceFn(() => filterModels(), 150);
    const debouncedFilterComboPool = debounceFn(() => filterComboModelPool(), 150);

    let isSplitDragging = false;

    function initSplitView() {
      const resizer = document.getElementById('splitResizer');
      const container = document.getElementById('splitContainer');
      const leftPane = document.getElementById('chatPane');
      const rightPane = document.getElementById('logsPane');
      if (!resizer || !container || !leftPane || !rightPane) return;

      resizer.addEventListener('mousedown', () => {
        isSplitDragging = true;
        resizer.classList.add('is-dragging');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      });

      document.addEventListener('mousemove', e => {
        if (!isSplitDragging) return;
        const rect = container.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        let percent = (offsetX / rect.width) * 100;
        if (percent < 20) percent = 20;
        if (percent > 80) percent = 80;

        leftPane.style.width = percent + '%';
        rightPane.style.width = (100 - percent) + '%';
        localStorage.setItem('up_split_ratio', percent.toFixed(1));
      });

      document.addEventListener('mouseup', () => {
        if (isSplitDragging) {
          isSplitDragging = false;
          resizer.classList.remove('is-dragging');
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        }
      });

      const savedRatio = localStorage.getItem('up_split_ratio');
      if (savedRatio && window.innerWidth >= 992) {
        const val = parseFloat(savedRatio);
        if (val >= 20 && val <= 80) {
          leftPane.style.width = val + '%';
          rightPane.style.width = (100 - val) + '%';
        }
      }

      const savedMode = localStorage.getItem('up_layout_mode') || 'split';
      setLayoutMode(savedMode);
    }

    function setLayoutMode(mode) {
      const container = document.getElementById('splitContainer');
      const btnSplit = document.getElementById('btnViewSplit');
      const btnChat = document.getElementById('btnViewChat');
      const btnLogs = document.getElementById('btnViewLogs');
      if (!container) return;

      container.classList.remove('layout-chat-only', 'layout-logs-only');

      [btnSplit, btnChat, btnLogs].forEach(b => {
        if (b) {
          b.classList.remove('active', 'btn-primary');
          b.classList.add('btn-outline-secondary');
        }
      });

      if (mode === 'chat') {
        container.classList.add('layout-chat-only');
        if (btnChat) {
          btnChat.classList.add('active', 'btn-primary');
          btnChat.classList.remove('btn-outline-secondary');
        }
      } else if (mode === 'logs') {
        container.classList.add('layout-logs-only');
        if (btnLogs) {
          btnLogs.classList.add('active', 'btn-primary');
          btnLogs.classList.remove('btn-outline-secondary');
        }
      } else {
        if (btnSplit) {
          btnSplit.classList.add('active', 'btn-primary');
          btnSplit.classList.remove('btn-outline-secondary');
        }
      }

      localStorage.setItem('up_layout_mode', mode);
    }

    fetchLogs();
    toggleAutoRefresh();
    initSplitView();
  </script>

  <!-- Change Password Modal -->
  <div class="modal fade" id="changePasswordModal" tabindex="-1" aria-labelledby="changePasswordModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content" style="background: #0f172a; border: 1px solid #1e293b; color: #f8fafc; border-radius: 16px;">
        <div class="modal-header" style="border-bottom: 1px solid #1e293b;">
          <h5 class="modal-title fw-bold" id="changePasswordModalLabel">🔑 Change Admin Password</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <form id="changePasswordForm" onsubmit="saveNewPassword(event)">
            <div class="mb-3">
              <label class="pm-label">Current Password</label>
              <input type="password" id="cpCurrentPassword" class="form-control form-control-sm" placeholder="Enter current password" required>
            </div>
            <div class="mb-3">
              <label class="pm-label">New Password</label>
              <input type="password" id="cpNewPassword" class="form-control form-control-sm" placeholder="Enter new password (min 4 chars)" required minlength="4">
            </div>
            <div class="mb-3">
              <label class="pm-label">Confirm New Password</label>
              <input type="password" id="cpConfirmPassword" class="form-control form-control-sm" placeholder="Confirm new password" required minlength="4">
            </div>
            <div id="cpPassError" class="alert alert-danger py-2 px-3 small d-none mb-3"></div>
            <div class="d-flex justify-content-end gap-2">
              <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="submit" id="cpSavePassBtn" class="btn btn-sm btn-primary fw-bold">Update Password</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>

  <script>
    async function handleLogout() {
      try {
        await fetch('/v1/auth/logout', {
          method: 'POST',
          headers: { 'x-session-token': localStorage.getItem('up_session_token') || '' }
        });
      } catch {}
      localStorage.removeItem('up_session_token');
      document.cookie = 'session_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
      window.location.href = '/login';
    }

    async function saveNewPassword(e) {
      e.preventDefault();
      const currentPassword = document.getElementById('cpCurrentPassword').value;
      const newPassword = document.getElementById('cpNewPassword').value;
      const confirmPassword = document.getElementById('cpConfirmPassword').value;
      const errorDiv = document.getElementById('cpPassError');
      const btn = document.getElementById('cpSavePassBtn');

      errorDiv.classList.add('d-none');

      if (newPassword !== confirmPassword) {
        errorDiv.textContent = 'New password and confirmation do not match';
        errorDiv.classList.remove('d-none');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Updating...';

      try {
        const resp = await fetch('/v1/auth/change-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-session-token': localStorage.getItem('up_session_token') || ''
          },
          body: JSON.stringify({ currentPassword, newPassword })
        });
        const data = await resp.json();
        if (resp.ok && data.status === 'ok') {
          if (typeof Swal !== 'undefined' && typeof Swal.fire === 'function') {
            await Swal.fire({
              icon: 'success',
              title: 'Password Updated!',
              text: 'Password updated successfully. Please log in again.',
              confirmButtonColor: '#2563eb',
              background: '#0f172a',
              color: '#f8fafc'
            });
          } else if (typeof pmToast === 'function') {
            pmToast('Password updated successfully! Redirecting to login...', 'success');
          } else {
            alert('Password updated successfully! Please log in again.');
          }
          setTimeout(() => {
            handleLogout();
          }, 400);
        } else {
          errorDiv.textContent = (data.error && data.error.message) || 'Failed to update password';
          errorDiv.classList.remove('d-none');
        }
      } catch (err) {
        errorDiv.textContent = 'Network error: ' + err.message;
        errorDiv.classList.remove('d-none');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Update Password';
      }
    }
  </script>
</body>
</html>`);
});

// Universal API Documentation
app.get('/docs', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Universal AI API Documentation</title>
  <link href="/assets/css/bootstrap.min.css" rel="stylesheet">
  <link href="/assets/css/sweetalert2.min.css" rel="stylesheet">
  <script src="/assets/js/bootstrap.bundle.min.js"></script>
  <script src="/assets/js/sweetalert2.all.min.js"></script>
  <style>
    body { background: #070a12; color: #f8fafc; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; }
    .sticky-navbar { background: rgba(15,23,42,0.85); backdrop-filter: blur(12px); border-bottom: 1px solid #1e293b; z-index: 1040; }
    .docs-sidebar { position: sticky; top: 80px; background: #0f172a; border: 1px solid #1e293b; border-radius: 14px; padding: 14px; box-shadow: 0 4px 16px rgba(0,0,0,0.3); }
    .docs-nav-title { font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: #60a5fa; margin-bottom: 8px; padding-left: 8px; }
    .docs-nav-link { display: block; padding: 7px 10px; color: #94a3b8; font-size: 0.84rem; font-weight: 600; text-decoration: none; border-radius: 8px; transition: all 0.15s ease; margin-bottom: 2px; }
    .docs-nav-link:hover, .docs-nav-link.active { color: #60a5fa; background: rgba(59,130,246,0.12); }
    .hero-card { background: linear-gradient(135deg, rgba(37,99,235,0.12) 0%, rgba(124,58,237,0.12) 100%); border: 1px solid #1e293b; border-radius: 16px; padding: 24px 28px; margin-bottom: 24px; }
    .hero-title { font-weight: 800; font-size: 1.8rem; background: linear-gradient(135deg, #60a5fa, #c084fc); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 14px; box-shadow: 0 4px 16px rgba(0,0,0,0.3); overflow: hidden; margin-bottom: 24px; }
    .card-header { background: rgba(15,23,42,0.95); border-bottom: 1px solid #1e293b; padding: 14px 18px; font-weight: 700; color: #f8fafc; }
    .badge-method { font-size: 0.72rem; font-weight: 800; padding: 4px 10px; border-radius: 6px; letter-spacing: 0.5px; }
    .method-post { background: #166534; color: #4ade80; border: 1px solid #22c55e; }
    .method-get { background: #1e3a8a; color: #60a5fa; border: 1px solid #3b82f6; }
    .method-delete { background: #7f1d1d; color: #fca5a5; border: 1px solid #ef4444; }
    .code-box { position: relative; background: #070a12; border: 1px solid #1e293b; border-radius: 10px; overflow: hidden; margin: 12px 0; }
    .code-box-header { display: flex; justify-content: space-between; align-items: center; background: #0b1120; padding: 6px 14px; border-bottom: 1px solid #1e293b; font-size: 0.75rem; color: #64748b; font-family: monospace; }
    .code-box pre { margin: 0; padding: 14px; background: #070a12; overflow-x: auto; color: #f8fafc; font-size: 0.85rem; line-height: 1.5; font-family: 'Consolas', monospace; }
    code { color: #38bdf8; font-family: 'Consolas', monospace; font-size: 0.88rem; }
    .param-required { background: rgba(239,68,68,0.15); color: #fca5a5; border: 1px solid rgba(239,68,68,0.3); font-size: 0.68rem; font-weight: 700; padding: 2px 7px; border-radius: 4px; }
    .param-optional { background: rgba(148,163,184,0.15); color: #cbd5e1; border: 1px solid rgba(148,163,184,0.3); font-size: 0.68rem; font-weight: 600; padding: 2px 7px; border-radius: 4px; }
    table.table-dark { background: transparent; color: #f8fafc; margin-bottom: 0; }
    table.table-dark th { background: #0b1120; color: #60a5fa; border-color: #1e293b; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.6px; }
    table.table-dark td { border-color: #1e293b; font-size: 0.84rem; vertical-align: middle; }
    .anchor-link { color: #60a5fa; text-decoration: none; margin-right: 8px; opacity: 0.7; }
    .anchor-link:hover { opacity: 1; }
    a { color: #60a5fa; text-decoration: none; }
    a:hover { color: #93c5fd; text-decoration: underline; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #070a12; }
    ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #475569; }
  </style>
</head>
<body>
  <nav class="navbar navbar-dark sticky-top sticky-navbar px-3">
    <div class="container-fluid px-0">
      <span class="navbar-brand mb-0 h1 fs-5 fw-bold" style="background: linear-gradient(135deg, #60a5fa, #c084fc); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Universal AI Proxy</span>
      <div class="d-flex align-items-center gap-2">
        <a href="/" class="btn btn-sm btn-outline-primary">Home</a>
        <button class="btn btn-sm btn-outline-warning" data-bs-toggle="modal" data-bs-target="#changePasswordModal">🔑 Password</button>
        <button class="btn btn-sm btn-outline-danger" onclick="handleLogout()">🚪 Logout</button>
        <span class="badge bg-primary ms-1">v2.1</span>
      </div>
    </div>
  </nav>

  <div class="container-fluid px-4 py-4">
    <div class="row g-4">
      <!-- Left Sidebar Quick Navigation -->
      <div class="col-lg-3 col-xl-2 d-none d-lg-block">
        <div class="docs-sidebar">
          <div class="docs-nav-title">API Quick Nav</div>
          <a href="#overview" class="docs-nav-link">📌 Overview & Base URL</a>
          <a href="#authentication" class="docs-nav-link">🔒 Authentication</a>
          <a href="#chat" class="docs-nav-link">💬 Chat Completions</a>
          <a href="#providers" class="docs-nav-link">🌐 Built-in Web Providers</a>
          <a href="#custom-providers" class="docs-nav-link">🔌 Custom API Providers</a>
          <a href="#combo-routers" class="docs-nav-link">🎛 Combo Routers & Auto</a>
          <a href="#logs" class="docs-nav-link">📋 Console Logs API</a>
          <a href="#examples" class="docs-nav-link">💻 Code Examples</a>
        </div>
      </div>

      <!-- Right Main Content Area (Full Width) -->
      <div class="col-lg-9 col-xl-10">
        
        <!-- Hero Banner -->
        <div id="overview" class="hero-card">
          <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div>
              <h1 class="hero-title mb-2">Universal API Documentation</h1>
              <p class="text-secondary mb-0">Unified OpenAI-compatible REST API supporting multimodal base64 image/file inputs, Web Search toggle, built-in free web providers, Custom Providers, and Drag-and-Drop Auto Fallback Routers.</p>
            </div>
            <span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-3 py-2 fw-semibold fs-6">🟢 OpenAI Compatible v1</span>
          </div>

          <div class="code-box mt-3 mb-0">
            <div class="code-box-header">
              <span>BASE ENDPOINT URL</span>
              <button class="btn btn-sm btn-outline-light py-0 px-2 small" onclick="copyTextDirect('http://localhost:3000/v1', this)">📋 Copy URL</button>
            </div>
            <pre><code>http://localhost:3000/v1</code></pre>
          </div>
        </div>

        <!-- Section: Authentication -->
        <div id="authentication" class="card">
          <div class="card-header d-flex align-items-center justify-content-between">
            <span>🔒 Authentication & Security</span>
            <span class="badge bg-info-subtle text-info border border-info-subtle rounded-pill">Bearer / x-admin-key</span>
          </div>
          <div class="card-body">
            <p class="text-secondary">Requests can be authenticated via Session Token, Admin Key (if <code>ADMIN_KEY</code> is enabled in <code>.env</code>), or passed as Bearer headers.</p>
            <div class="table-responsive mb-3">
              <table class="table table-dark table-hover align-middle">
                <thead><tr><th>Header / Parameter</th><th>Type</th><th>Description</th></tr></thead>
                <tbody>
                  <tr><td><code>Authorization</code></td><td>Header</td><td><code>Bearer &lt;token_or_admin_key&gt;</code></td></tr>
                  <tr><td><code>x-admin-key</code></td><td>Header</td><td>Admin Key authentication header for mutating operations</td></tr>
                  <tr><td><code>x-session-token</code></td><td>Header</td><td>Active session token created via <code>/v1/auth/login</code></td></tr>
                  <tr><td><code>session_token</code></td><td>Cookie</td><td>HTTP-Only / Lax browser session cookie</td></tr>
                </tbody>
              </table>
            </div>

            <h6 class="fw-bold mb-2">Auth Endpoints</h6>
            <div class="table-responsive">
              <table class="table table-dark align-middle">
                <thead><tr><th>Method</th><th>Endpoint</th><th>Description</th></tr></thead>
                <tbody>
                  <tr><td><span class="badge badge-method method-post">POST</span></td><td><code>/v1/auth/login</code></td><td>Authenticate admin password and receive session token</td></tr>
                  <tr><td><span class="badge badge-method method-post">POST</span></td><td><code>/v1/auth/logout</code></td><td>Revoke active session token</td></tr>
                  <tr><td><span class="badge badge-method method-post">POST</span></td><td><code>/v1/auth/change-password</code></td><td>Update stored admin password (requires current password)</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Section: Chat Completions -->
        <div id="chat" class="card">
          <div class="card-header d-flex align-items-center justify-content-between">
            <div class="d-flex align-items-center gap-2">
              <span class="badge badge-method method-post">POST</span>
              <code class="fs-6 text-light">/v1/chat/completions</code>
            </div>
            <span class="small text-secondary">Chat Completion (SSE Stream or JSON)</span>
          </div>
          <div class="card-body">
            <p class="text-secondary">Standard OpenAI format. Supports streaming, web search toggle, and multimodal base64 image/file inputs.</p>
            
            <h6 class="fw-bold mb-2">Request Body Parameters</h6>
            <div class="table-responsive mb-3">
              <table class="table table-dark align-middle">
                <thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
                <tbody>
                  <tr><td><code>model</code></td><td>string</td><td><span class="param-required">required</span></td><td>Use <code>auto</code> for automatic failover, <code>combo/&lt;id&gt;</code> for combo routers, or <code>providerId/modelName</code></td></tr>
                  <tr><td><code>messages</code></td><td>array</td><td><span class="param-required">required</span></td><td>Array of message objects <code>[{role, content}]</code>. <code>content</code> supports string or multimodal array</td></tr>
                  <tr><td><code>stream</code></td><td>boolean</td><td><span class="param-optional">optional</span></td><td>Enable SSE event-stream. Default: <code>true</code></td></tr>
                  <tr><td><code>webSearch</code></td><td>boolean</td><td><span class="param-optional">optional</span></td><td>Enable real-time web search for supported providers. Default: <code>false</code></td></tr>
                </tbody>
              </table>
            </div>

            <h6 class="fw-bold mb-2">cURL Example (Streaming & Web Search)</h6>
            <div class="code-box">
              <div class="code-box-header">
                <span>cURL</span>
                <button class="btn btn-sm btn-outline-light py-0 px-2 small" onclick="copyCodeBlock(this)">📋 Copy</button>
              </div>
              <pre><code>curl -X POST http://localhost:3000/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "auto",
    "stream": true,
    "webSearch": true,
    "messages": [
      { "role": "user", "content": "What is the latest news today?" }
    ]
  }'</code></pre>
            </div>

            <h6 class="fw-bold mb-2 mt-3">Multimodal Base64 Image Example</h6>
            <div class="code-box">
              <div class="code-box-header">
                <span>cURL</span>
                <button class="btn btn-sm btn-outline-light py-0 px-2 small" onclick="copyCodeBlock(this)">📋 Copy</button>
              </div>
              <pre><code>curl -X POST http://localhost:3000/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "freemodels/claude-sonnet-5",
    "messages": [
      {
        "role": "user",
        "content": [
          { "type": "text", "text": "Analyze this chart image" },
          { "type": "image_url", "image_url": { "url": "data:image/png;base64,iVBORw0KGgoAAA..." } }
        ]
      }
    ]
  }'</code></pre>
            </div>
          </div>
        </div>

        <!-- Section: Built-in Web Providers -->
        <div id="providers" class="card">
          <div class="card-header d-flex align-items-center justify-content-between">
            <span>🌐 Built-in Free Web Providers</span>
            <span class="small text-secondary">Zero Configuration Required</span>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-dark table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>Provider ID</th>
                    <th>Name</th>
                    <th>Upstream Website</th>
                    <th>Transport</th>
                    <th>Available Models</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><code>auto</code></td>
                    <td>Auto Failover Router</td>
                    <td><span class="text-secondary">Internal Failover</span></td>
                    <td><span class="badge bg-success">Auto Router</span></td>
                    <td><code>auto</code></td>
                  </tr>
                  <tr>
                    <td><code>freemodels</code></td>
                    <td>FreeModels Chat</td>
                    <td><a href="https://freemodels-chat.freemodels.workers.dev" target="_blank" rel="noopener noreferrer">freemodels.workers.dev ↗</a></td>
                    <td><span class="badge bg-primary">HTTP / SSE</span></td>
                    <td><code>claude-sonnet-5</code>, <code>claude-fable-5</code>, <code>claude-fable-5.1</code>, <code>gpt-5.6-sol</code>, <code>gpt-5.6-terra</code>, <code>glm-5.2</code>, <code>kimi-k3</code></td>
                  </tr>
                  <tr>
                    <td><code>duckai</code></td>
                    <td>DuckDuckGo AI Chat</td>
                    <td><a href="https://duck.ai" target="_blank" rel="noopener noreferrer">duck.ai ↗</a></td>
                    <td><span class="badge bg-warning text-dark">Chrome Driver</span></td>
                    <td><code>gpt-5.6-luna</code>, <code>gpt-5.4-mini</code>, <code>claude-haiku-4-5</code>, <code>mistral-small-2603</code></td>
                  </tr>
                  <tr>
                    <td><code>unlimitedai</code></td>
                    <td>UnlimitedAI Chat</td>
                    <td><a href="https://unlimitedai.org" target="_blank" rel="noopener noreferrer">unlimitedai.org ↗</a></td>
                    <td><span class="badge bg-warning text-dark">Chrome Driver</span></td>
                    <td><code>chatgpt</code>, <code>gemini</code>, <code>deepseek</code>, <code>claude</code>, <code>grok</code>, <code>perplexity</code>, <code>meta</code>, <code>qwen</code></td>
                  </tr>
                  <tr>
                    <td><code>aichatting</code></td>
                    <td>AIChatting</td>
                    <td><a href="https://aichatting.net" target="_blank" rel="noopener noreferrer">aichatting.net ↗</a></td>
                    <td><span class="badge bg-primary">HTTP / SSE</span></td>
                    <td><code>gpt-5.6-luna</code>, <code>ask-ai</code></td>
                  </tr>
                  <tr>
                    <td><code>aibanglachat</code></td>
                    <td>AiBanglaChat</td>
                    <td><a href="https://www.aibanglachat.com" target="_blank" rel="noopener noreferrer">aibanglachat.com ↗</a></td>
                    <td><span class="badge bg-primary">HTTP API</span></td>
                    <td><code>bangla-ai</code>, <code>bangla-ai-web</code></td>
                  </tr>
                  <tr>
                    <td><code>eye2ai</code></td>
                    <td>Eye2.ai Multi-LLM Engine</td>
                    <td><a href="https://www.eye2.ai" target="_blank" rel="noopener noreferrer">eye2.ai ↗</a></td>
                    <td><span class="badge bg-info text-dark">Socket.io</span></td>
                    <td><code>chatgpt</code>, <code>gemini</code>, <code>qwen</code>, <code>mistral</code>, <code>deepseek</code>, <code>ai21</code>, <code>amazon-nova</code>, <code>glm</code>, <code>smart</code>, <code>cohere</code>, <code>minimax</code>, <code>gemma</code>, <code>mercury</code></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Section: Custom API Providers -->
        <div id="custom-providers" class="card">
          <div class="card-header d-flex align-items-center justify-content-between">
            <span>🔌 Custom API Providers (/v1/custom-providers)</span>
            <span class="small text-secondary">OpenAI, Gemini, Claude, OpenRouter, Groq, DeepSeek, etc.</span>
          </div>
          <div class="card-body">
            <p class="text-secondary">Register custom API endpoints. Supports multi-key round-robin rotation, auto model discovery, and presets for OpenRouter, Mistral, Grok, Ollama, OpenCode Zen, Poolside, BazaarLink, Kilo Gateway, DeepSeek, and Groq.</p>

            <div class="table-responsive mb-3">
              <table class="table table-dark align-middle">
                <thead><tr><th>Method</th><th>Endpoint</th><th>Description</th></tr></thead>
                <tbody>
                  <tr><td><span class="badge badge-method method-get">GET</span></td><td><code>/v1/custom-providers</code></td><td>List all configured custom API providers</td></tr>
                  <tr><td><span class="badge badge-method method-post">POST</span></td><td><code>/v1/custom-providers</code></td><td>Create or update a custom API provider</td></tr>
                  <tr><td><span class="badge badge-method method-post">POST</span></td><td><code>/v1/custom-providers/:id/refresh</code></td><td>Re-fetch auto-discovered model list from provider</td></tr>
                  <tr><td><span class="badge badge-method method-delete">DELETE</span></td><td><code>/v1/custom-providers/:id</code></td><td>Remove a custom API provider</td></tr>
                </tbody>
              </table>
            </div>

            <h6 class="fw-bold mb-2">Register OpenRouter / Groq Provider Example</h6>
            <div class="code-box">
              <div class="code-box-header">
                <span>cURL</span>
                <button class="btn btn-sm btn-outline-light py-0 px-2 small" onclick="copyCodeBlock(this)">📋 Copy</button>
              </div>
              <pre><code>curl -X POST http://localhost:3000/v1/custom-providers \\
  -H "Content-Type: application/json" \\
  -d '{
    "id": "openrouter",
    "name": "OpenRouter",
    "type": "openai",
    "url": "https://openrouter.ai/api/v1",
    "apiKey": "sk-or-v1-key1, sk-or-v1-key2",
    "models": ["google/gemini-2.0-flash-001", "anthropic/claude-3.5-sonnet"]
  }'</code></pre>
            </div>
          </div>
        </div>

        <!-- Section: Combo Routers -->
        <div id="combo-routers" class="card">
          <div class="card-header d-flex align-items-center justify-content-between">
            <span>🎛 Custom Combo Routers & Auto Sequence</span>
            <span class="small text-secondary">Drag & Drop Failover Sequences</span>
          </div>
          <div class="card-body">
            <p class="text-secondary">Build custom multi-provider failover sequences or update the global <code>auto</code> router priority order.</p>

            <div class="table-responsive mb-3">
              <table class="table table-dark align-middle">
                <thead><tr><th>Method</th><th>Endpoint</th><th>Description</th></tr></thead>
                <tbody>
                  <tr><td><span class="badge badge-method method-get">GET</span></td><td><code>/v1/combos</code></td><td>List combo routers & auto router failover sequence</td></tr>
                  <tr><td><span class="badge badge-method method-post">POST</span></td><td><code>/v1/combos</code></td><td>Create or update a custom combo router</td></tr>
                  <tr><td><span class="badge badge-method method-post">POST</span></td><td><code>/v1/combos/auto-sequence</code></td><td>Update global <code>auto</code> failover sequence</td></tr>
                  <tr><td><span class="badge badge-method method-delete">DELETE</span></td><td><code>/v1/combos/:id</code></td><td>Delete a custom combo router</td></tr>
                </tbody>
              </table>
            </div>

            <h6 class="fw-bold mb-2">Create Combo Router Example</h6>
            <div class="code-box">
              <div class="code-box-header">
                <span>cURL</span>
                <button class="btn btn-sm btn-outline-light py-0 px-2 small" onclick="copyCodeBlock(this)">📋 Copy</button>
              </div>
              <pre><code>curl -X POST http://localhost:3000/v1/combos \\
  -H "Content-Type: application/json" \\
  -d '{
    "id": "fast-mix",
    "name": "Fast Claude & GPT Combo",
    "sequence": [
      "freemodels/claude-sonnet-5",
      "duckai/gpt-5.6-luna",
      "eye2ai/chatgpt",
      "openrouter/google/gemini-2.0-flash-001"
    ]
  }'</code></pre>
            </div>
          </div>
        </div>

        <!-- Section: Console Logs API -->
        <div id="logs" class="card">
          <div class="card-header d-flex align-items-center justify-content-between">
            <span>📋 Console Logs API</span>
            <span class="small text-secondary">Incremental Sync Log Buffer</span>
          </div>
          <div class="card-body">
            <p class="text-secondary">Fetch real-time request logs from the in-memory ring buffer (up to 300 entries).</p>

            <div class="table-responsive mb-3">
              <table class="table table-dark align-middle">
                <thead><tr><th>Method</th><th>Endpoint</th><th>Description</th></tr></thead>
                <tbody>
                  <tr><td><span class="badge badge-method method-get">GET</span></td><td><code>/v1/logs?since=&lt;id&gt;</code></td><td>Fetch logs newer than <code>since</code> ID for incremental sync</td></tr>
                  <tr><td><span class="badge badge-method method-delete">DELETE</span></td><td><code>/v1/logs</code></td><td>Clear in-memory request log buffer</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Section: Code Examples -->
        <div id="examples" class="card">
          <div class="card-header d-flex align-items-center justify-content-between">
            <span>💻 SDK & Client Code Examples</span>
            <span class="small text-secondary">Python & JavaScript</span>
          </div>
          <div class="card-body">
            <h6 class="fw-bold mb-2">Python OpenAI SDK Multimodal Example</h6>
            <div class="code-box">
              <div class="code-box-header">
                <span>Python</span>
                <button class="btn btn-sm btn-outline-light py-0 px-2 small" onclick="copyCodeBlock(this)">📋 Copy</button>
              </div>
              <pre><code>from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="not-needed"
)

response = client.chat.completions.create(
    model="auto",
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Analyze image and search web for current details"},
                {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}}
            ]
        }
    ],
    extra_body={"webSearch": True}
)
print("Result:", response.choices[0].message.content)</code></pre>
            </div>

            <h6 class="fw-bold mb-2 mt-4">JavaScript Fetch SSE Streaming Example</h6>
            <div class="code-box">
              <div class="code-box-header">
                <span>JavaScript</span>
                <button class="btn btn-sm btn-outline-light py-0 px-2 small" onclick="copyCodeBlock(this)">📋 Copy</button>
              </div>
              <pre><code>const response = await fetch('http://localhost:3000/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'freemodels/claude-sonnet-5',
    stream: true,
    messages: [{ role: 'user', content: 'Hello!' }]
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  console.log(decoder.decode(value));
}</code></pre>
            </div>
          </div>
        </div>

        <hr class="my-4">
        <p class="text-secondary text-center pb-4">Universal AI API Proxy v2.1 (Full Width & Multimodal Docs)</p>

      </div>
    </div>
  </div>

  <!-- Change Password Modal -->
  <div class="modal fade" id="changePasswordModal" tabindex="-1" aria-labelledby="changePasswordModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content" style="background: #0f172a; border: 1px solid #1e293b; color: #f8fafc; border-radius: 16px;">
        <div class="modal-header" style="border-bottom: 1px solid #1e293b;">
          <h5 class="modal-title fw-bold" id="changePasswordModalLabel">🔑 Change Admin Password</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <form id="changePasswordForm" onsubmit="saveNewPassword(event)">
            <div class="mb-3">
              <label class="pm-label" style="display:block; font-size:0.7rem; text-transform:uppercase; letter-spacing:0.8px; color:#64748b; font-weight:700; margin-bottom:5px;">Current Password</label>
              <input type="password" id="cpCurrentPassword" class="form-control form-control-sm" style="background:#0b1120; border:1px solid #334155; color:#f8fafc;" placeholder="Enter current password" required>
            </div>
            <div class="mb-3">
              <label class="pm-label" style="display:block; font-size:0.7rem; text-transform:uppercase; letter-spacing:0.8px; color:#64748b; font-weight:700; margin-bottom:5px;">New Password</label>
              <input type="password" id="cpNewPassword" class="form-control form-control-sm" style="background:#0b1120; border:1px solid #334155; color:#f8fafc;" placeholder="Enter new password (min 4 chars)" required minlength="4">
            </div>
            <div class="mb-3">
              <label class="pm-label" style="display:block; font-size:0.7rem; text-transform:uppercase; letter-spacing:0.8px; color:#64748b; font-weight:700; margin-bottom:5px;">Confirm New Password</label>
              <input type="password" id="cpConfirmPassword" class="form-control form-control-sm" style="background:#0b1120; border:1px solid #334155; color:#f8fafc;" placeholder="Confirm new password" required minlength="4">
            </div>
            <div id="cpPassError" class="alert alert-danger py-2 px-3 small d-none mb-3"></div>
            <div class="d-flex justify-content-end gap-2">
              <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="submit" id="cpSavePassBtn" class="btn btn-sm btn-primary fw-bold">Update Password</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>

  <script>
    function copyTextDirect(text, btn) {
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        const orig = btn.innerHTML;
        btn.innerHTML = '✓ Copied';
        btn.classList.replace('btn-outline-light', 'btn-success');
        setTimeout(() => {
          btn.innerHTML = orig;
          btn.classList.replace('btn-success', 'btn-outline-light');
        }, 1500);
      });
    }

    function copyCodeBlock(btn) {
      const codeBox = btn.closest('.code-box');
      if (!codeBox) return;
      const code = codeBox.querySelector('code');
      if (code) copyTextDirect(code.textContent, btn);
    }

    async function handleLogout() {
      try {
        await fetch('/v1/auth/logout', {
          method: 'POST',
          headers: { 'x-session-token': localStorage.getItem('up_session_token') || '' }
        });
      } catch {}
      localStorage.removeItem('up_session_token');
      document.cookie = 'session_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
      window.location.href = '/login';
    }

    async function saveNewPassword(e) {
      e.preventDefault();
      const currentPassword = document.getElementById('cpCurrentPassword').value;
      const newPassword = document.getElementById('cpNewPassword').value;
      const confirmPassword = document.getElementById('cpConfirmPassword').value;
      const errorDiv = document.getElementById('cpPassError');
      const btn = document.getElementById('cpSavePassBtn');

      errorDiv.classList.add('d-none');

      if (newPassword !== confirmPassword) {
        errorDiv.textContent = 'New password and confirmation do not match';
        errorDiv.classList.remove('d-none');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Updating...';

      try {
        const resp = await fetch('/v1/auth/change-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-session-token': localStorage.getItem('up_session_token') || ''
          },
          body: JSON.stringify({ currentPassword, newPassword })
        });
        const data = await resp.json();
        if (resp.ok && data.status === 'ok') {
          alert('Password updated successfully! Please log in again.');
          setTimeout(() => {
            handleLogout();
          }, 800);
        } else {
          errorDiv.textContent = (data.error && data.error.message) || 'Failed to update password';
          errorDiv.classList.remove('d-none');
        }
      } catch (err) {
        errorDiv.textContent = 'Network error: ' + err.message;
        errorDiv.classList.remove('d-none');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Update Password';
      }
    }
  </script>
</body>
</html>`);
});

// JSON errors instead of the default HTML error page, so clients/UI can display them
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  const tooLarge = err.type === 'entity.too.large';
  const message = tooLarge
    ? 'Request body too large. Images are sent as base64, so attach a smaller image or clear old attachments.'
    : (err.message || 'Internal server error');
  res.status(status).json({ error: { message, type: tooLarge ? 'payload_too_large' : 'server_error' } });
});

process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection]', reason instanceof Error ? reason.stack || reason.message : reason);
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, async () => {
  console.log(`Universal AI Proxy running on http://localhost:${PORT}`);
  console.log(`Home UI: http://localhost:${PORT}/`);
  console.log(`API:     http://localhost:${PORT}/docs`);

  try {
    await unlimitedai.initBrowser();
  } catch (e) {
    console.error('[Browser Init Error - UnlimitedAI]:', e.message);
  }

  try {
    await duckai.initBrowser();
  } catch (e) {
    console.error('[Browser Init Error - DuckAI]:', e.message);
  }
});

// Chrome must be closed too, otherwise the proxy restart leaves orphan processes
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(signal + ' received, shutting down...');
  const forced = setTimeout(() => process.exit(0), 5000);
  forced.unref();
  try { await Promise.allSettled([unlimitedai.closeBrowser(), duckai.closeBrowser()]); } catch {}
  server.close(() => process.exit(0));
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
