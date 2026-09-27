const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sse = require('../lib/sse');
const { fetchWithTimeout } = require('../lib/net');

const CONFIG_PATH = path.join(__dirname, '..', 'custom-providers.json');

let providers = [];
let loaded = false;
let cachedMtime = -1;
const keyIndexMap = {};

function loadProviders() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      providers = [];
      if (!loaded) saveProviders();
      loaded = true;
      cachedMtime = -1;
      return;
    }
    const stat = fs.statSync(CONFIG_PATH);
    if (loaded && stat.mtimeMs === cachedMtime) return;
    providers = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    cachedMtime = stat.mtimeMs;
    loaded = true;
  } catch (err) {
    console.error('[Custom Providers] Error loading config:', err.message);
    if (!loaded) {
      providers = [];
      loaded = true;
    }
  }
}

function saveProviders() {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(providers, null, 2), 'utf8');
    cachedMtime = fs.statSync(CONFIG_PATH).mtimeMs;
    loaded = true;
  } catch (err) {
    console.error('[Custom Providers] Error saving config:', err.message);
  }
}

function normalizeUrl(url) {
  if (!url) return '';
  return url.trim().replace(/\/+$/, '');
}

function getProviderApiKey(provider, reqHeaders = {}) {
  const reqKey = reqHeaders['x-goog-api-key'] ||
                 reqHeaders['x-api-key'] ||
                 (reqHeaders['authorization'] ? reqHeaders['authorization'].replace(/^Bearer\s+/i, '') : null);

  const keys = [];
  if (reqKey && !reqKey.startsWith('not-needed')) {
    keys.push(reqKey);
  }

  if (provider.apiKey) {
    keys.push(...provider.apiKey.split(',').map(k => k.trim()).filter(Boolean));
  }

  const uniqueKeys = [...new Set(keys)];
  if (uniqueKeys.length === 0) return null;

  keyIndexMap[provider.id] = keyIndexMap[provider.id] || 0;
  const key = uniqueKeys[keyIndexMap[provider.id] % uniqueKeys.length];
  keyIndexMap[provider.id]++;
  return key;
}

// Model auto-discovery per provider type
async function fetchModelsFromProvider(type, baseUrl, apiKey) {
  const url = normalizeUrl(baseUrl);
  const keys = apiKey ? apiKey.split(',').map(k => k.trim()).filter(Boolean) : [];
  const primaryKey = keys[0] || '';

  if (type === 'google') {
    const root = url || 'https://generativelanguage.googleapis.com';
    const targetUrl = `${root}/v1beta/models${primaryKey ? '?key=' + primaryKey : ''}`;
    try {
      const resp = await axios.get(targetUrl, { timeout: 10000 });
      if (resp.data && Array.isArray(resp.data.models)) {
        return resp.data.models
          .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
          .map(m => {
            const cleanId = m.name.replace(/^models\//, '');
            return { id: cleanId, name: m.displayName || cleanId };
          });
      }
    } catch (e) {
      return [
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
        { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite' },
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
        { id: 'gemini-2.0-pro-exp-02-05', name: 'Gemini 2.0 Pro Experimental' },
      ];
    }
  }

  if (type === 'anthropic') {
    const targetUrl = `${url || 'https://api.anthropic.com'}/v1/models`;
    const headers = { 'anthropic-version': '2023-06-01' };
    if (primaryKey) headers['x-api-key'] = primaryKey;

    try {
      const resp = await axios.get(targetUrl, { headers, timeout: 10000 });
      if (resp.data && Array.isArray(resp.data.data)) {
        return resp.data.data.map(m => ({ id: m.id, name: m.display_name || m.id }));
      }
    } catch (e) {
      return [
        { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet' },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
        { id: 'claude-3-5-haiku-20241022',  name: 'Claude 3.5 Haiku' },
        { id: 'claude-3-opus-20240229',    name: 'Claude 3 Opus' },
      ];
    }
  }

  const PRESET_FALLBACKS = {
    mistral: [
      { id: 'mistral-small-latest', name: 'Mistral Small' },
      { id: 'mistral-medium-latest', name: 'Mistral Medium' },
      { id: 'mistral-large-latest', name: 'Mistral Large' },
      { id: 'codestral-latest', name: 'Codestral' },
    ],
    grok: [
      { id: 'grok-2-latest', name: 'Grok 2' },
      { id: 'grok-2-vision-latest', name: 'Grok 2 Vision' },
      { id: 'grok-beta', name: 'Grok Beta' },
    ],
    deepseek: [
      { id: 'deepseek-chat', name: 'DeepSeek V3 (Chat)' },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1 (Reasoner)' },
    ],
    groq: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B' },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7b' },
      { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill' },
    ],
    openrouter: [
      { id: 'auto', name: 'OpenRouter Auto' },
    ],
    opencode: [
      { id: 'zen-free', name: 'OpenCode Zen Free' },
    ],
    ollama: [
      { id: 'llama3.2', name: 'Llama 3.2' },
      { id: 'deepseek-r1', name: 'DeepSeek R1' },
      { id: 'qwen2.5-coder', name: 'Qwen 2.5 Coder' },
    ],
    poolside: [
      { id: 'laguna-s-2.1', name: 'Laguna S 2.1' },
    ],
    bazaarlink: [
      { id: 'bzl-auto', name: 'BazaarLink Auto' },
    ],
    kilo: [
      { id: 'kilo-auto', name: 'Kilo Auto' },
    ]
  };

  const candidateUrls = [`${url}/models`, `${url}/v1/models`];
  const headers = {};
  if (primaryKey) {
    headers['Authorization'] = `Bearer ${primaryKey}`;
    headers['x-api-key'] = primaryKey;
  }

  for (const targetUrl of candidateUrls) {
    try {
      const resp = await axios.get(targetUrl, { headers, timeout: 10000 });
      if (resp.data && Array.isArray(resp.data.data)) {
        return resp.data.data.map(m => (typeof m === 'string' ? { id: m } : { id: m.id || m.name, name: m.id || m.name }));
      } else if (resp.data && Array.isArray(resp.data.models)) {
        return resp.data.models.map(m => (typeof m === 'string' ? { id: m } : { id: m.id || m.name, name: m.id || m.name }));
      }
    } catch (e) {}
  }

  return PRESET_FALLBACKS[type] || [];
}

async function addProvider({ id, name, type = 'openai', url, apiKey, models }) {
  loadProviders();

  const providerType = (type || 'openai').toLowerCase();
  const providerId = (id || name || 'custom-' + Date.now()).toLowerCase().replace(/[^a-z0-9_-]/g, '');

  let defaultUrl = url || '';
  if (!defaultUrl) {
    if (providerType === 'google') defaultUrl = 'https://generativelanguage.googleapis.com';
    else if (providerType === 'anthropic') defaultUrl = 'https://api.anthropic.com';
  }
  const cleanUrl = normalizeUrl(defaultUrl);

  let providerModels = [];
  if (models && Array.isArray(models) && models.length > 0) {
    providerModels = models.map(m => (typeof m === 'string' ? { id: m } : m));
  } else {
    providerModels = await fetchModelsFromProvider(providerType, cleanUrl, apiKey);
  }

  const newProvider = {
    id: providerId,
    name: name || providerId,
    type: providerType,
    url: cleanUrl,
    apiKey: apiKey || '',
    models: providerModels,
    createdAt: new Date().toISOString()
  };

  const idx = providers.findIndex(p => p.id === providerId);
  if (idx !== -1) providers[idx] = newProvider;
  else providers.push(newProvider);

  saveProviders();
  return newProvider;
}

function removeProvider(id) {
  loadProviders();
  providers = providers.filter(p => p.id !== id);
  saveProviders();
  return { success: true };
}

function getProviders() {
  loadProviders();
  return providers;
}

async function refreshProviderModels(providerId) {
  loadProviders();
  const provider = providers.find(p => p.id === providerId);
  if (!provider) throw new Error('Provider not found');

  const fetched = await fetchModelsFromProvider(provider.type || 'openai', provider.url, provider.apiKey);
  if (fetched.length > 0) {
    provider.models = fetched;
    saveProviders();
  }
  return provider.models;
}

function getModels() {
  loadProviders();
  const allModels = [];

  for (const p of providers) {
    const pModels = (p.models && p.models.length > 0) ? p.models : [{ id: 'default' }];
    for (const m of pModels) {
      const modelOriginalId = typeof m === 'string' ? m : (m.id || 'default');
      const modelName = (typeof m === 'object' && m.name) ? m.name : modelOriginalId;
      allModels.push({
        id: `${p.id}/${modelOriginalId}`,
        object: 'model',
        created: 1,
        owned_by: p.name || p.id,
        provider: p.id,
        meta: { name: `${p.name} - ${modelName}`, originalId: modelOriginalId, url: p.url, type: p.type || 'openai' }
      });
    }
  }

  return allModels;
}

function convertOpenAIToGemini(messages = []) {
  let systemInstruction = null;
  const contents = [];

  for (const m of messages) {
    const parts = [];
    if (typeof m.content === 'string') {
      if (m.content) parts.push({ text: m.content });
    } else if (Array.isArray(m.content)) {
      for (const p of m.content) {
        if (p.type === 'text' && p.text) {
          parts.push({ text: p.text });
        } else if (p.type === 'image_url' && p.image_url?.url) {
          const match = p.image_url.url.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
          if (match) {
            parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
          }
        }
      }
    }
    if (parts.length === 0) parts.push({ text: '' });

    if (m.role === 'system') {
      systemInstruction = { parts };
    } else {
      contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts });
    }
  }

  return { systemInstruction, contents };
}

function convertOpenAIToAnthropic(messages = []) {
  let system = null;
  const anthropicMsgs = [];

  for (const m of messages) {
    if (m.role === 'system') {
      system = typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? m.content.map(p => p.text || '').join('\n') : '');
      continue;
    }

    if (typeof m.content === 'string') {
      anthropicMsgs.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
    } else if (Array.isArray(m.content)) {
      const blocks = [];
      for (const p of m.content) {
        if (p.type === 'text' && p.text) {
          blocks.push({ type: 'text', text: p.text });
        } else if (p.type === 'image_url' && p.image_url?.url) {
          const match = p.image_url.url.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
          if (match) {
            blocks.push({
              type: 'image',
              source: { type: 'base64', media_type: match[1], data: match[2] }
            });
          }
        }
      }
      anthropicMsgs.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: blocks.length ? blocks : '' });
    }
  }

  return { system, messages: anthropicMsgs };
}

function findProvider(modelId) {
  const safeModelId = modelId || '';
  let targetModel = safeModelId;
  let provider = null;

  if (safeModelId.includes('/')) {
    const parts = safeModelId.split('/');
    const candidate = providers.find(p => p.id.toLowerCase() === parts[0].toLowerCase());
    if (candidate) {
      provider = candidate;
      targetModel = parts.slice(1).join('/');
    }
  }

  if (!provider) {
    provider = providers.find(p => p.models && p.models.some(m => (typeof m === 'string' ? m : m.id).toLowerCase() === safeModelId.toLowerCase()));
  }

  if (provider && provider.models) {
    const exactModel = provider.models.find(m => {
      const id = typeof m === 'string' ? m : (m.id || '');
      return id.toLowerCase() === targetModel.toLowerCase();
    });
    if (exactModel) {
      targetModel = typeof exactModel === 'string' ? exactModel : (exactModel.id || targetModel);
    }
  }

  return { provider, targetModel, safeModelId };
}

function errorJson(res, status, message, type) {
  return res.status(status).json({ error: { message, type } });
}

// 1. GOOGLE GEMINI TYPE
async function handleGoogle({ provider, targetModel, modelId, messages, stream, generateId, apiKey, res, restPayload }) {
  const root = normalizeUrl(provider.url) || 'https://generativelanguage.googleapis.com';
  const { systemInstruction, contents } = convertOpenAIToGemini(messages);
  const payload = { contents };
  if (systemInstruction) payload.system_instruction = systemInstruction;

  if (stream === false) {
    const response = await fetchWithTimeout(`${root}/v1beta/models/${targetModel}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, { connectMs: 30000, totalMs: 120000 });
    const data = await response.json();
    if (!response.ok) return errorJson(res, response.status, data.error?.message || 'Gemini error');
    const content = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    return res.json(sse.completion(generateId, modelId, content, {
      prompt_tokens: data.usageMetadata?.promptTokenCount || 0,
      completion_tokens: data.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: data.usageMetadata?.totalTokenCount || 0
    }));
  }

  sse.open(res);
  const m = sse.meta(generateId, modelId);

  try {
    const response = await fetchWithTimeout(`${root}/v1beta/models/${targetModel}:streamGenerateContent?key=${apiKey}&alt=sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, { connectMs: 30000 });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return sse.fail(res, m, errData.error?.message || 'Gemini stream error');
    }

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
        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr) continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const chunkText = parsed.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
          if (chunkText) sse.chunk(res, m, { content: chunkText });
        } catch {}
      }
    }

    sse.finish(res, m);
    sse.done(res);
  } catch (err) {
    sse.fail(res, m, err.message);
  }
}

// 2. ANTHROPIC CLAUDE TYPE
async function handleAnthropic({ provider, targetModel, modelId, messages, stream, generateId, apiKey, res, restPayload }) {
  const targetUrl = `${normalizeUrl(provider.url) || 'https://api.anthropic.com'}/v1/messages`;
  const { system, messages: anthropicMsgs } = convertOpenAIToAnthropic(messages);

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01'
  };

  const payload = {
    model: targetModel,
    messages: anthropicMsgs,
    max_tokens: restPayload.max_tokens || 4096
  };
  if (system) payload.system = system;

  if (stream === false) {
    const response = await fetchWithTimeout(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    }, { connectMs: 30000, totalMs: 120000 });
    const data = await response.json();
    if (!response.ok) return errorJson(res, response.status, data.error?.message || 'Anthropic error');

    const content = data.content?.map(c => c.text).join('') || '';
    return res.json(sse.completion(generateId, modelId, content, {
      prompt_tokens: data.usage?.input_tokens || 0,
      completion_tokens: data.usage?.output_tokens || 0,
      total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
    }));
  }

  sse.open(res);
  const m = sse.meta(generateId, modelId);
  payload.stream = true;

  try {
    const response = await fetchWithTimeout(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    }, { connectMs: 30000 });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return sse.fail(res, m, errData.error?.message || 'Anthropic stream error');
    }

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
        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr) continue;
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed.type === 'content_block_delta' && parsed.delta && parsed.delta.text) {
            sse.chunk(res, m, { content: parsed.delta.text });
          }
        } catch {}
      }
    }

    sse.finish(res, m);
    sse.done(res);
  } catch (err) {
    sse.fail(res, m, err.message);
  }
}

// 3. OPENAI TYPE (Default)
async function handleOpenAI({ provider, targetModel, modelId, messages, stream, generateId, apiKey, res, restPayload }) {
  const baseUrl = normalizeUrl(provider.url);
  let cleanUrl = baseUrl;
  if (!cleanUrl.endsWith('/chat/completions')) {
    cleanUrl = cleanUrl.endsWith('/v1') ? `${cleanUrl}/chat/completions` : `${cleanUrl}/v1/chat/completions`;
  }

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
    headers['x-api-key'] = apiKey;
  }

  const { modelId: _mId, webSearch: _ws, ...cleanRest } = restPayload || {};
  const payload = { ...cleanRest, model: targetModel, messages, stream: stream !== false };

  if (stream === false) {
    try {
      let resp;
      try {
        resp = await axios.post(cleanUrl, payload, { headers, timeout: 120000 });
      } catch (err) {
        if (err.response?.status === 404 && !baseUrl.endsWith('/v1') && !baseUrl.endsWith('/chat/completions') && !err.response?.data?.error) {
          const fallbackUrl = `${baseUrl}/chat/completions`;
          resp = await axios.post(fallbackUrl, payload, { headers, timeout: 120000 });
        } else {
          throw err;
        }
      }
      const content = resp.data?.choices?.[0]?.message?.content || resp.data?.content || '';
      return res.json(sse.completion(generateId, modelId, content, resp.data?.usage));
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.response?.data?.error || err.message;
      return res.status(err.response?.status || 500).json({ error: { message: msg, type: 'upstream_error' } });
    }
  }

  sse.open(res);
  const m = sse.meta(generateId, modelId);

  try {
    let resp = await fetchWithTimeout(cleanUrl, { method: 'POST', headers, body: JSON.stringify(payload) }, { connectMs: 30000 });
    if (!resp.ok) {
      let errMsg = `Custom provider returned ${resp.status}`;
      try {
        const errBody = await resp.json();
        if (errBody && errBody.error) {
          errMsg = errBody.error.message || errBody.error;
        }
      } catch {}

      if (resp.status === 404 && errMsg === `Custom provider returned 404` && !baseUrl.endsWith('/v1') && !baseUrl.endsWith('/chat/completions')) {
        const fallbackUrl = `${baseUrl}/chat/completions`;
        const fallbackResp = await fetchWithTimeout(fallbackUrl, { method: 'POST', headers, body: JSON.stringify(payload) }, { connectMs: 30000 });
        if (fallbackResp.ok) {
          resp = fallbackResp;
          return await sse.relayOpenAI(resp, res, m);
        }
      }

      return sse.fail(res, m, errMsg);
    }
    await sse.relayOpenAI(resp, res, m);
  } catch (err) {
    sse.fail(res, m, err.message || 'Stream error');
  }
}

// Router and Handler for Custom Providers
async function handleChat({ modelId, messages, stream, ...restPayload }, res, generateId, reqHeaders = {}) {
  loadProviders();

  const { provider, targetModel, safeModelId } = findProvider(modelId);

  if (!provider) {
    return errorJson(res, 404, `Custom provider for model '${safeModelId}' not found`, 'invalid_request_error');
  }

  const pType = (provider.type || 'openai').toLowerCase();
  const apiKey = getProviderApiKey(provider, reqHeaders);

  if (pType !== 'openai' && !apiKey) {
    const label = pType === 'google' ? 'Google Gemini' : 'Anthropic Claude';
    return errorJson(res, 401, `${label} provider '${provider.name}' requires an API key.`);
  }

  const args = { provider, targetModel, modelId, messages, stream, generateId, apiKey, res, restPayload };

  if (pType === 'google') return handleGoogle(args);
  if (pType === 'anthropic') return handleAnthropic(args);
  return handleOpenAI(args);
}

loadProviders();

module.exports = {
  getProviders,
  addProvider,
  removeProvider,
  refreshProviderModels,
  getModels,
  handleChat
};
