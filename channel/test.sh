#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$SCRIPT_DIR"

if ! command -v node >/dev/null 2>&1; then
	if command -v nodejs >/dev/null 2>&1; then
		NODE_BIN="nodejs"
	else
		echo "error: node or nodejs is required to run channel plugin tests" >&2
		exit 1
	fi
else
	NODE_BIN="node"
fi

echo "Running OpenClaw channel plugin tests on Ubuntu..."
"$NODE_BIN" --test test/*.test.js "$@"
