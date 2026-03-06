const http = require("node:http");
const vscode = require("vscode");

const MESSAGE_STATE_KEY = "openclawVscode.messages";
const STATUS_STATE_KEY = "openclawVscode.status";

function activate(context) {
  const store = new ChatStore(context);
  const receiver = new ReceiverController(store);
  const panel = new ChatPanelController(context, store, receiver);

  context.subscriptions.push(
    vscode.commands.registerCommand("openclawVscode.openChat", () => panel.show()),
    vscode.commands.registerCommand("openclawVscode.startReceiver", async () => {
      await receiver.start();
      panel.pushState();
    }),
    vscode.commands.registerCommand("openclawVscode.stopReceiver", async () => {
      await receiver.stop();
      panel.pushState();
    }),
    vscode.commands.registerCommand("openclawVscode.copyChannelConfig", async () => {
      await vscode.env.clipboard.writeText(buildChannelConfigSnippet(getSettings()));
      vscode.window.showInformationMessage("Copied OpenClaw channel config snippet to the clipboard.");
    }),
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration("openclawVscode.receiverHost") || event.affectsConfiguration("openclawVscode.receiverPort") || event.affectsConfiguration("openclawVscode.receiverAuthToken")) {
        if (receiver.isRunning()) {
          await receiver.restart();
        }
      }

      if (event.affectsConfiguration("openclawVscode.maxMessages")) {
        store.trimToLimit();
      }

      panel.pushState();
    }),
    {
      dispose: () => receiver.dispose(),
    },
  );

  if (getSettings().autoStartReceiver) {
    receiver.start().catch((error) => {
      const message = getErrorMessage(error);
      store.setStatus(`Receiver failed to start: ${message}`);
      void vscode.window.showErrorMessage(`OpenClaw receiver failed to start: ${message}`);
    });
  }
}

function deactivate() {
  return undefined;
}

class ChatStore {
  constructor(context) {
    this.context = context;
    this.messages = context.workspaceState.get(MESSAGE_STATE_KEY, []);
    this.status = context.workspaceState.get(STATUS_STATE_KEY, "Idle");
    this.listeners = new Set();
    this.trimToLimit();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  getMessages() {
    return [...this.messages];
  }

  getStatus() {
    return this.status;
  }

  addMessage(message) {
    this.messages = [
      ...this.messages,
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        timestamp: new Date().toISOString(),
        ...message,
      },
    ];
    this.trimToLimit();
    this.persist();
    this.emit();
  }

  clearMessages() {
    this.messages = [];
    this.persist();
    this.emit();
  }

  setStatus(status) {
    this.status = status;
    this.persist();
    this.emit();
  }

  trimToLimit() {
    const limit = Math.max(20, Number(getSettings().maxMessages) || 200);
    if (this.messages.length > limit) {
      this.messages = this.messages.slice(-limit);
      this.persist();
      this.emit();
    }
  }

  persist() {
    void this.context.workspaceState.update(MESSAGE_STATE_KEY, this.messages);
    void this.context.workspaceState.update(STATUS_STATE_KEY, this.status);
  }

  emit() {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

class ReceiverController {
  constructor(store) {
    this.store = store;
    this.server = undefined;
    this.info = undefined;
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  isRunning() {
    return Boolean(this.server);
  }

  getInfo() {
    return this.info;
  }

  async start() {
    if (this.server) {
      return this.info;
    }

    const settings = getSettings();
    const server = http.createServer((req, res) => {
      this.handleRequest(req, res).catch((error) => {
        res.statusCode = error.statusCode || 500;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: false, error: getErrorMessage(error) }));
      });
    });

    server.on("error", (error) => {
      this.store.setStatus(`Receiver error: ${getErrorMessage(error)}`);
      this.emit();
    });

    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(settings.receiverPort, settings.receiverHost, () => {
        server.off("error", reject);
        resolve();
      });
    });

    this.server = server;
    this.info = {
      url: `http://${settings.receiverHost}:${settings.receiverPort}`,
      messagesUrl: `http://${settings.receiverHost}:${settings.receiverPort}/messages`,
      healthUrl: `http://${settings.receiverHost}:${settings.receiverPort}/health`,
    };
    this.store.setStatus(`Receiver listening on ${this.info.messagesUrl}`);
    this.emit();
    return this.info;
  }

  async stop() {
    if (!this.server) {
      return;
    }

    const server = this.server;
    this.server = undefined;
    this.info = undefined;

    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    this.store.setStatus("Receiver stopped");
    this.emit();
  }

  async restart() {
    await this.stop();
    await this.start();
  }

  dispose() {
    if (this.server) {
      void this.stop();
    }
  }

  async handleRequest(req, res) {
    const method = req.method || "GET";
    const url = new URL(req.url || "/", "http://localhost");

    if (method === "GET" && url.pathname === "/health") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, receiver: "openclaw-vscode-channel" }));
      return;
    }

    if (method === "POST" && url.pathname === "/messages") {
      assertAuthorized(req);
      const payload = await readJsonBody(req);
      const message = normalizeInboundMessage(payload);
      this.store.addMessage(message);
      this.store.setStatus(`Received message from ${message.author}`);
      res.statusCode = 202;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.statusCode = 404;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "Not found" }));
  }

  emit() {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

class ChatPanelController {
  constructor(context, store, receiver) {
    this.context = context;
    this.store = store;
    this.receiver = receiver;
    this.panel = undefined;

    context.subscriptions.push(
      store.subscribe(() => this.pushState()),
      receiver.subscribe(() => this.pushState()),
    );
  }

  show() {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      this.pushState();
      return;
    }

    this.panel = vscode.window.createWebviewPanel("openclawVscodeChat", "OpenClaw VS Code Chat", vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
    });

    this.panel.webview.html = getWebviewHtml(this.panel.webview);
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    }, null, this.context.subscriptions);

    this.panel.webview.onDidReceiveMessage(async (message) => {
      if (message?.type === "ready") {
        this.pushState();
        return;
      }
      if (message?.type === "clearMessages") {
        this.store.clearMessages();
        return;
      }
      if (message?.type === "copyChannelConfig") {
        await vscode.env.clipboard.writeText(buildChannelConfigSnippet(getSettings()));
        void vscode.window.showInformationMessage("Copied OpenClaw channel config snippet to the clipboard.");
        return;
      }
      if (message?.type === "sendMessage") {
        await this.handleSendMessage(String(message.text || ""));
      }
    }, null, this.context.subscriptions);

    this.pushState();
  }

  async handleSendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    const settings = getSettings();
    this.store.addMessage({ role: "user", author: settings.senderId, text: trimmed });

    if (!settings.gatewayMessageUrl) {
      this.store.addMessage({ role: "system", author: "extension", text: "Set openclawVscode.gatewayMessageUrl before sending messages to OpenClaw." });
      this.store.setStatus("Missing gatewayMessageUrl");
      return;
    }

    this.store.setStatus("Sending message to OpenClaw...");

    try {
      const response = await fetch(settings.gatewayMessageUrl, {
        method: "POST",
        headers: buildGatewayHeaders(settings),
        body: JSON.stringify(buildGatewayPayload(trimmed, settings)),
      });
      const contentType = response.headers.get("content-type") || "";
      const bodyText = await response.text();

      if (!response.ok) {
        throw new Error(`Gateway request failed (${response.status}): ${bodyText}`);
      }

      const reply = parseGatewayReply(bodyText, contentType);
      if (reply) {
        this.store.addMessage({ role: "assistant", author: reply.author, text: reply.text });
        this.store.setStatus("Received synchronous reply from OpenClaw");
      } else {
        this.store.setStatus("Message forwarded to OpenClaw");
      }
    } catch (error) {
      const message = getErrorMessage(error);
      this.store.addMessage({ role: "system", author: "extension", text: `Failed to send message: ${message}` });
      this.store.setStatus(`Send failed: ${message}`);
      void vscode.window.showErrorMessage(`OpenClaw send failed: ${message}`);
    }
  }

  pushState() {
    if (!this.panel) {
      return;
    }

    this.panel.webview.postMessage({
      type: "state",
      payload: {
        messages: this.store.getMessages(),
        status: this.store.getStatus(),
        receiver: this.receiver.getInfo(),
        settings: publicSettings(getSettings()),
      },
    });
  }
}

function getSettings() {
  const config = vscode.workspace.getConfiguration("openclawVscode");
  return {
    autoStartReceiver: config.get("autoStartReceiver", true),
    receiverHost: config.get("receiverHost", "127.0.0.1"),
    receiverPort: config.get("receiverPort", 8765),
    receiverAuthToken: config.get("receiverAuthToken", ""),
    gatewayMessageUrl: config.get("gatewayMessageUrl", ""),
    gatewayAuthToken: config.get("gatewayAuthToken", ""),
    channelId: config.get("channelId", "comm-bridge"),
    accountId: config.get("accountId", "default"),
    senderId: config.get("senderId", "vscode-user"),
    conversationId: config.get("conversationId", "vscode"),
    maxMessages: config.get("maxMessages", 200),
  };
}

function publicSettings(settings) {
  return {
    gatewayMessageUrl: settings.gatewayMessageUrl,
    receiverHost: settings.receiverHost,
    receiverPort: settings.receiverPort,
    channelId: settings.channelId,
    accountId: settings.accountId,
    senderId: settings.senderId,
    conversationId: settings.conversationId,
  };
}

function buildChannelConfigSnippet(settings) {
  const outboundConfig = {
    enabled: true,
    label: "VS Code",
    outboundUrl: `http://${settings.receiverHost}:${settings.receiverPort}/messages`,
  };
  if (settings.receiverAuthToken) {
    outboundConfig.authToken = settings.receiverAuthToken;
  }
  return JSON.stringify({
    channels: {
      [settings.channelId]: {
        accounts: {
          [settings.accountId]: outboundConfig,
        },
      },
    },
  }, null, 2);
}

function buildGatewayHeaders(settings) {
  const headers = { "content-type": "application/json" };
  if (settings.gatewayAuthToken) {
    headers.authorization = `Bearer ${settings.gatewayAuthToken}`;
  }
  return headers;
}

function buildGatewayPayload(text, settings) {
  return {
    channel: settings.channelId,
    channelId: settings.channelId,
    accountId: settings.accountId,
    senderId: settings.senderId,
    conversationId: settings.conversationId,
    text,
    metadata: {
      source: "vscode-extension",
      sentAt: new Date().toISOString(),
    },
  };
}

function parseGatewayReply(bodyText, contentType) {
  if (!bodyText.trim()) {
    return undefined;
  }
  if (contentType.includes("application/json")) {
    try {
      const payload = JSON.parse(bodyText);
      const text = payload.reply || payload.text || payload.message || payload.content;
      if (typeof text === "string" && text.trim()) {
        return { author: payload.author || payload.senderId || "openclaw", text };
      }
      return undefined;
    } catch {
      return undefined;
    }
  }
  return { author: "openclaw", text: bodyText.trim() };
}

function assertAuthorized(req) {
  const token = getSettings().receiverAuthToken;
  if (!token) {
    return;
  }
  if (req.headers.authorization !== `Bearer ${token}`) {
    const error = new Error("Unauthorized receiver request");
    error.statusCode = 401;
    throw error;
  }
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function normalizeInboundMessage(payload) {
  return {
    role: payload.role === "user" ? "user" : "assistant",
    author: firstString(payload.author, payload.senderId, payload.accountId, "openclaw"),
    text: firstString(payload.text, payload.message, payload.content, payload.body) || JSON.stringify(payload, null, 2),
  };
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function getWebviewHtml(webview) {
  const nonce = String(Date.now());
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; font-family: var(--vscode-font-family); background: radial-gradient(circle at top, rgba(0,122,204,.18), transparent 28%), var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
    .shell { min-height: 100vh; display: grid; grid-template-rows: auto auto 1fr auto; }
    .hero { padding: 18px 20px 12px; border-bottom: 1px solid var(--vscode-panel-border); background: linear-gradient(135deg, rgba(0,122,204,.24), rgba(0,122,204,.06)); }
    .hero h1 { margin: 0; font-size: 18px; }
    .hero p { margin: 6px 0 0; opacity: .8; }
    .statusbar { display: flex; flex-wrap: wrap; gap: 10px; padding: 10px 20px; border-bottom: 1px solid var(--vscode-panel-border); }
    .pill { padding: 4px 10px; border-radius: 999px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); font-size: 12px; }
    .messages { padding: 18px 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
    .empty { padding: 18px; border: 1px dashed var(--vscode-panel-border); border-radius: 16px; opacity: .75; }
    .message { max-width: min(860px, 100%); padding: 12px 14px; border-radius: 16px; border: 1px solid var(--vscode-panel-border); background: color-mix(in srgb, var(--vscode-editorWidget-background) 82%, transparent); }
    .message.user { align-self: flex-end; background: linear-gradient(135deg, rgba(0,122,204,.28), rgba(0,122,204,.12)); }
    .message.assistant { align-self: flex-start; }
    .message.system { align-self: center; background: color-mix(in srgb, var(--vscode-inputValidation-warningBackground) 60%, transparent); }
    .meta { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px; font-size: 11px; opacity: .72; }
    .text { white-space: pre-wrap; line-height: 1.5; }
    .composer { padding: 14px 20px 20px; border-top: 1px solid var(--vscode-panel-border); display: grid; gap: 10px; }
    textarea { width: 100%; min-height: 110px; box-sizing: border-box; resize: vertical; border-radius: 14px; border: 1px solid var(--vscode-panel-border); padding: 12px 14px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); font: inherit; }
    .actions { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; }
    .group { display: flex; flex-wrap: wrap; gap: 10px; }
    button { border: 0; border-radius: 999px; padding: 10px 14px; font: inherit; cursor: pointer; color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    .note { font-size: 11px; opacity: .7; }
  </style>
</head>
<body>
  <div class="shell">
    <div class="hero">
      <h1>OpenClaw VS Code Channel</h1>
      <p>Chat from VS Code while OpenClaw sends replies back into this local receiver.</p>
    </div>
    <div class="statusbar">
      <span class="pill" id="status">Idle</span>
      <span class="pill" id="receiver">Receiver offline</span>
      <span class="pill" id="gateway">Gateway unset</span>
    </div>
    <div class="messages" id="messages">
      <div class="empty">No messages yet. Start the receiver, configure the channel plugin to post here, and send a message.</div>
    </div>
    <div class="composer">
      <textarea id="input" placeholder="Type a message to forward into OpenClaw"></textarea>
      <div class="actions">
        <div class="group">
          <button id="send">Send to OpenClaw</button>
          <button class="secondary" id="copyConfig">Copy channel config</button>
        </div>
        <div class="group">
          <button class="secondary" id="clear">Clear messages</button>
        </div>
      </div>
      <div class="note">Use Ctrl+Enter or Cmd+Enter to send. The extension posts user messages to gatewayMessageUrl and receives replies on the local /messages endpoint.</div>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const input = document.getElementById('input');
    const messagesEl = document.getElementById('messages');
    const statusEl = document.getElementById('status');
    const receiverEl = document.getElementById('receiver');
    const gatewayEl = document.getElementById('gateway');
    document.getElementById('send').addEventListener('click', sendMessage);
    document.getElementById('copyConfig').addEventListener('click', () => vscode.postMessage({ type: 'copyChannelConfig' }));
    document.getElementById('clear').addEventListener('click', () => vscode.postMessage({ type: 'clearMessages' }));
    input.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        sendMessage();
      }
    });
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'state') {
        render(event.data.payload);
      }
    });
    function sendMessage() {
      const text = input.value.trim();
      if (!text) {
        return;
      }
      vscode.postMessage({ type: 'sendMessage', text });
      input.value = '';
      input.focus();
    }
    function render(state) {
      statusEl.textContent = state.status || 'Idle';
      receiverEl.textContent = state.receiver ? 'Receiver: ' + state.receiver.messagesUrl : 'Receiver offline';
      gatewayEl.textContent = state.settings.gatewayMessageUrl ? 'Gateway: ' + state.settings.gatewayMessageUrl : 'Gateway unset';
      if (!state.messages.length) {
        messagesEl.innerHTML = '<div class="empty">No messages yet. Start the receiver, configure the channel plugin to post here, and send a message.</div>';
        return;
      }
      messagesEl.innerHTML = state.messages.map((message) => {
        const role = escapeHtml(message.role || 'assistant');
        const author = escapeHtml(message.author || 'unknown');
        const time = escapeHtml(new Date(message.timestamp).toLocaleTimeString());
        const text = escapeHtml(message.text || '').replaceAll('\n', '<br>');
        return '<article class="message ' + role + '"><div class="meta"><span>' + author + '</span><span>' + time + '</span></div><div class="text">' + text + '</div></article>';
      }).join('');
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
    function escapeHtml(value) {
      return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
    }
    vscode.postMessage({ type: 'ready' });
    input.focus();
  </script>
</body>
</html>`;
}

module.exports = { activate, deactivate };
