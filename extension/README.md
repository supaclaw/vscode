# OpenClaw VS Code Channel Extension

This extension turns VS Code into a local chat surface for OpenClaw.

It provides two pieces:

- a chat webview panel inside VS Code
- a local HTTP receiver that the OpenClaw channel plugin can post messages to

## What it supports

- Open a VS Code chat panel with `OpenClaw: Open VS Code Chat`
- Start a local receiver automatically or manually
- Accept inbound channel messages on `POST /messages`
- Return receiver health on `GET /health`
- Forward user messages to a configurable OpenClaw HTTP endpoint
- Copy a matching `channels.vscode.accounts.default` config snippet for the channel plugin

## Extension commands

- `OpenClaw: Open VS Code Chat`
- `OpenClaw: Start VS Code Channel Receiver`
- `OpenClaw: Stop VS Code Channel Receiver`
- `OpenClaw: Copy VS Code Channel Config`

## Settings

- `openclawVscode.autoStartReceiver`
- `openclawVscode.receiverHost`
- `openclawVscode.receiverPort`
- `openclawVscode.receiverAuthToken`
- `openclawVscode.gatewayMessageUrl`
- `openclawVscode.gatewayAuthToken`
- `openclawVscode.channelId`
- `openclawVscode.accountId`
- `openclawVscode.senderId`
- `openclawVscode.conversationId`
- `openclawVscode.maxMessages`

## Build

```bash
bash ./build.sh
```

The Ubuntu build script validates the required extension files and packages the extension as a `.vsix` using `@vscode/vsce`.

Requirements:

- `bash`
- `node` or `nodejs`
- `npm` or `npmjs`

## Test

```bash
bash ./test.sh
```

The Ubuntu test script performs a syntax check on `extension.js` and validates key manifest fields in `package.json`.

## Pair it with the OpenClaw channel plugin

The existing plugin in `../channel` already supports outbound delivery to an HTTP endpoint. Configure that plugin to post to the receiver started by this extension.

Example OpenClaw config:

```ts
export default {
  plugins: {
    enabled: true,
    load: {
      paths: ["/absolute/path/to/workspace/channel"]
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
            label: "VS Code",
            outboundUrl: "http://127.0.0.1:8765/messages",
            authToken: "optional-shared-secret"
        }
      }
    }
  }
};
```

Set the same secret in the extension setting `openclawVscode.receiverAuthToken` if you use `authToken` above.

## User message flow

When you send a message from the webview, the extension posts JSON to `openclawVscode.gatewayMessageUrl`:

```json
{
  "channel": "vscode",
  "channelId": "vscode",
  "accountId": "default",
  "senderId": "vscode-user",
  "conversationId": "vscode",
  "text": "hello from vscode",
  "metadata": {
    "source": "vscode-extension",
    "sentAt": "2026-03-06T00:00:00.000Z"
  }
}
```

If your OpenClaw HTTP entrypoint expects a different payload shape, adapt `extension.js` to your gateway contract.

## Notes

- This extension is plain JavaScript and does not require a compile step before packaging.
- The receiver is local to the VS Code extension host, so OpenClaw must be able to reach that host and port.
- The current workspace uses a WSL UNC path, so keeping the extension dependency-free avoids npm lifecycle path issues.
