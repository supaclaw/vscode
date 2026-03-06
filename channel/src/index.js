const { CHANNEL_ID, inspectAccount, listAccountIds } = require("./config.js");
const { createChannelPlugin } = require("./channel.js");

module.exports = function register(api) {
  api.registerChannel({ plugin: createChannelPlugin(api) });

  api.registerGatewayMethod(`${CHANNEL_ID}.status`, ({ respond, config }) => {
    const cfg = config ?? {};
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
      const cfg = ctx.config ?? {};
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
    path: "/plugins/comm-bridge/health",
    auth: "plugin",
    match: "exact",
    handler: async (_req, res) => {
      res.statusCode = 200;
      res.setHeader?.("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, plugin: CHANNEL_ID }));
      return true;
    },
  });
};
