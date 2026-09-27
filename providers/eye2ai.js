const { io } = require('socket.io-client');
const sse = require('../lib/sse');

const NEXT_ACTION_SHARE_ID = '606057921f3341c1c2455220cd95d2530c0c70cdc8';
const SOCKET_SERVER_URL = 'https://ec2.eye2.ai';

const MODELS = [
  { id: 'eye2ai/gemini',      engine: 'gemini',      name: 'Gemini',      provider: 'eye2ai', ownedBy: 'google' },
  { id: 'eye2ai/deepseek',    engine: 'deepseek',    name: 'DeepSeek',    provider: 'eye2ai', ownedBy: 'deepseek' },
  { id: 'eye2ai/qwen',        engine: 'qwen',        name: 'Qwen',        provider: 'eye2ai', ownedBy: 'alibaba' },
  { id: 'eye2ai/mistral',     engine: 'mistral_ai',  name: 'Mistral AI',  provider: 'eye2ai', ownedBy: 'mistral' },
  { id: 'eye2ai/amazon-nova', engine: 'amazon_nova', name: 'Amazon Nova', provider: 'eye2ai', ownedBy: 'amazon' },
  { id: 'eye2ai/chatgpt',     engine: 'chat_gpt',    name: 'ChatGPT',     provider: 'eye2ai', ownedBy: 'openai' },
  { id: 'eye2ai/ai21',        engine: 'ai21',        name: 'AI21',        provider: 'eye2ai', ownedBy: 'ai21' },
  { id: 'eye2ai/glm',         engine: 'glm',         name: 'Z.ai GLM',    provider: 'eye2ai', ownedBy: 'z-ai' },
  { id: 'eye2ai/smart',       engine: 'smart',       name: 'Eye2 Smart',  provider: 'eye2ai', ownedBy: 'eye2ai' },
  { id: 'eye2ai/cohere',      engine: 'cohere',      name: 'Cohere',      provider: 'eye2ai', ownedBy: 'cohere' },
  { id: 'eye2ai/minimax',     engine: 'mini_max',    name: 'MiniMax',     provider: 'eye2ai', ownedBy: 'minimax' },
  { id: 'eye2ai/gemma',       engine: 'gemma',       name: 'Gemma',       provider: 'eye2ai', ownedBy: 'google' },
  { id: 'eye2ai/mercury',     engine: 'mercury',     name: 'Mercury',     provider: 'eye2ai', ownedBy: 'mercury' },
];

function getModels() {
  return MODELS.map(m => ({
    id: m.id,
    object: 'model',
    created: 1,
    owned_by: m.ownedBy,
    provider: 'eye2ai',
    meta: { name: m.name, engine: m.engine }
  }));
}

async function getShareId(prompt) {
  const { fetchWithTimeout } = require('../lib/net');
  const resp = await fetchWithTimeout('https://www.eye2.ai/', {
    method: 'POST',
    headers: {
      'Next-Action': NEXT_ACTION_SHARE_ID,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([prompt])
  }, { connectMs: 15000, totalMs: 30000 });

  const text = await resp.text();
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    const match = trimmed.match(/1:"([^"]+)"/);
    if (match) return match[1];
    try {
      if (trimmed.startsWith('1:')) {
        const parsed = JSON.parse(trimmed.slice(2));
        if (typeof parsed === 'string') return parsed;
      }
    } catch {}
  }
  throw new Error('Failed to obtain session shareId from Eye2.ai');
}

function lastUserText(messages, fallback) {
  const userMsgs = (messages || []).filter(m => m.role === 'user');
  if (userMsgs.length === 0) return fallback;
  const content = userMsgs[userMsgs.length - 1].content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const parts = content.filter(p => p.type === 'text' && p.text).map(p => p.text);
    if (parts.length > 0) return parts.join('\n');
  }
  return content ? String(content) : fallback;
}

// eye2ai uses `web` as its flag; accept `webSearch` too so the chat toggle works.
function wantsWeb(flags) {
  if (flags.web !== undefined) return !!flags.web;
  if (flags.webSearch !== undefined) return !!flags.webSearch;
  return false;
}

async function handleChat({ modelId, messages, stream, web, webSearch }, res, generateId) {
  const modelEntry = MODELS.find(m => m.id === modelId) || MODELS[0];
  const engine = modelEntry.engine;
  const useWeb = wantsWeb({ web, webSearch });

  let shareId;
  try {
    shareId = await getShareId(lastUserText(messages, 'Hello'));
  } catch (err) {
    // Contract-aware failure: JSON for non-stream, SSE error frame for stream.
    if (stream === false) {
      return res.status(502).json({ error: { message: err.message, type: 'upstream_error' } });
    }
    sse.open(res);
    return sse.fail(res, sse.meta(generateId, modelId), err.message);
  }

  if (stream === false) {
    const content = await new Promise((resolve, reject) => {
      let accumulated = '';
      let fullText = null;
      let timer = null;
      const socket = io(SOCKET_SERVER_URL, {
        transports: ['websocket'],
        auth: { shareId },
        timeout: 30000
      });

      // Idle timeout: reset on every event so long answers are not truncated.
      const resetTimer = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          socket.disconnect();
          if (accumulated) resolve(accumulated);
          else reject(new Error('Eye2.ai request timed out'));
        }, 45000);
      };
      resetTimer();

      socket.on('connect', () => {
        const payload = { shareId, llmList: [engine], web: useWeb };
        socket.emit('llm:conversation:request', payload);
        socket.emit('llm:conversation_stream:request', payload);
      });

      socket.on('llm:conversation_stream:response', (data) => {
        resetTimer();
        if (data && data.error) {
          if (timer) clearTimeout(timer);
          socket.disconnect();
          reject(new Error(data.error));
          return;
        }
        if (fullText !== null) return;
        if (data && data.llm === engine && data.chunk) accumulated += data.chunk;
      });

      socket.on('llm:conversation:response', (data) => {
        resetTimer();
        if (data && data.error) {
          if (timer) clearTimeout(timer);
          socket.disconnect();
          reject(new Error(data.error));
          return;
        }
        if (data && data.llm === engine && data.data && data.data.data) {
          fullText = data.data.data;
          accumulated = fullText;
        }
      });

      socket.on('llm:conversation_stream:error', (data) => {
        if (timer) clearTimeout(timer);
        socket.disconnect();
        reject(new Error(data?.error || 'Eye2 stream error'));
      });

      socket.on('llm:conversation:error', (data) => {
        if (timer) clearTimeout(timer);
        socket.disconnect();
        reject(new Error(data?.error || 'Eye2 engine error'));
      });

      socket.on('llm:conversation:end', () => {
        if (timer) clearTimeout(timer);
        socket.disconnect();
        if (accumulated) resolve(accumulated);
        else reject(new Error('Eye2.ai returned an empty response'));
      });

      socket.on('connect_error', (err) => {
        if (timer) clearTimeout(timer);
        socket.disconnect();
        reject(err);
      });
    });

    return res.json(sse.completion(generateId, modelId, content));
  }

  sse.open(res);
  const m = sse.meta(generateId, modelId);

  return new Promise((resolve) => {
    let emittedSource = null; // 'chunks' | 'full' — emit from only one source
    let finished = false;
    let timer = null;
    const socket = io(SOCKET_SERVER_URL, {
      transports: ['websocket'],
      auth: { shareId },
      timeout: 30000
    });

    const finishStream = () => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      sse.finish(res, m);
      sse.done(res);
      socket.disconnect();
      resolve();
    };

    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(finishStream, 45000);
    };
    resetTimer();

    socket.on('connect', () => {
      const payload = { shareId, llmList: [engine], web: useWeb };
      socket.emit('llm:conversation:request', payload);
      socket.emit('llm:conversation_stream:request', payload);
    });

    socket.on('llm:conversation_stream:response', (data) => {
      if (finished) return;
      resetTimer();
      if (data && data.error) {
        finished = true;
        if (timer) clearTimeout(timer);
        sse.fail(res, m, data.error);
        socket.disconnect();
        resolve();
        return;
      }
      if (emittedSource === 'full') return;
      if (data && data.llm === engine && data.chunk) {
        emittedSource = 'chunks';
        sse.chunk(res, m, { content: data.chunk });
      }
    });

    socket.on('llm:conversation:response', (data) => {
      if (finished) return;
      resetTimer();
      if (data && data.error) {
        finished = true;
        if (timer) clearTimeout(timer);
        sse.fail(res, m, data.error);
        socket.disconnect();
        resolve();
        return;
      }
      if (emittedSource === 'chunks') return;
      if (data && data.llm === engine && data.data && data.data.data && emittedSource !== 'full') {
        emittedSource = 'full';
        sse.chunk(res, m, { content: data.data.data });
      }
    });

    socket.on('llm:conversation_stream:error', (data) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      sse.fail(res, m, data?.error || 'Eye2 stream error');
      socket.disconnect();
      resolve();
    });

    socket.on('llm:conversation:error', (data) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      sse.fail(res, m, data?.error || 'Eye2 engine error');
      socket.disconnect();
      resolve();
    });

    socket.on('llm:conversation:end', () => {
      finishStream();
    });

    socket.on('connect_error', (err) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      sse.fail(res, m, err.message || 'Eye2 socket error');
      socket.disconnect();
      resolve();
    });
  });
}

module.exports = { getModels, handleChat };
