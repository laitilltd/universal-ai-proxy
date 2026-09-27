const freemodels = require('./freemodels');
const unlimitedai = require('./unlimitedai');
const aibanglachat = require('./aibanglachat');
const aichatting = require('./aichatting');
const eye2ai = require('./eye2ai');
const duckai = require('./duckai');
const custom = require('./custom');
const combos = require('./combos');
const { isBrowserEnabled } = require('../lib/browser');

const BUILTIN_FALLBACK_MODELS = [
  'aibanglachat/bangla-ai',
  'aichatting/gpt-5.6-luna',
  'eye2ai/gemini',
  'unlimitedai/chatgpt',
  'freemodels/claude-sonnet-5',
  'duckai/gpt-5.6-luna',
];

// A candidate that just failed is skipped for a short window so a dead
// provider stops costing a round trip (or a 15s timeout) on every request.
const FAILURE_TTL_MS = 30000;
const failUntil = new Map();

// Browser-backed providers (Chrome) legitimately need much longer than HTTP
// APIs to produce a first token, so timeouts are classified per provider.
// A single flat 15s budget made auto never able to use duckai/unlimitedai.
const BROWSER_PREFIXES = ['duckai/', 'unlimitedai/'];
const FIRST_CHUNK_TIMEOUT_MS = { browser: 70000, http: 15000 };
const ATTEMPT_TIMEOUT_MS = { browser: 150000, http: 90000 };

function providerClass(modelId) {
  const m = (modelId || '').toLowerCase();
  return BROWSER_PREFIXES.some(p => m.startsWith(p)) ? 'browser' : 'http';
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label + ' timed out after ' + ms + 'ms')), ms);
    })
  ]).finally(() => clearTimeout(timer));
}

function pruneFailures(now) {
  if (failUntil.size < 256) return;
  for (const [key, until] of failUntil) {
    if (until <= now) failUntil.delete(key);
  }
}

function candidatesForAttempt(customSequence = null) {
  let all = Array.isArray(customSequence) && customSequence.length > 0 ? customSequence : null;
  if (!all) {
    const saved = combos.getAutoSequence();
    all = saved.length > 0 ? saved : getCandidateModels();
  }
  if (!isBrowserEnabled()) {
    all = all.filter(m => !m.startsWith('duckai/') && !m.startsWith('unlimitedai/'));
  }
  const now = Date.now();
  const healthy = all.filter(m => (failUntil.get(m) || 0) <= now);
  return healthy.length > 0 ? healthy : all;
}

function markFailure(model) {
  failUntil.set(model, Date.now() + FAILURE_TTL_MS);
  pruneFailures(Date.now());
}

function markSuccess(model) {
  failUntil.delete(model);
}

function getModels() {
  return [
    {
      id: 'auto',
      object: 'model',
      created: 1,
      owned_by: 'auto',
      provider: 'auto',
      meta: { name: 'Auto (Automatic Fallback Router)' }
    }
  ];
}

function getCandidateModels() {
  const customModels = custom.getModels().map(m => m.id);
  let builtins = BUILTIN_FALLBACK_MODELS;
  if (!isBrowserEnabled()) {
    builtins = builtins.filter(m => !m.startsWith('duckai/') && !m.startsWith('unlimitedai/'));
  }
  return [...new Set([...builtins, ...customModels])];
}

async function dispatchChat(targetModel, body, mockRes, generateId, reqHeaders) {
  const requestedModel = targetModel.toLowerCase();
  const reqBody = { ...body, model: targetModel, modelId: targetModel };

  const customProviders = custom.getProviders();
  const isCustom = customProviders.some(p => {
    const prefix = p.id.toLowerCase();
    if (requestedModel.startsWith(prefix + '/')) return true;
    if (p.models && p.models.some(m => (typeof m === 'string' ? m : m.id).toLowerCase() === requestedModel)) return true;
    return false;
  });

  if (isCustom) return custom.handleChat(reqBody, mockRes, generateId, reqHeaders);
  if (requestedModel.startsWith('duckai/')) return duckai.handleChat(reqBody, mockRes, generateId);
  if (requestedModel.startsWith('eye2ai/')) return eye2ai.handleChat(reqBody, mockRes, generateId);
  if (requestedModel.startsWith('aichatting/')) return aichatting.handleChat(reqBody, mockRes, generateId);
  if (requestedModel.startsWith('aibanglachat/')) return aibanglachat.handleChat(reqBody, mockRes, generateId);
  if (requestedModel.startsWith('unlimitedai/')) return unlimitedai.handleChat(reqBody, mockRes, generateId);
  if (requestedModel.startsWith('freemodels/')) return freemodels.handleChat(reqBody, mockRes, generateId);
  return custom.handleChat(reqBody, mockRes, generateId, reqHeaders);
}

async function handleChat(body, res, generateId, reqHeaders = {}, customSequence = null) {
  const candidates = candidatesForAttempt(customSequence);
  const isStream = body.stream !== false;

  if (!isStream) {
    for (let i = 0; i < candidates.length; i++) {
      const candidateModel = candidates[i];

      try {
        const attempt = new Promise((resolve, reject) => {
          let hasResponded = false;
          const mockRes = {
            status: function (code) { this.statusCode = code; return this; },
            json: function (data) {
              if (hasResponded) return;
              hasResponded = true;
              if (this.statusCode && this.statusCode >= 400) reject(new Error(data.error?.message || `HTTP ${this.statusCode}`));
              else if (data.error) reject(new Error(data.error.message));
              else resolve(data);
            },
            setHeader: function () {},
            flushHeaders: function () {}
          };

          Promise.resolve(dispatchChat(candidateModel, { ...body, stream: false }, mockRes, generateId, reqHeaders)).catch(reject);
        });

        const timeoutMs = ATTEMPT_TIMEOUT_MS[providerClass(candidateModel)];
        const result = await withTimeout(attempt, timeoutMs, candidateModel);

        markSuccess(candidateModel);
        console.log(`[Auto Router] ${candidateModel} answered (${i + 1}/${candidates.length} tried)`);
        result.model = 'auto (' + candidateModel + ')';
        return res.json(result);
      } catch (err) {
        markFailure(candidateModel);
        console.warn(`[Auto Router] ${candidateModel} failed: ${err.message}`);
      }
    }

    return res.status(500).json({
      error: { message: 'All Auto Fallback providers failed.', type: 'auto_fallback_error' }
    });
  }

  for (let i = 0; i < candidates.length; i++) {
    const candidateModel = candidates[i];

    try {
      const { mockRes } = createStreamingMock();
      const dispatchPromise = Promise.resolve().then(() =>
        dispatchChat(candidateModel, { ...body, stream: true }, mockRes, generateId, reqHeaders)
      );
      dispatchPromise.catch(err => {
        try { mockRes.json({ error: { message: err.message } }); } catch {}
      });

      const firstChunkMs = FIRST_CHUNK_TIMEOUT_MS[providerClass(candidateModel)];
      const firstChunkResult = await mockRes.waitForFirstChunkOrError(firstChunkMs);

      if (firstChunkResult.error) {
        markFailure(candidateModel);
        console.warn(`[Auto Router] ${candidateModel} streaming failed: ${firstChunkResult.error}`);
        continue;
      }

      markSuccess(candidateModel);
      console.log(`[Auto Router] streaming via ${candidateModel} (${i + 1}/${candidates.length} tried)`);

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      mockRes.pipeToRealRes(res, candidateModel);
      return;
    } catch (err) {
      markFailure(candidateModel);
      console.warn(`[Auto Router] ${candidateModel} error: ${err.message}`);
    }
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ error: { message: 'All Auto Fallback providers failed.' } })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
}

function createStreamingMock() {
  const bufferedData = [];
  let hasError = null;
  let firstChunkResolver = null;
  let isDone = false;
  let realResTarget = null;

  const promise = new Promise((resolve) => {
    firstChunkResolver = resolve;
  });

  const mockRes = {
    setHeader: function () {},
    flushHeaders: function () {},
    status: function (code) { this.statusCode = code; return this; },
    json: function (data) {
      if (data.error) {
        hasError = data.error.message || 'JSON error';
        if (firstChunkResolver) {
          firstChunkResolver({ error: hasError });
          firstChunkResolver = null;
        }
      }
    },
    write: function (chunk) {
      if (realResTarget) {
        realResTarget.write(chunk);
        return;
      }
      // After a timeout the dispatcher is abandoned but may keep streaming;
      // stop growing the buffer so it can't leak memory.
      if (bufferedData.length < 500) bufferedData.push(chunk);

      if (typeof chunk === 'string' && chunk.includes('"error"')) {
        try {
          const match = chunk.match(/data:\s*(\{.*\})/);
          if (match) {
            const p = JSON.parse(match[1]);
            if (p.error) hasError = p.error.message;
          }
        } catch {}
      }

      if (hasError && firstChunkResolver) {
        firstChunkResolver({ error: hasError });
        firstChunkResolver = null;
      } else if (bufferedData.length > 0 && firstChunkResolver) {
        firstChunkResolver({ success: true });
        firstChunkResolver = null;
      }
    },
    end: function () {
      isDone = true;
      if (realResTarget) realResTarget.end();
      if (firstChunkResolver) {
        if (hasError) firstChunkResolver({ error: hasError });
        else if (bufferedData.length > 0) firstChunkResolver({ success: true });
        else firstChunkResolver({ error: 'Empty response stream' });
        firstChunkResolver = null;
      }
    },
    waitForFirstChunkOrError: function (timeoutMs) {
      return Promise.race([
        promise,
        new Promise((resolve) => setTimeout(() => resolve({ error: 'Timeout waiting for stream' }), timeoutMs))
      ]);
    },
    pipeToRealRes: function (realRes) {
      realResTarget = realRes;
      for (const chunk of bufferedData) realRes.write(chunk);
      if (isDone) realRes.end();
    }
  };

  return { mockRes };
}

module.exports = { getModels, handleChat, getCandidateModels };
