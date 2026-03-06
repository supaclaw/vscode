import { describe, expect, it, vi, afterEach } from "vitest";

import { buildOutboundPayload, sendOutboundText } from "../src/channel";
import { inspectAccount, listAccountIds, resolveAccount } from "../src/config";

describe("config helpers", () => {
  const cfg = {
    channels: {
      "comm-bridge": {
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

  it("lists configured accounts", () => {
    expect(listAccountIds(cfg)).toEqual(["default"]);
  });

  it("resolves the default account", () => {
    expect(resolveAccount(cfg)).toMatchObject({
      accountId: "default",
      outboundUrl: "https://bridge.example.com/messages",
    });
  });

  it("inspects availability fields without exposing secrets", () => {
    expect(inspectAccount(cfg)).toEqual({
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
});

describe("outbound sender", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds the expected outbound payload", () => {
    const payload = buildOutboundPayload({
      accountId: "default",
      text: "hello",
      account: {
        defaultRecipient: "room-123",
      },
    });

    expect(payload).toEqual({
      source: "openclaw",
      channel: "comm-bridge",
      accountId: "default",
      recipient: "room-123",
      text: "hello",
      threadId: null,
      metadata: {},
    });
  });

  it("sends text to the configured outbound URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ messageId: "msg-1" }),
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendOutboundText({
        cfg: {
          channels: {
            "comm-bridge": {
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
      }),
    ).resolves.toEqual({ ok: true, providerMessageId: "msg-1" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://bridge.example.com/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          authorization: "Bearer secret-token",
          "x-tenant": "demo",
        }),
      }),
    );
  });

  it("throws when outboundUrl is missing", async () => {
    await expect(
      sendOutboundText({
        cfg: {
          channels: {
            "comm-bridge": {
              accounts: {
                default: {},
              },
            },
          },
        },
        text: "hello",
      }),
    ).rejects.toThrow("missing channels.comm-bridge.accounts.default.outboundUrl");
  });
});