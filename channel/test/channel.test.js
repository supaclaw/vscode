const assert = require("node:assert/strict");
const test = require("node:test");

const { buildOutboundPayload, sendOutboundText } = require("../src/channel.js");
const { inspectAccount, listAccountIds, resolveAccount } = require("../src/config.js");

test("lists configured accounts", () => {
  const cfg = {
    channels: {
      vscode: {
        accounts: {
          default: {
            enabled: true,
            label: "Primary",
            outboundUrl: "https://bridge.example.com/messages",
            authToken: "secret-token",
            webhookSecret: "secret-hook",
            defaultRecipient: "room-123",
          },
        },
      },
    },
  };

  assert.deepEqual(listAccountIds(cfg), ["default"]);
});

test("resolves the default account", () => {
  const cfg = {
    channels: {
      vscode: {
        accounts: {
          default: {
            outboundUrl: "https://bridge.example.com/messages",
          },
        },
      },
    },
  };

  assert.deepEqual(resolveAccount(cfg), {
    accountId: "default",
    outboundUrl: "https://bridge.example.com/messages",
  });
});

test("inspects availability fields without exposing secrets", () => {
  const cfg = {
    channels: {
      vscode: {
        accounts: {
          default: {
            enabled: true,
            label: "Primary",
            outboundUrl: "https://bridge.example.com/messages",
            authToken: "secret-token",
            webhookSecret: "secret-hook",
            defaultRecipient: "room-123",
          },
        },
      },
    },
  };

  assert.deepEqual(inspectAccount(cfg), {
    accountId: "default",
    enabled: true,
    configured: true,
    label: "Primary",
    outboundUrlStatus: "available",
    authTokenStatus: "available",
    authTokenSource: "config",
    webhookSecretStatus: "available",
    webhookSecretSource: "config",
    defaultRecipientStatus: "available",
  });
});

test("builds the expected outbound payload", () => {
  const payload = buildOutboundPayload({
    accountId: "default",
    text: "hello",
    account: {
      defaultRecipient: "room-123",
    },
  });

  assert.deepEqual(payload, {
    source: "openclaw",
    channel: "vscode",
    accountId: "default",
    recipient: "room-123",
    text: "hello",
    threadId: null,
    metadata: {},
  });
});

test("sends text to the configured outbound URL", async (t) => {
  global.fetch = async (url, options) => {
    assert.equal(url, "https://bridge.example.com/messages");
    assert.equal(options.method, "POST");
    assert.equal(options.headers["content-type"], "application/json");
    assert.equal(options.headers.authorization, "Bearer secret-token");
    assert.equal(options.headers["x-tenant"], "demo");

    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ messageId: "msg-1" }),
    };
  };

  t.after(() => {
    delete global.fetch;
  });

  const result = await sendOutboundText({
    cfg: {
      channels: {
        vscode: {
          accounts: {
            default: {
              outboundUrl: "https://bridge.example.com/messages",
              authToken: "secret-token",
              defaultRecipient: "room-123",
              headers: {
                "x-tenant": "demo",
              },
            },
          },
        },
      },
    },
    text: "hello",
  });

  assert.deepEqual(result, { ok: true, providerMessageId: "msg-1" });
});

test("throws when outboundUrl is missing", async () => {
  await assert.rejects(
    sendOutboundText({
      cfg: {
        channels: {
          vscode: {
            accounts: {
              default: {},
            },
          },
        },
      },
      text: "hello",
    }),
    /missing channels\.vscode\.accounts\.default\.outboundUrl/,
  );
});