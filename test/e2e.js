'use strict';
/* E2E harness for universal-proxy: real server + local echo provider,
   stubbed external hosts, fake-DOM run of the / UI script. */
const path = require('path');
const http = require('http');
const fs = require('fs');

const PROJ = path.join(__dirname, '..');
const CONFIG_PATH = path.join(PROJ, 'custom-providers.json');
const PORT = 3999;
const ECHO_PORT = 4567;
const BASE = 'http://127.0.0.1:' + PORT;

let pass = 0;
const fails = [];
let savedConfig = null;
function check(cond, name, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { const m = name + (extra !== undefined ? ' :: ' + String(extra) : ''); fails.push(m); console.log('  FAIL ' + m); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---------- response fakes (for the stubbed global fetch) ----------
function jsonResp(obj, status) {
  status = status || 200;
  const text = JSON.stringify(obj);
  return {
    ok: status < 400, status,
    headers: { get: () => 'application/json' },
    json: async () => obj,
    text: async () => text
  };
}
function sseResp(lines, status) {
  status = status || 200;
  const parts = lines.map(l => 'data: ' + l + '\n\n');
  let i = 0;
  return {
    ok: status < 400, status,
    headers: { get: () => 'text/event-stream' },
    json: async () => JSON.parse(parts[0] ? parts[0].slice(6).trim() : '{}'),
    text: async () => parts.join(''),
    body: {
      getReader: () => ({
        read: async () => (i < parts.length
          ? { done: false, value: Buffer.from(parts[i++], 'utf8') }
          : { done: true, value: undefined })
      })
    }
  };
}

// ---------- fake Chrome ----------
const fakePage = {
  setUserAgent: async () => {}, goto: async () => {}, waitForSelector: async () => {},
  evaluateOnNewDocument: async () => {}, isClosed: () => false, close: async () => {},
  evaluate: async () => (global.__testMockSuccess ? 'Browser stub response' : '')
};
const fakeBrowser = { newPage: async () => fakePage, close: async () => {}, isConnected: () => true };
const fakePuppeteer = { launch: async () => fakeBrowser };

// ---------- fake socket.io ----------
function makeFakeSocket() {
  const handlers = {};
  function fire(ev, d) { (handlers[ev] || []).slice().forEach(cb => { try { cb(d); } catch (e) { console.error('[fake socket]', e.message); } }); }
  const sock = {
    on(ev, cb) { (handlers[ev] = handlers[ev] || []).push(cb); return sock; },
    disconnect() {},
    emit(ev, data) {
      if (ev === 'llm:conversation:request') {
        const llm = data.llmList[0];
        setTimeout(() => fire('llm:conversation_stream:response', { llm, chunk: 'Hi from eye2 ' }), 1);
        setTimeout(() => fire('llm:conversation:end', {}), 12);
      }
      return sock;
    }
  };
  setTimeout(() => fire('connect'), 5);
  return sock;
}

// ---------- stub module loader (before requiring the server) ----------
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request) {
  if (request === 'puppeteer-core') return fakePuppeteer;
  if (request === 'socket.io-client') return { io: () => makeFakeSocket() };
  return origLoad.apply(this, arguments);
};

// ---------- stub global fetch ----------
const realFetch = global.fetch;
const counts = { google: 0, anthropic: 0, eye: 0, bad: 0, eyeTestActive: false };

function googleStub(u) {
  counts.google++;
  if (u.indexOf(':streamGenerateContent') !== -1) {
    return sseResp([
      JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Gemini ' }] } }] }),
      JSON.stringify({ candidates: [{ content: { parts: [{ text: 'streaming hi' }] } }] })
    ]);
  }
  if (u.indexOf(':generateContent') !== -1) {
    return jsonResp({
      candidates: [{ content: { parts: [{ text: 'Gemini says hi' }] } }],
      usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 5, totalTokenCount: 8 }
    });
  }
  return jsonResp({ models: [{ name: 'models/gemini-2.0-flash', displayName: 'Flash', supportedGenerationMethods: ['generateContent'] }] });
}

function anthropicStub(u, opts) {
  counts.anthropic++;
  let body = {};
  try { body = JSON.parse(opts && opts.body ? opts.body : '{}'); } catch {}
  if (body.stream) {
    return sseResp([
      JSON.stringify({ type: 'content_block_delta', delta: { text: 'Claude ' } }),
      JSON.stringify({ type: 'content_block_delta', delta: { text: 'says hi' } }),
      JSON.stringify({ type: 'message_stop' })
    ]);
  }
  return jsonResp({ content: [{ type: 'text', text: 'Claude says hi' }], usage: { input_tokens: 4, output_tokens: 6 } });
}

global.fetch = async function (url, opts) {
  const u = String(url);
  if (u.indexOf('aibanglachat.com') !== -1 || u.indexOf('aichatting.net') !== -1 || u.indexOf('freemodels.workers.dev') !== -1) {
    return jsonResp({ error: { message: 'Upstream simulated error' } }, 502);
  }
  if (u.indexOf('bad-google.test') !== -1) {
    counts.bad++;
    return jsonResp({ error: { message: 'API key not valid' } }, 401);
  }
  if (u.indexOf('generativelanguage.googleapis.com') !== -1) return googleStub(u, opts);
  if (u.indexOf('api.anthropic.com') !== -1) return anthropicStub(u, opts);
  if (u.indexOf('www.eye2.ai') !== -1) {
    if (counts.eyeTestActive) {
      counts.eye++;
      return { ok: true, status: 200, json: async () => ({}), text: async () => '1:"share-123"', headers: { get: () => 'text/plain' } };
    }
    return jsonResp({ error: { message: 'Eye2 simulated error' } }, 502);
  }
  if (u.charAt(0) === '/') return realFetch.call(global, BASE + u, opts);
  return realFetch.call(global, url, opts);
};

// ---------- local echo provider ----------
function startEcho() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', c => { raw += c; });
      req.on('end', () => {
        if (req.method === 'GET') {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ object: 'list', data: [{ id: 'echo-1' }, { id: 'echo-2' }] }));
          return;
        }
        let body = {};
        try { body = JSON.parse(raw); } catch {}
        const model = (body.model || 'echo');
        if (body.stream) {
          res.setHeader('content-type', 'text/event-stream');
          const mk = (d, fr) => JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', created: 1, model, choices: [{ index: 0, delta: d, finish_reason: fr }] });
          res.write('data: ' + mk({ role: 'assistant', content: 'Hello ' }, null) + '\n\n');
          res.write('data: ' + mk({ content: 'from echo' }, null) + '\n\n');
          res.write('data: ' + mk({}, 'stop') + '\n\n');
          res.write('data: [DONE]\n\n');
          res.end();
        } else {
          res.setHeader('content-type', 'application/json');
          const last = body.messages && body.messages[body.messages.length - 1];
          const preview = last ? JSON.stringify(last.content).slice(0, 50) : '';
          res.end(JSON.stringify({
            id: 'c1', object: 'chat.completion', created: 1, model,
            choices: [{ index: 0, message: { role: 'assistant', content: 'Echo reply: ' + preview }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 }
          }));
        }
      });
    });
    server.listen(ECHO_PORT, '127.0.0.1', () => resolve(server));
  });
}

async function postChat(payload, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs || 30000);
  try {
    const r = await realFetch.call(global, BASE + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    });
    const ct = (r.headers.get('content-type') || '');
    return { status: r.status, ct, body: ct.indexOf('event-stream') !== -1 ? await r.text() : await r.text() };
  } finally { clearTimeout(t); }
}

function sseText(text) {
  let out = '';
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.indexOf('data:') !== 0) continue;
    const j = t.slice(5).trim();
    if (!j || j === '[DONE]') continue;
    try { const p = JSON.parse(j); if (p.error) out += '[error:' + p.error.message + ']'; else { const d = p.choices && p.choices[0] && p.choices[0].delta && p.choices[0].delta.content; if (d) out += d; } } catch {}
  }
  return out;
}

function sseHasDone(text) { return text.indexOf('data: [DONE]') !== -1; }

async function main() {
  const originalConfig = fs.readFileSync(CONFIG_PATH, 'utf8');
  const echoServer = await startEcho();

  const testConfig = [
    { id: 'bad-google', name: 'Bad Google', type: 'google', url: 'https://bad-google.test', apiKey: 'bad-key', models: [{ id: 'bad-1' }], createdAt: new Date().toISOString() },
    { id: 'echo', name: 'Echo', type: 'openai', url: 'http://127.0.0.1:4567', apiKey: '', models: [{ id: 'echo-1' }], createdAt: new Date().toISOString() },
    { id: 'google-custom', name: 'Google Custom', type: 'google', url: '', apiKey: 'dummy-key', models: [{ id: 'gemini-1' }], createdAt: new Date().toISOString() },
    { id: 'nokey-google', name: 'NoKey Google', type: 'google', url: '', apiKey: '', models: [{ id: 'g2' }], createdAt: new Date().toISOString() },
    { id: 'anthro', name: 'Anthro', type: 'anthropic', url: 'https://api.anthropic.com', apiKey: 'sk-test', models: [{ id: 'claude-x' }], createdAt: new Date().toISOString() }
  ];
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(testConfig, null, 2));

  process.env.PORT = String(PORT);
  process.env.DISABLE_AUTH = 'true';
  require(path.join(PROJ, 'server.js'));

  // wait for listen
  for (let i = 0; i < 60; i++) {
    try { const r = await realFetch.call(global, BASE + '/health'); if (r.ok) break; } catch {}
    await sleep(200);
  }

  section('Endpoints');
  {
    const h = await (await realFetch.call(global, BASE + '/health')).json();
    check(h.status === 'ok', 'health status ok');
    check(h.browsers && h.browsers.unlimitedai && h.browsers.duckai, 'health exposes browser status', JSON.stringify(h.browsers));
    check(Array.isArray(h.autoCandidates) && h.autoCandidates.indexOf('echo/echo-1') !== -1, 'auto candidates include echo model');

    const m = await (await realFetch.call(global, BASE + '/v1/models')).json();
    const ids = m.data.map(x => x.id);
    for (const want of ['auto', 'echo/echo-1', 'google-custom/gemini-1', 'anthro/claude-x', 'freemodels/claude-sonnet-5', 'duckai/gpt-5.6-luna', 'aibanglachat/bangla-ai', 'unlimitedai/chatgpt', 'eye2ai/chatgpt', 'aichatting/gpt-5.6-luna']) {
      check(ids.indexOf(want) !== -1, 'models list has ' + want);
    }

    const chat = await realFetch.call(global, BASE + '/');
    const chatHtml = await chat.text();
    check(chat.status === 200 && chatHtml.indexOf('Universal AI Proxy') !== -1, '/ serves UI');
    check(/id="webSearchToggle"[^>]*checked/.test(chatHtml), 'web search toggle checked by default');
    check(/id="streamToggle"[^>]*checked/.test(chatHtml), 'stream toggle checked by default');
    const docs = await realFetch.call(global, BASE + '/docs');
    check(docs.status === 200 && (await docs.text()).indexOf('/v1/chat/completions') !== -1, '/docs serves docs');
    check(chatHtml.indexOf('Console Logs') !== -1, '/ includes console log panel');
    const logsList = await (await realFetch.call(global, BASE + '/v1/logs')).json();
    check(logsList.object === 'list' && Array.isArray(logsList.data), 'GET /v1/logs returns logs list');
  }

  section('Custom provider chat (openai type)');
  {
    const r1 = await postChat({ model: 'echo/echo-1', messages: [{ role: 'user', content: 'hi there' }], stream: false });
    let j1 = {}; try { j1 = JSON.parse(r1.body); } catch {}
    check(r1.status === 200 && j1.choices && j1.choices[0].message.content.indexOf('Echo reply') === 0, 'non-stream custom reply', r1.body.slice(0, 120));

    const r2 = await postChat({ model: 'echo/echo-1', messages: [{ role: 'user', content: 'stream me' }], stream: true });
    const txt = sseText(r2.body);
    check(r2.status === 200 && r2.ct.indexOf('text/event-stream') !== -1, 'stream returns SSE content-type', r2.ct);
    check(txt === 'Hello from echo', 'streamed content assembled', txt);
    check(sseHasDone(r2.body), 'stream terminated with [DONE]');

    const r3 = await postChat({ model: 'nope/nope', messages: [{ role: 'user', content: 'x' }], stream: false });
    let j3 = {}; try { j3 = JSON.parse(r3.body); } catch {}
    check(r3.status === 404 && j3.error && /not found/.test(j3.error.message), 'unknown model returns 404 JSON', r3.body.slice(0, 140));
  }

  section('Custom provider CRUD');
  {
    const post = await realFetch.call(global, BASE + '/v1/custom-providers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'crud', name: 'CRUD Test', type: 'openai', url: 'http://127.0.0.1:4567', apiKey: '', models: ['echo-9'] })
    });
    const pj = await post.json();
    check(post.status === 200 && pj.status === 'ok' && pj.provider && pj.provider.id === 'crud', 'create provider', JSON.stringify(pj).slice(0, 160));

    const list = await (await realFetch.call(global, BASE + '/v1/custom-providers')).json();
    check(list.data.some(p => p.id === 'crud'), 'provider listed after create');

    const models = await (await realFetch.call(global, BASE + '/v1/models')).json();
    check(models.data.some(x => x.id === 'crud/echo-9'), 'model appears after create');

    const del = await realFetch.call(global, BASE + '/v1/custom-providers/crud', { method: 'DELETE' });
    check(del.status === 200, 'delete provider');

    const list2 = await (await realFetch.call(global, BASE + '/v1/custom-providers')).json();
    check(!list2.data.some(p => p.id === 'crud'), 'provider gone after delete');
    const models2 = await (await realFetch.call(global, BASE + '/v1/models')).json();
    check(!models2.data.some(x => x.id === 'crud/echo-9'), 'model gone after delete');

    const rf = await realFetch.call(global, BASE + '/v1/custom-providers/echo/refresh', { method: 'POST' });
    const rj = await rf.json();
    check(rf.status === 200 && rj.status === 'ok' && Array.isArray(rj.models) && rj.models.length === 2, 'refresh model discovery', JSON.stringify(rj).slice(0, 160));
  }

  section('Config Export & Import (/v1/config)');
  {
    const exp = await realFetch.call(global, BASE + '/v1/config/export');
    const ej = await exp.json();
    check(exp.status === 200 && Array.isArray(ej.providers) && Array.isArray(ej.combos), 'config export returns providers & combos');

    const imp = await realFetch.call(global, BASE + '/v1/config/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providers: [{ id: 'imp-prov', name: 'Imported Provider', type: 'openai', url: 'http://127.0.0.1:4567', apiKey: '', models: ['m1'] }],
        combos: [{ id: 'imp-combo', name: 'Imported Combo', sequence: ['imp-prov/m1'] }]
      })
    });
    const ij = await imp.json();
    check(imp.status === 200 && ij.status === 'ok' && ij.importedProviders === 1 && ij.importedCombos === 1, 'config import succeeds');

    const listP = await (await realFetch.call(global, BASE + '/v1/custom-providers')).json();
    check(listP.data.some(p => p.id === 'imp-prov'), 'imported provider listed');

    const listC = await (await realFetch.call(global, BASE + '/v1/combos')).json();
    check(listC.data.some(c => c.id === 'imp-combo'), 'imported combo listed');

    await realFetch.call(global, BASE + '/v1/custom-providers/imp-prov', { method: 'DELETE' });
    await realFetch.call(global, BASE + '/v1/combos/imp-combo', { method: 'DELETE' });
  }

  section('Admin Auth (ADMIN_KEY protection)');
  {
    process.env.ADMIN_KEY = 'test-secret-key';
    try {
      const blocked = await realFetch.call(global, BASE + '/v1/custom-providers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'auth-test', name: 'Auth Test', type: 'openai', url: 'http://127.0.0.1:4567', apiKey: '', models: ['m1'] })
      });
      check(blocked.status === 401, 'unauthorized request blocked with 401 when ADMIN_KEY configured');

      const allowed = await realFetch.call(global, BASE + '/v1/custom-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': 'test-secret-key' },
        body: JSON.stringify({ id: 'auth-test', name: 'Auth Test', type: 'openai', url: 'http://127.0.0.1:4567', apiKey: '', models: ['m1'] })
      });
      check(allowed.status === 200, 'authorized request allowed with valid x-admin-key header');

      const del = await realFetch.call(global, BASE + '/v1/custom-providers/auth-test', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer test-secret-key' }
      });
      check(del.status === 200, 'authorized delete allowed with Bearer token');
    } finally {
      delete process.env.ADMIN_KEY;
    }
  }

  section('Authentication & Session Management (/login, /v1/auth)');
  {
    delete process.env.DISABLE_AUTH;
    try {
      const loginPage = await realFetch.call(global, BASE + '/login');
      const loginHtml = await loginPage.text();
      check(loginPage.status === 200 && loginHtml.indexOf('Login - Universal AI Proxy') !== -1, '/login serves login page');

      const badLogin = await realFetch.call(global, BASE + '/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'wrong-password' })
      });
      check(badLogin.status === 401, 'login with wrong password returns 401');

      const goodLogin = await realFetch.call(global, BASE + '/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'password' })
      });
      const loginData = await goodLogin.json();
      check(goodLogin.status === 200 && loginData.status === 'ok' && !!loginData.token, 'login with default password returns 200 + token');

      const userToken = loginData.token;

      const changePass = await realFetch.call(global, BASE + '/v1/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-session-token': userToken },
        body: JSON.stringify({ currentPassword: 'password', newPassword: 'new-secure-pass' })
      });
      const changeData = await changePass.json();
      check(changePass.status === 200 && changeData.status === 'ok', 'change password succeeds');

      const newGoodLogin = await realFetch.call(global, BASE + '/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'new-secure-pass' })
      });
      const newLoginData = await newGoodLogin.json();
      check(newGoodLogin.status === 200 && newLoginData.status === 'ok' && !!newLoginData.token, 'login with new password succeeds');

      const restorePass = await realFetch.call(global, BASE + '/v1/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-session-token': newLoginData.token },
        body: JSON.stringify({ currentPassword: 'new-secure-pass', newPassword: 'password' })
      });
      check(restorePass.status === 200, 'restore default password succeeds');
    } finally {
      process.env.DISABLE_AUTH = 'true';
    }
  }

  section('Google + Anthropic custom types');
  {
    const g1 = await postChat({ model: 'google-custom/gemini-1', messages: [{ role: 'user', content: 'hi' }], stream: false });
    let gj = {}; try { gj = JSON.parse(g1.body); } catch {}
    check(g1.status === 200 && gj.choices && gj.choices[0].message.content === 'Gemini says hi', 'google non-stream content', g1.body.slice(0, 160));
    check(gj.usage && gj.usage.total_tokens === 8, 'google usage passthrough', JSON.stringify(gj.usage));

    const g2 = await postChat({ model: 'google-custom/gemini-1', messages: [{ role: 'user', content: 'hi' }], stream: true });
    const gtxt = sseText(g2.body);
    check(g2.ct.indexOf('text/event-stream') !== -1 && gtxt === 'Gemini streaming hi', 'google stream relay', gtxt);
    check(sseHasDone(g2.body), 'google stream [DONE]');

    const g3 = await postChat({ model: 'nokey-google/g2', messages: [{ role: 'user', content: 'hi' }], stream: false });
    let gj3 = {}; try { gj3 = JSON.parse(g3.body); } catch {}
    check(g3.status === 401 && gj3.error && /requires an API key/.test(gj3.error.message), 'google without key -> 401', g3.body.slice(0, 160));

    const a1 = await postChat({ model: 'anthro/claude-x', messages: [{ role: 'user', content: 'hi' }], stream: false });
    let aj = {}; try { aj = JSON.parse(a1.body); } catch {}
    check(a1.status === 200 && aj.choices && aj.choices[0].message.content === 'Claude says hi', 'anthropic non-stream content', a1.body.slice(0, 160));
    check(aj.usage && aj.usage.prompt_tokens === 4 && aj.usage.completion_tokens === 6, 'anthropic usage passthrough', JSON.stringify(aj.usage));

    const a2 = await postChat({ model: 'anthro/claude-x', messages: [{ role: 'user', content: 'hi' }], stream: true });
    const atxt = sseText(a2.body);
    check(a2.ct.indexOf('text/event-stream') !== -1 && atxt === 'Claude says hi', 'anthropic stream relay', atxt);
    check(sseHasDone(a2.body), 'anthropic stream [DONE]');
  }

  section('Auto router + failure cooldown');
  {
    const badBefore = counts.bad;
    const googleBefore = counts.google;

    const a1 = await postChat({ model: 'auto', messages: [{ role: 'user', content: 'hi' }], stream: false });
    let aj = {}; try { aj = JSON.parse(a1.body); } catch {}
    check(a1.status === 200 && aj.model && aj.model.indexOf('auto (') === 0, 'auto non-stream succeeds', JSON.stringify(aj.model));
    check(aj.choices && aj.choices[0].message.content.indexOf('Echo reply') === 0, 'auto fell through to healthy provider', a1.body.slice(0, 160));
    check(counts.bad === badBefore + 1, 'dead provider attempted once', 'calls=' + counts.bad + ' before=' + badBefore);

    const a2 = await postChat({ model: 'auto', messages: [{ role: 'user', content: 'again' }], stream: false });
    let aj2 = {}; try { aj2 = JSON.parse(a2.body); } catch {}
    check(a2.status === 200 && aj2.model.indexOf('auto (') === 0, 'auto second request ok', aj2.model);
    check(counts.bad === badBefore + 1, 'cooled-down provider skipped (no retry)', 'calls=' + counts.bad);

    const a3 = await postChat({ model: 'auto', messages: [{ role: 'user', content: 'stream' }], stream: true });
    const atxt = sseText(a3.body);
    check(a3.ct.indexOf('text/event-stream') !== -1 && atxt === 'Hello from echo', 'auto stream pipes first healthy provider', atxt);
    check(sseHasDone(a3.body), 'auto stream [DONE]');
    check(counts.bad === badBefore + 1, 'cooldown holds for streaming too', 'calls=' + counts.bad);
    check(counts.google === googleBefore, 'healthy provider untouched while dead one cooled', counts.google);
  }

  section('Alias rewrite + browser-backed provider');
  {
    global.__testMockSuccess = true;
    const r = await postChat({ model: 'chatgpt', messages: [{ role: 'user', content: 'hi' }], stream: false });
    let j = {}; try { j = JSON.parse(r.body); } catch {}
    check(r.status === 200 && j.model === 'unlimitedai/chatgpt', 'alias "chatgpt" rewritten to unlimitedai/chatgpt', JSON.stringify(j.model));
    check(Array.isArray(j.choices), 'browser provider non-stream still returns choices');
  }

  section('eye2ai (fake socket + fetch)');
  {
    counts.eyeTestActive = true;
    const r1 = await postChat({ model: 'eye2ai/chatgpt', messages: [{ role: 'user', content: 'hi' }], stream: false });
    let j1 = {}; try { j1 = JSON.parse(r1.body); } catch {}
    check(r1.status === 200 && j1.choices && j1.choices[0].message.content.indexOf('Hi from eye2') === 0, 'eye2ai non-stream', r1.body.slice(0, 160));
    check(counts.eye === 1, 'shareId fetched once', counts.eye);

    const r2 = await postChat({ model: 'eye2ai/gemini', messages: [{ role: 'user', content: 'hi' }], stream: true });
    const t2 = sseText(r2.body);
    check(r2.ct.indexOf('text/event-stream') !== -1 && t2 === 'Hi from eye2 ', 'eye2ai stream relay', JSON.stringify(t2));
    check(sseHasDone(r2.body), 'eye2ai stream [DONE]');
  }

  section('Request limits and JSON errors');
  {
    const big = 'x'.repeat(68000000);
    const r = await postChat({ model: 'echo/echo-1', messages: [{ role: 'user', content: big }], stream: false }, 60000);
    let j = {}; try { j = JSON.parse(r.body); } catch {}
    check(r.status === 413 && j.error && j.error.type === 'payload_too_large', '68MB body rejected as JSON', r.status + ' ' + r.body.slice(0, 120));

    const r2 = await realFetch.call(global, BASE + '/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json'
    });
    const j2 = await r2.json().catch(() => ({}));
    check(r2.status === 400 && j2.error && j2.error.message, 'malformed JSON -> JSON error', JSON.stringify(j2).slice(0, 140));
  }

  section('Chat UI script (fake DOM)');
  {
    const html = await (await realFetch.call(global, BASE + '/')).text();
    const mm = html.match(/<script>([\s\S]*?)<\/script>/);
    // expose closure state through helper functions injected into the same eval
    const body = mm ? mm[1] : '';
    const src = body + [
      ';function __getMessages(){ return messages; }',
      'function __getBusy(){ return busy; }',
      'function __setAttach(v, n){ attachedFileDataUrl = v; attachedFileName = n; }'
    ].join('\n');
    check(body.length > 1000, 'inline UI script extracted', body.length);

    // fake DOM
    const elements = {};
    function makeEl(tag) {
      const e = {
        tagName: String(tag || 'div').toUpperCase(), value: '', innerHTML: '', textContent: '',
        children: [], style: {}, files: {}, parentNode: null, scrollTop: 0, scrollHeight: 100,
        checked: false, title: '',
        classList: (() => { const s = new Set(); return { add: (...a) => a.forEach(x => s.add(x)), remove: (...a) => a.forEach(x => s.delete(x)), contains: x => s.has(x) }; })(),
        appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
        addEventListener() {}, removeEventListener() {}, focus() {}, setAttribute() {},
        remove() { if (this.id) delete elements[this.id]; if (this.parentNode) { const i = this.parentNode.children.indexOf(this); if (i >= 0) this.parentNode.children.splice(i, 1); } }
      };
      let _id = '';
      Object.defineProperty(e, 'id', { get() { return _id; }, set(v) { _id = v; elements[v] = e; }, configurable: true });
      return e;
    }
    function getEl(id) { return elements[id] || (elements[id] = makeEl('div')); }
    // getElementById must return null for absent nodes (e.g. removed typing div)
    global.document = { getElementById: id => elements[id] || null, createElement: t => makeEl(t), querySelector: () => null, querySelectorAll: () => [] };
    global.confirm = () => true;
    global.alert = () => {};

    for (const id of ['chatBox', 'msgInput', 'sendBtn', 'stopBtn', 'fileBadge', 'attachedPreview', 'fileInput', 'model', 'streamToggle', 'webSearchToggle']) getEl(id);
    getEl('streamToggle').checked = true;
    getEl('webSearchToggle').checked = true;
    getEl('model').value = 'echo/echo-1';

    (0, eval)(src);            // run the UI script
    await sleep(300);          // let loadModels() populate model maps

    check(typeof global.renderMd === 'function' && typeof global.send === 'function', 'UI functions are global');
    check(global.renderMd('**bold**') === '<strong>bold</strong>', 'renderMd bold', global.renderMd('**bold**'));
    check(global.renderMd('`code`') === '<code>code</code>', 'renderMd inline code', global.renderMd('`code`'));
    check(global.renderMd('<b>') === '&lt;b&gt;', 'renderMd escapes HTML', global.renderMd('<b>'));
    const block = global.renderMd('```js\nlet x = 1\n```');
    check(block.indexOf('<pre><code>') === 0 && block.indexOf('let x = 1') !== -1, 'renderMd fenced code', block);

    const ok1 = global.parsePlainBody(JSON.stringify({ model: 'm', choices: [{ message: { content: 'plain ok' } }] }), 200);
    check(ok1.text === 'plain ok' && ok1.model === 'm', 'parsePlainBody JSON success', JSON.stringify(ok1));
    const err1 = global.parsePlainBody(JSON.stringify({ error: { message: 'boom' } }), 500);
    check(err1.text.indexOf('[Error: boom]') === 0, 'parsePlainBody JSON error', JSON.stringify(err1));
    const html1 = global.parsePlainBody('<html><body>500</body></html>', 500);
    check(html1.text.indexOf('[Error: HTTP 500') === 0, 'parsePlainBody HTML error page', html1.text);
    const empty1 = global.parsePlainBody('', 204);
    check(empty1.text.indexOf('[Error: HTTP 204') === 0, 'parsePlainBody empty body', empty1.text);

    const metaAuto = global.buildReplyMeta('auto', 'auto (echo/echo-1)');
    check(metaAuto.viaAuto === true && metaAuto.provider === 'echo', 'buildReplyMeta unwraps auto()', JSON.stringify(metaAuto));
    check(metaAuto.model === 'Echo - echo-1', 'buildReplyMeta uses friendly model name', metaAuto.model);
    const metaDirect = global.buildReplyMeta('echo/echo-1', 'echo/echo-1');
    check(metaDirect.viaAuto === false && metaDirect.provider === 'echo', 'buildReplyMeta direct', JSON.stringify(metaDirect));

    const msgs = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: [{ type: 'text', text: 'first' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } }] },
      { role: 'assistant', content: 'ok' },
      { role: 'user', content: [{ type: 'text', text: 'second' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,BBB' } }] }
    ];
    const pruned = global.pruneImages(msgs);
    check(!pruned[1].content.some(p => p.type === 'image_url'), 'pruneImages drops old image', JSON.stringify(pruned[1]));
    check(pruned[3].content.some(p => p.type === 'image_url'), 'pruneImages keeps newest image');
    check(pruned[1].content.length === 1 && pruned[1].content[0].text === 'first', 'pruneImages keeps text part', JSON.stringify(pruned[1]));

    // end-to-end send() with streaming echo
    getEl('msgInput').value = 'hi there';
    await global.send();
    await sleep(50);
    let chat = getEl('chatBox');
    let last = chat.children[chat.children.length - 1];
    check(last && last.className === 'msg assistant', 'send() appended assistant bubble', last && last.className);
    check(last && last.innerHTML.indexOf('Hello from echo') !== -1, 'send() rendered streamed content', last && last.innerHTML);
    const bar = last && last.children.filter(c => String(c.className).split(/\s+/).indexOf('msg-meta') !== -1)[0];
    check(!!bar, 'reply meta bar present');
    if (bar) {
      const prov = bar.children.filter(c => c.className.indexOf('mm-provider') !== -1)[0];
      const modelSpan = bar.children.filter(c => c.className.indexOf('mm-model') !== -1)[0];
      const time = bar.children.filter(c => c.className.indexOf('mm-time') !== -1)[0];
      check(prov && prov.textContent === 'echo', 'meta bar provider', prov && prov.textContent);
      check(modelSpan && modelSpan.textContent === 'Echo - echo-1', 'meta bar model name', modelSpan && modelSpan.textContent);
      check(time && /\d{2} \w{3} \d{4}/.test(time.textContent), 'meta bar timestamp', time && time.textContent);
      check(!bar.children.some(c => c.className.indexOf('mm-auto') !== -1), 'no auto badge for direct model');
    }
    check(!document.getElementById('typing'), 'typing indicator removed');
    check(global.__getMessages().length === 2, 'history has 2 messages', global.__getMessages().length);

    // image attachment pruning inside send()
    global.__setAttach('data:image/png;base64,AAAA', 'a.png');
    getEl('msgInput').value = 'look at this';
    await global.send();
    await sleep(50);
    global.__setAttach(null, '');
    getEl('msgInput').value = 'follow up';
    await global.send();
    await sleep(50);

    const hist = global.__getMessages().map(m => ({
      role: m.role,
      hasImg: Array.isArray(m.content) && m.content.some(p => p.type === 'image_url')
    }));
    check(hist.length === 6, 'history grew to 6 messages', hist.length);
    check(hist[2].hasImg === true, 'image kept while newest', JSON.stringify(hist[2]));
    check(hist[4].hasImg === false, 'older image pruned from history', JSON.stringify(hist[4]));
    check(global.__getBusy() === false, 'send() resets busy flag');
  }

  console.log('\n----------------------------------------');
  console.log('RESULT: ' + pass + ' passed, ' + fails.length + ' failed');
  if (fails.length) fails.forEach(f => console.log('  FAILED: ' + f));
  fs.writeFileSync(CONFIG_PATH, originalConfig);
  process.exit(fails.length ? 1 : 0);
}

main().catch(err => {
  console.error('HARNESS ERROR:', err);
  try { fs.writeFileSync(CONFIG_PATH, fs.existsSync(CONFIG_PATH) ? fs.readFileSync(CONFIG_PATH, 'utf8') : '{}'); } catch {}
  process.exit(2);
});
