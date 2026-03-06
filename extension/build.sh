#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$SCRIPT_DIR"

if command -v node >/dev/null 2>&1; then
	NODE_BIN="node"
elif command -v nodejs >/dev/null 2>&1; then
	NODE_BIN="nodejs"
else
	echo "error: node or nodejs is required to build the VS Code extension" >&2
	exit 1
fi

if command -v npm >/dev/null 2>&1; then
	NPM_BIN="npm"
elif command -v npmjs >/dev/null 2>&1; then
	NPM_BIN="npmjs"
else
	echo "error: npm or npmjs is required to build the VS Code extension" >&2
	exit 1
fi

required_files=(
	"package.json"
	"README.md"
	"extension.js"
)

for required_file in "${required_files[@]}"; do
	if [[ ! -f "$required_file" ]]; then
		echo "error: required extension file is missing: $required_file" >&2
		exit 1
	fi
done

echo "Using $($NODE_BIN --version)"
echo "Using $($NPM_BIN --version)"
echo "Packaging VS Code extension as a .vsix..."

if command -v npx >/dev/null 2>&1; then
	npx --yes @vscode/vsce package "$@"
else
	"$NPM_BIN" exec --yes @vscode/vsce package -- "$@"
fi
