#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$SCRIPT_DIR"

if command -v node >/dev/null 2>&1; then
	NODE_BIN="node"
elif command -v nodejs >/dev/null 2>&1; then
	NODE_BIN="nodejs"
else
	echo "error: node or nodejs is required to test the VS Code extension" >&2
	exit 1
fi

echo "Using $($NODE_BIN --version)"
echo "Running VS Code extension validation checks..."

"$NODE_BIN" --check extension.js

"$NODE_BIN" <<'EOF' "$@"
const fs = require("node:fs");
const path = require("node:path");

const packageJsonPath = path.join(process.cwd(), "package.json");
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

const requiredTopLevelFields = ["name", "displayName", "version", "engines", "main"];
for (const field of requiredTopLevelFields) {
	if (!pkg[field]) {
		throw new Error(`package.json is missing required field: ${field}`);
	}
}

if (!pkg.engines || !pkg.engines.vscode) {
	throw new Error("package.json is missing engines.vscode");
}

if (pkg.main !== "./extension.js") {
	throw new Error(`package.json main must be ./extension.js, got: ${pkg.main}`);
}

if (!pkg.activationEvents || pkg.activationEvents.length === 0) {
	throw new Error("package.json must declare at least one activation event");
}

if (!pkg.contributes || !Array.isArray(pkg.contributes.commands) || pkg.contributes.commands.length === 0) {
	throw new Error("package.json must declare contributed commands");
}

console.log("package.json validation passed");
EOF

echo "VS Code extension checks passed."
