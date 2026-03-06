# OpenClaw VS Code Workspace

This workspace contains two connected projects for using OpenClaw through VS Code:

- `channel/`: an OpenClaw communication channel plugin with id `comm-bridge`
- `extension/`: a VS Code extension that provides a local chat UI and HTTP receiver

Together they let you use VS Code as a chat surface while OpenClaw routes replies through the configured channel bridge.

## Workspace Index

### Channel plugin

Location: `channel/`

Purpose:
- Registers the `comm-bridge` OpenClaw channel
- Sends outbound text to a configurable HTTP endpoint
- Exposes status helpers and a health route for plugin diagnostics

See `channel/README.md` for plugin configuration, request format, and local testing.

### VS Code extension

Location: `extension/`

Purpose:
- Opens a VS Code chat panel for interacting with OpenClaw
- Runs a local HTTP receiver for inbound channel messages
- Forwards user messages to a configurable OpenClaw gateway endpoint

See `extension/README.md` for extension commands, settings, and integration details.

## How the pieces connect

1. The VS Code extension starts a local receiver, typically at `http://127.0.0.1:8765/messages`.
2. The OpenClaw channel plugin is configured to post outbound messages to that receiver.
3. Messages arriving from OpenClaw appear in the VS Code chat panel.
4. When you send a message from the chat panel, the extension posts it to your configured OpenClaw HTTP entrypoint.

## Suggested Development Flow

### Channel

- Work inside `channel/`
- Load that directory through `plugins.load.paths` in OpenClaw
- Run tests with `node --test`

### Extension

- Work inside `extension/`
- Run it in a VS Code Extension Development Host
- Configure `openclawVscode.gatewayMessageUrl` and receiver settings in VS Code
