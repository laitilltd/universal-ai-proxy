// Shared OpenAI-compatible response helpers.
// Every provider speaks the same wire format through these, so a fix here fixes all of them.

function open(res) {
  if (res.headersSent || res.writableEnded) return;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

function event(res, payload) {
  if (res.writableEnded) return;
  res.write('data: ' + JSON.stringify(payload) + '\n\n');
}

function meta(generateId, modelId) {
  return { id: generateId(), created: Math.floor(Date.now() / 1000), model: modelId };
}

function chunk(res, m, delta) {
  event(res, {
    id: m.id, object: 'chat.completion.chunk', created: m.created, model: m.model,
    choices: [{ index: 0, delta: delta, finish_reason: null }]
  });
}

function finish(res, m) {
  event(res, {
    id: m.id, object: 'chat.completion.chunk', created: m.created, model: m.model,
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
  });
}

function done(res) {
  if (res.writableEnded) return;
  res.write('data: [DONE]\n\n');
  res.end();
}

function fail(res, m, message) {
  event(res, { error: { message: message || 'Upstream error' } });
  done(res);
}

const EMPTY_USAGE = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

function completion(generateId, modelId, content, usage) {
  return {
    id: generateId(),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: modelId,
    choices: [{ index: 0, message: { role: 'assistant', content: content || '' }, finish_reason: 'stop' }],
    usage: usage || EMPTY_USAGE
  };
}

function textOf(parsed) {
  const choice = parsed.choices && parsed.choices[0];
  if (!choice) return parsed.content || '';
  if (choice.delta && typeof choice.delta.content === 'string') return choice.delta.content;
  if (choice.message && typeof choice.message.content === 'string') return choice.message.content;
  return '';
}

// Relay an OpenAI-compatible upstream: accepts either SSE or a plain JSON body.
async function relayOpenAI(resp, res, m) {
  const contentType = ((resp.headers && resp.headers.get('content-type')) || '').toLowerCase();

  if (contentType.indexOf('application/json') !== -1) {
    const data = await resp.json();
    if (data.error) return fail(res, m, data.error.message || String(data.error));
    const text = textOf(data);
    if (text) chunk(res, m, { role: 'assistant', content: text });
    finish(res, m);
    return done(res);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done: eof, value } = await reader.read();
    if (eof) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]' || !trimmed.startsWith('data:')) continue;
      const jsonStr = trimmed.slice(5).trim();
      if (!jsonStr || jsonStr === '[DONE]') continue;
      let parsed;
      try { parsed = JSON.parse(jsonStr); } catch { continue; }
      if (parsed.error) return fail(res, m, parsed.error.message || String(parsed.error));
      const text = textOf(parsed);
      if (text) chunk(res, m, { content: text });
    }
  }

  if (buffer) {
    const trimmed = buffer.trim();
    if (trimmed && trimmed.startsWith('data:') && trimmed !== 'data: [DONE]') {
      const jsonStr = trimmed.slice(5).trim();
      if (jsonStr && jsonStr !== '[DONE]') {
        try {
          const parsed = JSON.parse(jsonStr);
          if (!parsed.error) {
            const text = textOf(parsed);
            if (text) chunk(res, m, { content: text });
          }
        } catch {}
      }
    }
  }

  finish(res, m);
  done(res);
}

module.exports = { open, event, meta, chunk, finish, done, fail, completion, relayOpenAI, EMPTY_USAGE };
