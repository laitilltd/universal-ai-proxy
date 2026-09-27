const sse = require('../lib/sse');
const { createBrowserDriver } = require('../lib/browser');

const MODELS = [
  { id: 'duckai/gpt-5.6-luna',      backendModel: 'gpt-5.6-luna',       name: 'GPT 5.6 Luna',       provider: 'duckai', ownedBy: 'openai' },
  { id: 'duckai/gpt-5.4-mini',      backendModel: 'gpt-5.4-mini',       name: 'GPT 5.4 Mini',       provider: 'duckai', ownedBy: 'openai' },
  { id: 'duckai/claude-haiku-4-5', backendModel: 'claude-haiku-4-5',   name: 'Claude Haiku 4.5',   provider: 'duckai', ownedBy: 'anthropic' },
  { id: 'duckai/mistral-small-2603',backendModel: 'mistral-small-2603', name: 'Mistral Small 4',   provider: 'duckai', ownedBy: 'mistral' },
];

const driver = createBrowserDriver({
  label: 'DuckAI Provider',
  args: ['--disable-blink-features=AutomationControlled', '--window-size=1280,720'],
  setup: async (page) => {
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    console.log('[DuckAI Provider] Navigating to duck.ai...');
    await page.goto('https://duck.ai/', { waitUntil: 'networkidle2', timeout: 60000 });
    await page.evaluate(() => {
      localStorage.setItem('duckaiNewUserVisit', JSON.stringify({ previousVisitExpiry: '2028-01-01', hasPreviouslyVisited: true }));
      localStorage.setItem('duckaiFirstSeenDate', '2026-09-25');
      localStorage.setItem('isRecentChatsOn', '"1"');
    });
  }
});

function getModels() {
  return MODELS.map(m => ({
    id: m.id,
    object: 'model',
    created: 1,
    owned_by: m.ownedBy,
    provider: 'duckai',
    meta: { name: m.name, backendModel: m.backendModel }
  }));
}

const MIN_CHAT_GAP_MS = 10000;
let lastChatAt = 0;

async function sendViaBrowser(message, backendModel) {
  // The rate-limit wait must happen INSIDE the driver's FIFO queue, otherwise
  // two requests can both pass the gate and hit duck.ai back-to-back.
  return driver.run(async page => {
    const wait = lastChatAt + MIN_CHAT_GAP_MS - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastChatAt = Date.now();

    return page.evaluate(async (msg, modelName) => {
    const startTime = Date.now();

    let statusResp = null;
    let rawHashHeader = null;
    for (let attempt = 0; attempt < 3 && !rawHashHeader; attempt++) {
      if (attempt) await new Promise(r => setTimeout(r, 1500));
      statusResp = await fetch('/duckchat/v1/status', {
        headers: { 'x-vqd-accept': '1', 'Cache-Control': 'no-store' },
        cache: 'no-store'
      });
      rawHashHeader = statusResp.headers.get('x-vqd-hash-1');
    }
    if (!rawHashHeader) throw new Error('DuckAI: x-vqd-hash-1 header not found after 3 status calls');

    const scriptStr = atob(rawHashHeader);
    let jsaRaw = null;
    try {
      jsaRaw = JSON.parse(scriptStr);
    } catch (e0) {
      try {
        jsaRaw = await (new Function('return (' + scriptStr + ')'))();
      } catch (e1) {
        try {
          jsaRaw = await (new Function(scriptStr))();
        } catch (e2) {
          try {
            jsaRaw = await eval('(' + scriptStr + ')');
          } catch (e3) {
            jsaRaw = await eval(scriptStr);
          }
        }
      }
    }

    if (!jsaRaw || typeof jsaRaw !== 'object' || !Array.isArray(jsaRaw.client_hashes)) {
      throw new Error('DuckAI: invalid JSA challenge result');
    }

    const sha256Hashes = await Promise.all(
      jsaRaw.client_hashes.map(async (str) => {
        const encoded = new TextEncoder().encode(str);
        const digest = await crypto.subtle.digest('SHA-256', encoded);
        const uint8 = new Uint8Array(digest);
        return btoa(String.fromCharCode.apply(null, uint8));
      })
    );

    const finalResult = Object.assign({}, jsaRaw, {
      client_hashes: sha256Hashes,
      meta: Object.assign({}, jsaRaw.meta || {}, {
        origin: window.location.origin,
        stack: 'Error\n    at solveJsa (https://duck.ai/dist/duckai-dist/entry.duckai.js:10:20)',
        duration: String(Date.now() - startTime)
      })
    });

    const vqdHash = btoa(JSON.stringify(finalResult));
    const feVersion = (window.__DDG_BE_VERSION__ || 'dev') + '-' + (window.__DDG_FE_CHAT_HASH__ || 'hash');
    const journeyId = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    const signals = btoa(JSON.stringify({
      start: Date.now() - 1000,
      events: [{ name: 'action', delta: 300, trusted: true }],
      end: Date.now() - 900
    }));

    const body = {
      model: modelName,
      messages: [{ role: 'user', content: [{ type: 'text', text: msg }] }],
      canUseTools: true,
      reasoningEffort: 'none',
      canUseApproxLocation: null,
      canDelegateImageGeneration: null,
      canShowGreeting: false
    };

    const chatResp = await fetch('/duckchat/v1/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        accept: 'text/event-stream',
        'x-fe-version': feVersion,
        'x-fe-signals': signals,
        'x-ddg-journey-id': journeyId,
        'X-Vqd-Hash-1': vqdHash
      },
      body: JSON.stringify(body)
    });

    if (!chatResp.ok) {
      const errText = await chatResp.text().catch(() => '');
      let kind = '';
      try { kind = JSON.parse(errText).type || ''; } catch {}
      throw new Error('DuckAI returned ' + chatResp.status + (kind ? ' (' + kind + ')' : '') + ': ' + errText.slice(0, 300));
    }

    const reader = chatResp.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';

    const handleLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (trimmed.indexOf('data:') !== 0) return false;
      const data = trimmed.slice(5).trim();
      if (!data) return false;
      if (data.indexOf('[DONE]') !== -1) return true;
      if (data.charAt(0) === '[') return false;      // [PING], [CHAT_TITLE:...], limits, ...
      let parsed;
      try { parsed = JSON.parse(data); } catch { return false; }
      if (parsed.action === 'error') {
        throw new Error('DuckAI stream error ' + (parsed.type || 'ERR_UNKNOWN') + (parsed.status ? ' (HTTP ' + parsed.status + ')' : ''));
      }
      if (parsed.action !== 'success') return false;
      if (parsed.role && parsed.role !== 'assistant') return false;   // skip reasoning/tool events
      if (typeof parsed.message === 'string') fullContent += parsed.message;
      return false;
    };

    let sawDone = false;
    while (!sawDone) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (handleLine(line)) { sawDone = true; break; }
      }
    }
    if (!sawDone && buffer) handleLine(buffer);

    if (!fullContent) throw new Error('DuckAI returned an empty response');
    return fullContent;
    }, message, backendModel);
  });
}

function lastUserText(messages) {
  const userMsgs = (messages || []).filter(m => m.role === 'user');
  if (userMsgs.length === 0) return 'Hello';
  const content = userMsgs[userMsgs.length - 1].content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const parts = content.filter(p => p.type === 'text' && p.text).map(p => p.text);
    if (parts.length > 0) return parts.join('\n');
  }
  return content ? String(content) : 'Hello';
}

async function handleChat({ modelId, messages, stream }, res, generateId) {
  const modelEntry = MODELS.find(m => m.id === modelId) || MODELS[0];
  const lastMessage = lastUserText(messages);

  if (stream === false) {
    try {
      const content = await sendViaBrowser(lastMessage, modelEntry.backendModel);
      if (!content) throw new Error('DuckAI returned an empty response');
      return res.json(sse.completion(generateId, modelId, content));
    } catch (err) {
      return res.status(502).json({ error: { message: err.message, type: 'upstream_error' } });
    }
  }

  sse.open(res);
  const m = sse.meta(generateId, modelId);

  try {
    const content = await sendViaBrowser(lastMessage, modelEntry.backendModel);
    if (!content) throw new Error('DuckAI returned an empty response');
    // Modest-size pieces instead of thousands of per-word res.write calls.
    for (const piece of content.match(/[\s\S]{1,160}/g) || []) {
      sse.chunk(res, m, { content: piece });
    }
    sse.finish(res, m);
    sse.done(res);
  } catch (err) {
    sse.fail(res, m, err.message);
  }
}

module.exports = {
  initBrowser: () => driver.init(),
  closeBrowser: () => driver.close(),
  status: () => driver.status(),
  getModels,
  handleChat
};
