# ⚡ Universal AI API Proxy

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.x-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![OpenAI Compatible](https://img.shields.io/badge/OpenAI-API--Compatible-412991?style=flat-square&logo=openai&logoColor=white)](https://platform.openai.com/docs/api-reference)
[![Tests](https://img.shields.io/badge/Tests-95%2F95%20Passed-10b981?style=flat-square)](./test/e2e.js)
[![License](https://img.shields.io/badge/License-ISC-6366f1?style=flat-square)](./package.json)

A production-ready, unified **OpenAI-compatible REST API proxy server** that fronts multiple free AI chat providers alongside your own custom API endpoints. Features automated multi-provider failover routing, custom drag-and-drop combo sequence builders, an interactive dual-pane web UI with live logs, authentication, offline-served static assets, and a portable Windows System Tray launcher.

![Universal AI Proxy Screenshot](./screen.png)

---

## 🌟 Key Features

- 🔌 **OpenAI API Compatible**: Drop-in replacement for OpenAI SDKs (`POST /v1/chat/completions`) supporting text, streaming (SSE), multimodal base64 image inputs, and real-time web search toggle.
- 🎨 **Black & White High-Contrast Web UI (`/`)**: Resizable split-pane layout (Chat + Real-time Logs), view mode switcher (`Split` / `Chat` / `Logs`), Select2 real-time search filters, and SweetAlert2 dark notifications.
- 🔒 **Built-in Authentication & Security**: Password-protected login page (`/login`), salted PBKDF2 password hashing, session tokens, password management, and optional `ADMIN_KEY` protection for mutating endpoints.
- 🔀 **Smart Auto Failover & Combo Routers**: Configurable drag-and-drop model failover order (`auto`) and custom named combo routers (`combo/<id>`) with automated 30s failure cooldowns.
- 📦 **Offline & Self-Contained**: 100% local static assets (`/assets/css`, `/assets/js`) with zero dependency on external CDNs.
- 🖥️ **Portable Executable & System Tray Icon**: Run standalone via `start.exe`, `start.cmd`, or `start.vbs`. Shows a custom **`UAI`** taskbar system tray icon with context menu controls.
- 🚀 **12+ Preset API Compatibility Templates**: Instant setup for **OpenRouter**, **Ollama**, **Groq**, **DeepSeek**, **Mistral**, **xAI Grok**, **OpenCode Zen**, **Poolside**, **BazaarLink**, **Kilo Gateway**, **Google Gemini**, and **Anthropic Claude** with direct API key helper links.

---

## 📋 System Requirements

- **Node.js**: `v20.0.0` or higher installed.
- **Google Chrome**: Required for browser-backed providers (`duckai`, `unlimitedai`).
- **Operating System**: Windows 10/11, macOS, or Linux.

---

## 📥 Installation

```bash
# 1. Clone the repository
git clone https://github.com/mahediazad/universal-proxy.git
cd universal-proxy

# 2. Install Node.js dependencies
npm install

# 3. Create .env file (Optional)
# Copy example or create custom environment configuration
```

---

## 🚀 How to Run & Use

### Method 1: Portable App Executable (Recommended for Windows)

Double-click **`start.exe`** (or **`start.cmd`** / **`start.vbs`**):
1. Starts the Node server silently in the background.
2. A popup notification will confirm the server is running on `http://localhost:<PORT>/` and offer to open your browser.
3. Places a taskbar system tray icon showing **`UAI`**.
4. **Right-Click Tray Menu**:
   - 💬 **Open Chat**: Opens `http://localhost:3000/` in your default browser.
   - ⚙️ **Auto Start Enable / Disable**: Toggle Windows startup registry.
   - 📞 **Developers Contact**: Visit developer website (`http://mahediazad.com`).
   - ❌ **Quit**: Gracefully stop background server and exit.

### Method 2: Command Line (All Platforms)

```bash
# Start server via npm
npm start

# Or launch tray launcher via npm
npm run start:tray
```

Access the application in your browser:
- 💬 **Web UI & Live Logs**: [http://localhost:3000/](http://localhost:3000/)
- 📚 **API Documentation**: [http://localhost:3000/docs](http://localhost:3000/docs)
- 🔒 **Login Page**: [http://localhost:3000/login](http://localhost:3000/login) *(Default Admin Password: `password`)*

---

## 🖥️ How to Use the Web Interface

1. **Logging In**:
   - Navigate to `http://localhost:3000/`.
   - Enter default password `password` (or your updated password).
2. **Chatting**:
   - Use the **Provider** and **Model** dropdowns with real-time search filters to pick an AI model.
   - Toggle **Search** for web search capabilities or **Stream** for real-time SSE streaming.
   - Attach images (`.jpg`, `.png`), `.pdf`, or `.txt` files via the 📎 button.
3. **Adjusting Layout**:
   - **Resize Panes**: Click and drag the vertical divider handle between Chat and Logs.
   - **View Switcher**: Click `⚡ Split`, `💬 Chat`, or `📋 Logs` in the navbar to toggle full-screen views.
4. **Managing Providers & Combo Routers**:
   - Click the **Providers** button in the top navbar.
   - Add custom API providers (OpenRouter, Groq, Ollama, DeepSeek, Gemini, etc.).
   - Drag & drop models into ordered fallback sequences and save as custom `combo/<id>` routers.
5. **Changing Admin Password**:
   - Click **🔑 Password** in the top navbar.
   - Enter your current password and new password to update `auth.json`.

---

## ⚙️ Environment Configuration (`.env`)

Create or edit `.env` in the root directory:

```env
# Server Port (Default: 3000)
PORT=3000

# Path to Google Chrome (Used for headless browser providers duckai and unlimitedai)
CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe

# Optional: Admin Key protection for mutating API endpoints
ADMIN_KEY=your_secret_admin_key

# Optional: Set to true for automated test environments to skip login
DISABLE_AUTH=false
```

---

## 🧪 Automated Testing

Run the end-to-end test suite (spins up mock servers on port 3999):

```bash
npm test
```

> **Test Suite Status**: **95/95 passed**. Tests endpoints, authentication, session tokens, custom provider CRUD, combo failover routing, alias rewrites, request limits, and fake DOM script rendering.

---

## 🤖 Supported Built-in Providers & Models

| Provider ID | Provider Name | Transport / Type | Models / Alias | Notes |
|---|---|---|---|---|
| `auto` | Auto Failover Router | Internal | `auto` | Walks your configured failover sequence; skips failures for 30s |
| `combo/` | Combo Routers | Internal | `combo/<id>` | Custom drag-and-drop failover sequences |
| `freemodels` | FreeModels Chat | HTTP / SSE | `claude-sonnet-5`, `claude-fable-5`, `claude-fable-5.1`, `gpt-5.6-sol`, `gpt-5.6-terra`, `glm-5.2`, `kimi-k3` | Zero config |
| `duckai` | DuckDuckGo AI | Chrome Driver | `gpt-5.6-luna`, `gpt-5.4-mini`, `claude-haiku-4-5`, `mistral-small-2603` | VQD challenge solver |
| `unlimitedai` | UnlimitedAI Chat | Chrome Driver | `chatgpt`, `gemini`, `deepseek`, `claude`, `grok`, `perplexity`, `meta`, `qwen` | Multi-engine browser backend |
| `aichatting` | AIChatting | HTTP / SSE | `gpt-5.6-luna`, `ask-ai` | HTTP API |
| `aibanglachat` | AiBanglaChat | HTTP API | `bangla-ai`, `bangla-ai-web` | `-web` variant enables search |
| `eye2ai` | Eye2.ai Multi-LLM | Socket.io Stream | `gemini`, `deepseek`, `qwen`, `mistral`, `amazon-nova`, `chatgpt` | WebSockets relay |
| `custom` | Custom Providers | User Configured | `<providerId>/<modelId>` | OpenAI, Gemini, Claude, OpenRouter, Groq, Ollama, DeepSeek, etc. |

---

## 📚 API Endpoints Overview

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Web UI: Chat + Live Console Logs (resizable split view) |
| `GET` | `/docs` | Full-width interactive API documentation |
| `GET` | `/login` | Admin authentication login page |
| `GET` | `/health` | Server health check and browser driver status |
| `POST` | `/v1/auth/login` | Authenticate password and receive session token |
| `POST` | `/v1/auth/logout` | Revoke active session token |
| `POST` | `/v1/auth/change-password` | Update admin password |
| `GET` | `/v1/models` | List all available models across all providers |
| `POST` | `/v1/chat/completions` | Standard OpenAI-compatible Chat Completion endpoint |
| `GET` | `/v1/logs?since=<id>` | Incremental sync of in-memory provider request logs |
| `DELETE` | `/v1/logs` | Clear in-memory request log buffer |
| `GET` | `/v1/custom-providers` | List configured custom API providers |
| `POST` | `/v1/custom-providers` | Create or update a custom API provider |
| `DELETE` | `/v1/custom-providers/:id` | Remove a custom API provider |
| `POST` | `/v1/custom-providers/:id/refresh` | Auto-discover models from provider endpoint |
| `GET` | `/v1/combos` | List custom combo routers and auto sequence |
| `POST` | `/v1/combos` | Create or update a custom combo router |
| `DELETE` | `/v1/combos/:id` | Remove a custom combo router |
| `POST` | `/v1/combos/auto-sequence` | Set global `auto` failover sequence priority |
| `GET` | `/v1/config/export` | Download JSON backup of providers, combos, & auto sequence |
| `POST` | `/v1/config/import` | Import and merge JSON backup configuration |

---

## 💻 SDK & Code Examples

### Python OpenAI SDK Multimodal & Search Example

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="not-needed"  # Or pass session token / ADMIN_KEY
)

response = client.chat.completions.create(
    model="auto",
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Analyze image and search web for current details"},
                {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}}
            ]
        }
    ],
    extra_body={"webSearch": True}
)

print("Result:", response.choices[0].message.content)
```

### cURL Request Example

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "freemodels/claude-sonnet-5",
    "stream": true,
    "webSearch": true,
    "messages": [
      { "role": "user", "content": "Explain quantum computing in simple terms." }
    ]
  }'
```

---

## 📂 Project Architecture

```
universal-proxy/
├── start.exe              # Portable Windows C# executable (System Tray + background server)
├── start.cmd              # Double-click launcher batch script
├── start.vbs              # Silent VBScript launcher
├── build-exe.bat          # 1-Click C# compiler script for start.exe
├── build-icon.ps1         # System Tray icon builder (generates app.ico with UAI text)
├── TrayApp.cs             # C# source for start.exe
├── app.ico                # Taskbar system tray icon asset
├── server.js              # Express 5 app, routing table, UI & docs HTML rendering
├── assets/                # Self-contained offline static assets
│   ├── css/               # Bootstrap 5.3.3 & SweetAlert2 Dark CSS
│   └── js/                # Bootstrap 5.3.3 & SweetAlert2 Bundle JS
├── lib/
│   ├── auth.js            # Password hashing (PBKDF2), session management & route auth
│   ├── net.js             # fetchWithTimeout: connection deadlines & stream timeouts
│   ├── sse.js             # OpenAI-compatible SSE streaming & JSON format helpers
│   ├── browser.js         # Shared headless-Chrome driver with process auto-restart
│   └── logger.js          # Ring buffer memory logger for /v1/logs
├── providers/
│   ├── auto.js            # Auto failover router with provider attempt timeouts & 30s cooldown
│   ├── combos.js          # Combo router persistence & CRUD (atomic JSON writes, mtime cache)
│   ├── custom.js          # Custom provider passthrough (OpenAI, Gemini, Claude, OpenRouter, etc.)
│   ├── freemodels.js      # HTTP SSE provider
│   ├── aichatting.js      # HTTP SSE provider
│   ├── aibanglachat.js    # HTTP provider
│   ├── eye2ai.js          # WebSocket Socket.io provider
│   ├── unlimitedai.js     # Headless Chrome provider
│   └── duckai.js          # Headless Chrome provider with VQD solver
├── custom-providers.json  # Persisted custom API providers
├── combos.json            # Persisted combo routers & auto sequence
├── auth.json              # Persisted admin password hash
└── test/
    └── e2e.js             # Complete E2E test suite (95 tests)
```

---

## 👨‍💻 Developer & Support

Developed & Maintained by **Mahedi Azad**.

- **Developer Portfolio**: [http://mahediazad.com](http://mahediazad.com)
- **Bug Reports & Issues**: [https://github.com/anomalyco/antigravity/issues](https://github.com/anomalyco/antigravity/issues)

---

## 📜 License

This project is licensed under the [ISC License](./package.json).
