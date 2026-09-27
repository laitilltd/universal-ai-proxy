// fetch with explicit timeouts.
//
// - connectMs: abort if response *headers* have not arrived in time (a hung
//   TCP/TLS handshake or an upstream that accepts but never replies).
// - totalMs: optionally keep the abort timer running for the whole response
//   so the body read is bounded too. Use for non-stream requests only.
//
// Node's built-in fetch (undici) defaults to ~300s for both, which is far too
// long: one stalled upstream blocks the client and the auto-fallback loop.

function fetchWithTimeout(url, options = {}, { connectMs = 30000, totalMs = 0 } = {}) {
  const controller = new AbortController();
  let timer = null;
  let timedOut = false;

  const arm = (ms) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timedOut = true; controller.abort(); }, ms);
  };

  const clear = () => { if (timer) clearTimeout(timer); timer = null; };

  arm(connectMs);

  return fetch(url, { ...options, signal: controller.signal })
    .then((resp) => {
      if (totalMs > 0) arm(totalMs);
      else clear();
      return resp;
    })
    .catch((err) => {
      clear();
      if (timedOut || err.name === 'AbortError') {
        const ms = totalMs > 0 ? totalMs : connectMs;
        const timeoutErr = new Error(`Upstream timed out after ${ms}ms`);
        timeoutErr.type = 'upstream_timeout';
        throw timeoutErr;
      }
      throw err;
    });
}

module.exports = { fetchWithTimeout };
