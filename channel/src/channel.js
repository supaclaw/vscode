const {
  CHANNEL_ID,
  inspectAccount,
  listAccountIds,
  requireConfiguredAccount,
  resolveAccount,
} = require("./config.js");

function buildOutboundPayload(args) {
  return {
    source: "openclaw",
    channel: CHANNEL_ID,
    accountId: args.accountId,
    recipient: args.recipient ?? args.account.defaultRecipient ?? null,
    text: args.text,
    threadId: args.threadId ?? null,
    metadata: args.metadata ?? {},
  };
}

async function sendOutboundText(args) {
  const account = requireConfiguredAccount(args.cfg, args.accountId);
  const payload = buildOutboundPayload({
    accountId: account.accountId,
    account,
    text: args.text,
    threadId: args.threadId,
    metadata: args.metadata,
    recipient: args.recipient,
  });

  const headers = {
    "content-type": "application/json",
    ...(account.headers ?? {}),
  };

  if (account.authToken) {
    headers.authorization = `Bearer ${account.authToken}`;
  }

  const response = await fetch(account.outboundUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const bodyText = await response.text();

  if (!response.ok) {
    throw new Error(`Communication bridge request failed (${response.status}): ${bodyText}`);
  }

  let providerMessageId;

  if (bodyText) {
    try {
      const parsed = JSON.parse(bodyText);
      providerMessageId = parsed.providerMessageId ?? parsed.messageId ?? parsed.id;
    } catch {
      providerMessageId = undefined;
    }
  }

  return providerMessageId ? { ok: true, providerMessageId } : { ok: true };
}

function createChannelPlugin(api) {
  return {
    id: CHANNEL_ID,
    meta: {
      id: CHANNEL_ID,
      label: "Communication Bridge",
      selectionLabel: "Communication Bridge (HTTP API)",
      docsPath: "/channels/vscode",
      blurb: "A generic outbound HTTP bridge for custom communication providers.",
      aliases: ["commbridge", "http-bridge"],
    },
    capabilities: {
      chatTypes: ["direct", "group"],
    },
    config: {
      listAccountIds,
      resolveAccount,
      inspectAccount,
    },
    outbound: {
      deliveryMode: "direct",
      sendText: (ctx) => sendOutboundText(ctx),
    },
    status: {
      async get(ctx) {
        return {
          ok: true,
          accounts: listAccountIds(ctx.cfg).map((accountId) => inspectAccount(ctx.cfg, accountId)),
        };
      },
    },
    setup: {
      describeAccount(ctx) {
        return inspectAccount(ctx.cfg, ctx.accountId);
      },
    },
    onboarding: {
      async configure(ctx) {
        return {
          cfg: ctx.cfg,
          accountId: ctx.accountId ?? "default",
        };
      },
    },
    gateway: {
      async start() {
        api.logger?.info?.("vscode gateway hooks ready");
      },
      async stop() {
        api.logger?.info?.("vscode gateway hooks stopped");
      },
    },
  };
}

module.exports = {
  buildOutboundPayload,
  sendOutboundText,
  createChannelPlugin,
};
