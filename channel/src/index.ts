import { CHANNEL_ID, inspectAccount, listAccountIds } from "./config";
import { createChannelPlugin } from "./channel";

export default function register(api: {
  logger?: { info?: (message: string, extra?: Record<string, unknown>) => void };
  registerChannel: (args: { plugin: unknown }) => void;
  registerGatewayMethod: (
    name: string,
    handler: (ctx: { config?: unknown; respond: (ok: boolean, payload: unknown) => void }) => void,
  ) => void;
  registerCommand: (command: {
    name: string;
    description: string;
    requireAuth?: boolean;
    handler: (ctx: { config: unknown }) => { text: string } | Promise<{ text: string }>;
  }) => void;
  registerHttpRoute: (route: {
    path: string;
    auth: "gateway" | "plugin";
    match?: "exact" | "prefix";
    handler: (req: { method?: string }, res: { statusCode: number; setHeader?: (name: string, value: string) => void; end: (body?: string) => void }) => boolean | Promise<boolean>;
  }) => void;
}) {
  api.registerChannel({ plugin: createChannelPlugin(api) });

  api.registerGatewayMethod(`${CHANNEL_ID}.status`, ({ respond, config }) => {
    const cfg = (config ?? {}) as Parameters<typeof listAccountIds>[0];
    respond(true, {
      ok: true,
      channelId: CHANNEL_ID,
      accounts: listAccountIds(cfg).map((accountId) => inspectAccount(cfg, accountId)),
    });
  });

  api.registerCommand({
    name: "commbridge_status",
    description: "Show Communication Bridge account status",
    handler: async (ctx) => {
      const cfg = ctx.config as Parameters<typeof listAccountIds>[0];
      const summaries = listAccountIds(cfg).map((accountId) => inspectAccount(cfg, accountId));

      if (summaries.length === 0) {
        return { text: "Communication Bridge has no configured accounts." };
      }

      const lines = summaries.map((summary) => {
        const outbound = summary.outboundUrlStatus === "available" ? "configured" : "missing outboundUrl";
        return `${summary.accountId}: ${outbound}`;
      });

      return { text: lines.join("\n") };
    },
  });

  api.registerHttpRoute({
    path: "/plugins/vscode/health",
    auth: "plugin",
    match: "exact",
    handler: async (_req, res) => {
      res.statusCode = 200;
      res.setHeader?.("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, plugin: CHANNEL_ID }));
      return true;
    },
  });
}
