# OpenClaw Communication Bridge Plugin

This repository contains a standalone OpenClaw communication channel plugin that registers a generic HTTP-backed channel named `vscode`.

It is designed as a clean starting point for custom messaging integrations when you do not yet have an official OpenClaw channel plugin for your provider.

## What it does

- Registers a channel under `channels.vscode`
- Supports multi-account configuration via `channels.vscode.accounts.<accountId>`
- Implements read-only account inspection for `openclaw status` style commands
- Sends outbound text messages to an HTTP API you control
- Exposes a simple gateway RPC status method: `vscode.status`
- Adds a slash command: `/commbridge_status`
- Exposes a lightweight plugin HTTP health route at `/plugins/vscode/health`

## Build

```bash
bash ./build.sh
```

OpenClaw can load the JavaScript entrypoint directly, so there is no compile step.
The Ubuntu build script validates the required plugin files and creates an npm tarball with `npm pack` for distribution or local installation testing.

Requirements:

- `bash`
- `node` or `nodejs`
- `npm` or `npmjs`

## Test

```bash
bash ./test.sh
```

The Ubuntu test script runs the JavaScript test suite directly from this plugin directory and accepts additional `node --test` arguments.

## Load into OpenClaw

During development, point OpenClaw at this folder:

```ts
export default {
  plugins: {
    enabled: true,
    load: {
      paths: ["/absolute/path/to/this/repo"]
    },
    entries: {
      "vscode": {
        enabled: true
      }
    }
  },
  channels: {
    "vscode": {
      accounts: {
        default: {
          enabled: true,
          label: "Primary bridge",
          outboundUrl: "https://bridge.example.com/messages",
          authToken: "replace-me",
          webhookSecret: "replace-me",
          defaultRecipient: "room-123",
          headers: {
            "x-tenant": "demo"
          }
        }
      }
    }
  }
};
```

Restart the OpenClaw gateway after enabling the plugin.

## Outbound request format

The plugin sends a JSON body like this to `outboundUrl`:

```json
{
  "source": "openclaw",
  "channel": "vscode",
  "accountId": "default",
  "recipient": "room-123",
  "text": "hello",
  "threadId": null,
  "metadata": {}
}
```

If `authToken` is configured, the plugin adds `Authorization: Bearer <token>`.

## Notes

- This plugin is intentionally generic. It gives you a solid OpenClaw-compatible channel skeleton without pretending to support a specific provider API.
- Inbound message ingestion is provider-specific and depends on your target platform. This scaffold leaves that part for the concrete integration you build next.

## Extend it next

- Replace the generic `outboundUrl` HTTP call with your provider SDK or REST API contract.
- Add inbound webhook handling once you know the provider event format and the specific OpenClaw runtime helper you want to target.
