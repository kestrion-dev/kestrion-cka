#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

node -e "const [major, minor] = process.versions.node.split('.').map(Number); if (major < 22 || (major === 22 && minor < 12)) { console.error('V2 requiere Node.js >=22.12.0'); process.exit(1); }"
npm ci
npm run check
npm test
npm run build
