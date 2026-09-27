const sse = require('../lib/sse');
const { createBrowserDriver } = require('../lib/browser');

const SITE_URL = 'https://unlimitedai.org/chat/';

const MODELS = [
  { id: 'unlimitedai/chatgpt',    botId: 25871, name: 'ChatGPT 5 Nano',     provider: 'unlimitedai', ownedBy: 'OpenAI',   tabIndex: 0 },
  { id: 'unlimitedai/gemini',     botId: 25874, name: 'Gemini',             provider: 'unlimitedai', ownedBy: 'Google',   tabIndex: 1 },
  { id: 'unlimitedai/deepseek',   botId: 25873, name: 'DeepSeek',           provider: 'unlimitedai', ownedBy: 'OpenAI',   tabIndex: 2 },
  { id: 'unlimitedai/claude',     botId: 25875, name: 'Claude',             provider: 'unlimitedai', ownedBy: 'Claude',   tabIndex: 3 },
  { id: 'unlimitedai/grok',       botId: 25872, name: 'Grok (Xai)',         provider: 'unlimitedai', ownedBy: 'xAI',      tabIndex: 4 },
  { id: 'unlimitedai/perplexity', botId: 29624, name: 'Perplexity Sonar',   provider: 'unlimitedai', ownedBy: 'OpenAI',   tabIndex: 5 },
  { id: 'unlimitedai/meta',       botId: 25870, name: 'Meta Llama 4',       provider: 'unlimitedai', ownedBy: 'OpenAI',   tabIndex: 6 },
  { id: 'unlimitedai/qwen',       botId: 25869, name: 'Qwen 3 30B',         provider: 'unlimitedai', ownedBy: 'OpenAI',   tabIndex: 7 },
];

const driver = createBrowserDriver({
  label: 'UnlimitedAI Provider',
  args: ['--window-size=1280,720'],
  setup: async (page) => {
    console.log('[UnlimitedAI Provider] Navigating to unlimitedai.org...');
    await page.goto(SITE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('.aipkit_chat_container', { timeout: 30000 });
  }
});

function getModels() {
  return MODELS.map(m => ({
    id: m.id,
    object: 'model',
    created: 1,
    owned_by: m.ownedBy,
    provider: 'unlimitedai',
    meta: { name: m.name }
  }));
}

async function sendViaBrowser(message, modelEntry) {
  return driver.run(page => page.evaluate(async (msg, tabIndex) => {
    const tabs = document.querySelectorAll('.aipkit_chat_tab');
    if (tabs && tabs[tabIndex]) {
      tabs[tabIndex].click();
      await new Promise(r => setTimeout(r, 500));
    }

    const containers = Array.from(document.querySelectorAll('.aipkit_chat_container'));
    const container = containers.find(c => c.offsetWidth > 0 && c.offsetHeight > 0) || containers[0];
    if (!container) throw new Error('Chat container not found');

    const input = container.querySelector('textarea, input[type="text"]');
    const sendBtn = container.querySelector('.aipkit_chat_send_button, button[type="submit"]');
    if (!input) throw new Error('Input textarea not found');

    // Snapshot the conversation BEFORE sending so an older assistant bubble
    // (or the user's own message) can never be mistaken for the new reply.
    const SEL = '.aipkit_chat_message_content, .aipkit_chat_bubble_text, .aipkit_message_content, .aipkit_chat_bubble';
    const before = Array.from(container.querySelectorAll(SEL));
    const baselineLast = before.length ? before[before.length - 1] : null;
    const baselineText = baselineLast ? baselineLast.innerText.trim() : '';

    input.value = msg;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    if (sendBtn) sendBtn.click();
    else input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));

    let lastText = '';
    let sameCount = 0;
    let replySeen = false;
    const startTime = Date.now();

    while (Date.now() - startTime < 60000) {
      await new Promise(r => setTimeout(r, 800));
      const bubbles = container.querySelectorAll(SEL);
      if (bubbles.length === 0) continue;
      const lastBubble = bubbles[bubbles.length - 1];
      const currentText = lastBubble.innerText.trim();
      const isStreaming = container.querySelector('.aipkit_message_streaming, .aipkit_typing-indicator');

      // Only start accepting once a NEW bubble appeared whose text differs
      // from the pre-send state and from the prompt we just sent.
      if (!replySeen) {
        const isNewBubble = !baselineLast || lastBubble !== baselineLast;
        if (isNewBubble && currentText && currentText !== baselineText && currentText !== msg) {
          replySeen = true;
          lastText = currentText;
          sameCount = 0;
        }
        continue;
      }

      if (currentText && currentText === lastText && !isStreaming) {
        sameCount++;
        if (sameCount >= 2) return currentText;
      } else if (currentText) {
        lastText = currentText;
        sameCount = 0;
      }
    }
    throw new Error('Timeout waiting for response from unlimitedai');
  }, message, modelEntry.tabIndex));
}

function lastUserText(messages) {
  const userMsgs = (messages || []).filter(m => m.role === 'user');
  if (userMsgs.length === 0) return '';
  const content = userMsgs[userMsgs.length - 1].content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const parts = content.filter(p => p.type === 'text' && p.text).map(p => p.text);
    if (parts.length > 0) return parts.join('\n');
  }
  return content ? String(content) : '';
}

async function handleChat({ modelId, messages, stream }, res, generateId) {
  const modelEntry = MODELS.find(m => m.id === modelId) || MODELS[0];
  const lastMessage = lastUserText(messages);

  if (!lastMessage) {
    if (stream === false) return res.status(400).json({ error: { message: 'No user message provided' } });
    sse.open(res);
    return sse.fail(res, sse.meta(generateId, modelId), 'No user message provided');
  }

  if (stream === false) {
    try {
      const content = await sendViaBrowser(lastMessage, modelEntry);
      if (!content) throw new Error('UnlimitedAI returned an empty response');
      return res.json(sse.completion(generateId, modelId, content));
    } catch (err) {
      return res.status(502).json({ error: { message: err.message, type: 'upstream_error' } });
    }
  }

  sse.open(res);
  const m = sse.meta(generateId, modelId);

  try {
    const content = await sendViaBrowser(lastMessage, modelEntry);
    if (!content) throw new Error('UnlimitedAI returned an empty response');
    // Emit in modest-size pieces: per-word writes produced thousands of
    // res.write calls per answer for no benefit.
    for (const piece of content.match(/[\s\S]{1,160}/g) || []) {
      sse.chunk(res, m, { content: piece });
    }
    sse.finish(res, m);
    sse.done(res);
  } catch (err) {
    sse.fail(res, m, err.message);
  }
}

module.exports = {
  initBrowser: () => driver.init(),
  closeBrowser: () => driver.close(),
  status: () => driver.status(),
  getModels,
  handleChat
};
