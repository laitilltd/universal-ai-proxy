const crypto = require('crypto');
const sse = require('../lib/sse');
const { fetchWithTimeout } = require('../lib/net');

const API_URL = 'https://aga-api.aichatting.net/aigc/chat/v2/askai/stream';

const RSA_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDCAdf/EyIbLBxjGqmh7qLU6/CP
Czru+75+82OSPZ+nf4BFvg88drpZ6KigNW0J8TNgxe6Yms1irCZNVDyu+RXsl4y/
7c2KOHc4OGTzHB5fUMiMasFUvcEs2P70e6yA/sKHZfBLG1XPhlb84Ibs3nhD3W5e
2SuC+4EuVkaqzN08LQIDAQAB
-----END PUBLIC KEY-----`;

const MODELS = [
  { id: 'aichatting/gpt-5.6-luna', name: 'GPT 5.6 Luna', provider: 'aichatting', ownedBy: 'openai' },
  { id: 'aichatting/ask-ai',       name: 'Ask AI',       provider: 'aichatting', ownedBy: 'aichatting' },
];

function generateVToken() {
  const visitorId = crypto.randomBytes(16).toString('hex');
  const encrypted = crypto.publicEncrypt(
    { key: RSA_PUBLIC_KEY, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(visitorId, 'utf8')
  );
  return encrypted.toString('base64');
}

function getModels() {
  return MODELS.map(m => ({
    id: m.id,
    object: 'model',
    created: 1,
    owned_by: m.ownedBy,
    provider: 'aichatting',
    meta: { name: m.name }
  }));
}

function cleanChunk(raw) {
  let text = raw.replace(/(\n|-=- --)/g, ' ');
  text = text.replace(/(\n|-=-n--)/g, '\n');
  return text;
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.filter(p => p.type === 'text' && p.text).map(p => p.text).join('\n');
  }
  return content ? String(content) : '';
}

async function handleChat({ modelId, messages, stream }, res, generateId) {
  const formattedMessages = (messages || []).map(m => {
    return { role: m.role, content: [{ type: 'text', text: extractText(m.content) }] };
  });

  const requestedModelName = modelId && modelId.startsWith('aichatting/')
    ? modelId.slice('aichatting/'.length)
    : (modelId || 'gpt-5.6-luna');

  const payload = {
    spaceHandle: true,
    roleId: 0,
    conversationId: 0,
    model: requestedModelName || 'gpt-5.6-luna',
    messages: formattedMessages
  };

  let response;
  try {
    response = await fetchWithTimeout(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream,application/json',
        'source': 'web',
        'lang': 'en',
        'vToken': generateVToken()
      },
      body: JSON.stringify(payload)
    }, { connectMs: 30000, totalMs: stream === false ? 90000 : 0 });
  } catch (err) {
    if (stream === false) {
      return res.status(502).json({ error: { message: err.message, type: 'upstream_error' } });
    }
    sse.open(res);
    return sse.fail(res, sse.meta(generateId, modelId), err.message);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    if (stream === false) {
      return res.status(response.status).json({
        error: { message: 'Upstream returned ' + response.status + ': ' + errText.slice(0, 200), type: 'upstream_error' }
      });
    }
    sse.open(res);
    return sse.fail(res, sse.meta(generateId, modelId), 'Upstream returned ' + response.status + ': ' + errText.slice(0, 200));
  }

  if (stream === false) {
    const rawText = await response.text();
    let fullText = '';
    for (const line of rawText.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const dataPart = trimmed.slice(5);
      if (dataPart === '--@DONE@--') break;
      fullText += cleanChunk(dataPart);
    }
    return res.json(sse.completion(generateId, modelId, fullText));
  }

  sse.open(res);
  const m = sse.meta(generateId, modelId);

  try {
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const dataPart = trimmed.slice(5);
        if (dataPart === '--@DONE@--') {
          reader.cancel().catch(() => {});
          sse.finish(res, m);
          sse.done(res);
          return;
        }

        const chunkText = cleanChunk(dataPart);
        if (chunkText) sse.chunk(res, m, { content: chunkText });
      }
    }

    sse.finish(res, m);
    sse.done(res);
  } catch (err) {
    sse.fail(res, m, err.message || 'Stream error');
  }
}

module.exports = { getModels, handleChat };
