const puppeteer = require('puppeteer-core');
const { spawnSync } = require('child_process');

const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const BASE_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'];
const DEAD_PATTERN = /target closed|context destroyed|session closed|frame was detached|protocol error|connection closed|page crashed/i;

// Chrome processes that are still ours, so a process.exit() cannot leave
// headless instances behind.
const trackedPids = new Set();
let exitHookInstalled = false;

function installExitHook() {
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  process.on('exit', () => {
    for (const pid of trackedPids) {
      try {
        if (process.platform === 'win32') {
          spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
        } else {
          process.kill(pid, 'SIGKILL');
        }
      } catch {}
    }
  });
}

function trackBrowser(browser) {
  try {
    const proc = typeof browser.process === 'function' ? browser.process() : null;
    if (proc && proc.pid) {
      trackedPids.add(proc.pid);
      installExitHook();
      return proc.pid;
    }
  } catch {}
  return null;
}

// One shared Chrome page per provider, serialised through a FIFO queue.
// Replaces the old busy-flag spin lock (which polled every 200ms) and
// restarts Chrome automatically when the page dies.
function createBrowserDriver({ label, args = [], setup }) {
  let browser = null;
  let page = null;
  let ready = false;
  let queue = Promise.resolve();
  let launches = 0;
  let browserPid = null;

  async function close() {
    ready = false;
    page = null;
    const old = browser;
    const oldPid = browserPid;
    browser = null;
    browserPid = null;
    if (old) {
      try { await old.close(); } catch {}
      if (oldPid) trackedPids.delete(oldPid);
    }
  }

  async function launch() {
    await close();
    console.log('[' + label + '] Launching Chrome...');
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new',
      args: BASE_ARGS.concat(args)
    });
    browserPid = trackBrowser(browser);
    page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    launches++;
    if (setup) await setup(page);
    ready = true;
    console.log('[' + label + '] Page ready!');
    return page;
  }

  function isDead(err) {
    if (!page) return true;
    try { if (typeof page.isClosed === 'function' && page.isClosed()) return true; } catch { return true; }
    return err ? DEAD_PATTERN.test(String(err.message || err)) : false;
  }

  async function ensure() {
    if (ready && !isDead()) return page;
    return launch();
  }

  function run(fn, timeoutMs = 120000) {
    const task = queue.then(async () => {
      const p = await ensure();
      try {
        let timer = null;
        const timeoutPromise = new Promise((_, reject) => {
          timer = setTimeout(() => {
            ready = false;
            reject(new Error('[' + label + '] Operation timed out after ' + timeoutMs + 'ms'));
          }, timeoutMs);
        });
        const result = await Promise.race([fn(p), timeoutPromise]);
        if (timer) clearTimeout(timer);
        return result;
      } catch (err) {
        if (isDead(err)) ready = false;
        throw err;
      }
    });
    queue = task.then(() => {}, () => {});
    return task;
  }

  return {
    init: async () => { await ensure(); },
    run,
    close,
    status: () => {
      const connected = browser ? (typeof browser.isConnected === 'function' ? browser.isConnected() : true) : false;
      return { ready, launches, alive: !!connected };
    }
  };
}

module.exports = { createBrowserDriver, CHROME_PATH, USER_AGENT };
