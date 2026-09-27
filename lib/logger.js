// In-memory request & response log ring buffer for provider diagnostics.

const MAX_LOGS = 300;
const logs = [];
let nextId = 1;

function addLog(entry) {
  const item = {
    id: nextId++,
    time: new Date().toLocaleTimeString('en-US', { hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0'),
    date: new Date().toISOString(),
    timestamp: Date.now(),
    provider: entry.provider || 'unknown',
    model: entry.model || '',
    actualModel: entry.actualModel || entry.model || '',
    stream: !!entry.stream,
    webSearch: !!entry.webSearch,
    status: entry.status || 200,
    durationMs: entry.durationMs || 0,
    prompt: entry.prompt || '',
    response: entry.response || '',
    error: entry.error || null
  };

  logs.unshift(item);
  if (logs.length > MAX_LOGS) logs.pop();
  return item;
}

function getLogs() {
  return logs;
}

function clearLogs() {
  logs.length = 0;
  return { success: true };
}

module.exports = { addLog, getLogs, clearLogs };
