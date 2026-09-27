const sse = require('../lib/sse');
const { fetchWithTimeout } = require('../lib/net');

const BACKEND_URL = 'https://freemodels-chat.freemodels.workers.dev';

const MODELS = [
  { id: 'freemodels/claude-sonnet-5', backendId: 'claude-sonnet-5', name: 'Claude Sonnet 5', provider: 'freemodels', ownedBy: 'anthropic' },
  { id: 'freemodels/claude-fable-5',  backendId: 'claude-fable-5',  name: 'Claude Fable 5',  provider: 'freemodels', ownedBy: 'anthropic' },
  { id: 'freemodels/claude-fable-5.1',backendId: 'claude-fable-5.1',name: 'Claude Fable 5.1',provider: 'freemodels', ownedBy: 'anthropic' },
  { id: 'freemodels/gpt-5.6-sol',    backendId: 'sol',             name: 'GPT 5.6 Sol',     provider: 'freemodels', ownedBy: 'openai' },
  { id: 'freemodels/gpt-5.6-terra',  backendId: 'terra',           name: 'GPT 5.6 Terra',   provider: 'freemodels', ownedBy: 'openai' },
  { id: 'freemodels/glm-5.2',        backendId: 'glm-5.2',         name: 'GLM 5.2',         provider: 'freemodels', ownedBy: 'z-ai' },
  { id: 'freemodels/kimi-k3',        backendId: 'kimi-k3',         name: 'Kimi K3',         provider: 'freemodels', ownedBy: 'moonshot' },
];

function getModels() {
  return MODELS.map(m => ({
    id: m.id,
    object: 'model',
    created: 1,
    owned_by: m.ownedBy,
    provider: 'freemodels',
    meta: { name: m.name }
  }));
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.filter(p => p.type === 'text' && p.text).map(p => p.text).join('\n');
  }
  return content ? String(content) : '';
}

function buildPayload({ messages, stream, thinking, deepSearch, backendId }) {
  return {
    messages: (messages || []).map(m => ({
      role: m.role,
      content: extractText(m.content),
    })),
    modelId: backendId,
    thinking: !!thinking,
    deepSearch: !!deepSearch,
    stream: stream !== false,
  };
}

async function handleChat({ modelId, messages, stream, thinking, deepSearch }, res, generateId) {
  const modelEntry = MODELS.find(m => m.id === modelId) || MODELS[0];
  const payload = buildPayload({ messages, stream, thinking, deepSearch, backendId: modelEntry.backendId });

  if (stream === false) {
    try {
      const resp = await fetchWithTimeout(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, { connectMs: 30000, totalMs: 90000 });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return res.status(resp.status).json({ error: { message: data.error?.message || 'Upstream returned ' + resp.status, type: 'upstream_error' } });
      }
      const content = data?.content || data?.choices?.[0]?.message?.content || '';
      return res.json(sse.completion(generateId, modelId, content));
    } catch (err) {
      return res.status(500).json({ error: { message: err.message, type: 'upstream_error' } });
    }
  }

  sse.open(res);
  const m = sse.meta(generateId, modelId);

  try {
    const resp = await fetchWithTimeout(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, { connectMs: 30000 });

    if (!resp.ok) {
      let errMsg = 'Upstream returned ' + resp.status;
      try {
        const data = await resp.json();
        const e = data.error;
        errMsg = (e && (e.message || (typeof e === 'string' ? e : ''))) || errMsg;
      } catch {}
      return sse.fail(res, m, errMsg);
    }

    await sse.relayOpenAI(resp, res, m);
  } catch (err) {
    sse.fail(res, m, err.message || 'Proxy error');
  }
}

module.exports = { getModels, handleChat };
