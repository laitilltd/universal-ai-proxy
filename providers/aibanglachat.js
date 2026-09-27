const crypto = require('crypto');
const sse = require('../lib/sse');
const { fetchWithTimeout } = require('../lib/net');

const API_URL = 'https://www.aibanglachat.com/api/chat';

const MODELS = [
  { id: 'aibanglachat/bangla-ai',     name: 'Bangla AI',            webSearch: false, provider: 'aibanglachat', ownedBy: 'aibanglachat' },
  { id: 'aibanglachat/bangla-ai-web', name: 'Bangla AI (Web Search)', webSearch: true,  provider: 'aibanglachat', ownedBy: 'aibanglachat' },
];

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

function getModels() {
  return MODELS.map(m => ({
    id: m.id,
    object: 'model',
    created: 1,
    owned_by: m.ownedBy,
    provider: 'aibanglachat',
    meta: { name: m.name, webSearch: m.webSearch }
  }));
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.filter(p => p.type === 'text' && p.text).map(p => p.text).join('\n');
  }
  return content ? String(content) : '';
}

async function handleChat({ modelId, messages, stream, webSearch }, res, generateId) {
  const modelEntry = MODELS.find(m => m.id === modelId) || MODELS[0];
  const isWebSearch = webSearch !== undefined ? !!webSearch : modelEntry.webSearch;

  const payload = {
    messages: (messages || []).map(m => ({
      role: m.role,
      content: extractText(m.content)
    })),
    webSearch: isWebSearch,
    sessionId: uuid()
  };

  let response;
  try {
    response = await fetchWithTimeout(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      },
      body: JSON.stringify(payload)
    }, { connectMs: 30000, totalMs: stream === false ? 90000 : 0 });
  } catch (err) {
    // A network/timeout failure must use the caller's response contract:
    // JSON for non-stream, an SSE error frame for stream.
    if (stream === false) {
      return res.status(502).json({ error: { message: err.message, type: 'upstream_error' } });
    }
    sse.open(res);
    return sse.fail(res, sse.meta(generateId, modelId), err.message);
  }

  if (stream === false) {
    const text = await response.text();
    if (!response.ok) {
      return res.status(response.status).json({
        error: { message: 'Upstream returned ' + response.status + ': ' + text.slice(0, 200), type: 'upstream_error' }
      });
    }
    return res.json(sse.completion(generateId, modelId, text));
  }

  sse.open(res);
  const m = sse.meta(generateId, modelId);

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    return sse.fail(res, m, 'Upstream returned ' + response.status + ': ' + errText.slice(0, 200));
  }

  try {
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (chunk) sse.chunk(res, m, { content: chunk });
    }

    sse.finish(res, m);
    sse.done(res);
  } catch (err) {
    sse.fail(res, m, err.message || 'Stream error');
  }
}

module.exports = { getModels, handleChat };
