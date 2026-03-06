import {
  CHANNEL_ID,
  type CommBridgeAccountConfig,
  type RootConfig,
  inspectAccount,
  listAccountIds,
  requireConfiguredAccount,
  resolveAccount,
} from "./config";

export interface OutboundSendRequest {
  cfg: RootConfig;
  accountId?: string;
  text: string;
  threadId?: string | null;
  metadata?: Record<string, unknown>;
  recipient?: string;
}

export interface LoggerLike {
  info?: (message: string, extra?: Record<string, unknown>) => void;
  warn?: (message: string, extra?: Record<string, unknown>) => void;
}

export interface OpenClawApiLike {
  logger?: LoggerLike;
  registerChannel: (args: { plugin: unknown }) => void;
  registerGatewayMethod: (
    name: string,
    handler: (ctx: { respond: (ok: boolean, payload: unknown) => void }) => void,
  ) => void;
  registerCommand: (command: {
    name: string;
    description: string;
    requireAuth?: boolean;
    handler: (ctx: { config: RootConfig }) => { text: string } | Promise<{ text: string }>;
  }) => void;
  registerHttpRoute: (route: {
    path: string;
    auth: "gateway" | "plugin";
    match?: "exact" | "prefix";
    handler: (req: { method?: string }, res: { statusCode: number; setHeader?: (name: string, value: string) => void; end: (body?: string) => void }) => boolean | Promise<boolean>;
  }) => void;
}

export function buildOutboundPayload(args: {
  accountId: string;
  text: string;
  threadId?: string | null;
  metadata?: Record<string, unknown>;
  recipient?: string;
  account: CommBridgeAccountConfig;
}) {
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

export async function sendOutboundText(args: OutboundSendRequest): Promise<{ ok: true; providerMessageId?: string }> {
  const account = requireConfiguredAccount(args.cfg, args.accountId);
  const payload = buildOutboundPayload({
    accountId: account.accountId,
    account,
    text: args.text,
    threadId: args.threadId,
    metadata: args.metadata,
    recipient: args.recipient,
  });

  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...account.headers,
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

  let providerMessageId: string | undefined;

  if (bodyText) {
    try {
      const parsed = JSON.parse(bodyText) as { id?: string; messageId?: string; providerMessageId?: string };
      providerMessageId = parsed.providerMessageId ?? parsed.messageId ?? parsed.id;
    } catch {
      providerMessageId = undefined;
    }
  }

  return providerMessageId ? { ok: true, providerMessageId } : { ok: true };
}

export function createChannelPlugin(api: OpenClawApiLike) {
  return {
    id: CHANNEL_ID,
    meta: {
      id: CHANNEL_ID,
      label: "Communication Bridge",
      selectionLabel: "Communication Bridge (HTTP API)",
      docsPath: "/channels/comm-bridge",
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
      sendText: async (ctx: {
        cfg: RootConfig;
        accountId?: string;
        text: string;
        threadId?: string | null;
        metadata?: Record<string, unknown>;
        recipient?: string;
      }) => sendOutboundText(ctx),
    },
    status: {
      async get(ctx: { cfg: RootConfig }) {
        return {
          ok: true,
          accounts: listAccountIds(ctx.cfg).map((accountId) => inspectAccount(ctx.cfg, accountId)),
        };
      },
    },
    setup: {
      describeAccount(ctx: { cfg: RootConfig; accountId?: string }) {
        return inspectAccount(ctx.cfg, ctx.accountId);
      },
    },
    onboarding: {
      async configure(ctx: { cfg: RootConfig; accountId?: string }) {
        return {
          cfg: ctx.cfg,
          accountId: ctx.accountId ?? "default",
        };
      },
    },
    gateway: {
      async start() {
        api.logger?.info?.("comm-bridge gateway hooks ready");
      },
      async stop() {
        api.logger?.info?.("comm-bridge gateway hooks stopped");
      },
    },
  };
}
