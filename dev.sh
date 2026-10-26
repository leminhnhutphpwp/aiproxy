#!/bin/bash
# dev.sh — Local development setup for aiproxy
#
# Usage: ./dev.sh
# First run: create .env.local, start server on port 4097
# Subsequent runs: just start server
#
# Prerequisites:
#   - OpenCode running on port 4096 (or configure OPENCODE_URL)
#   - A .env file (copy .env.example) with your provider keys

set -euo pipefail

cd "$(dirname "$0")"

echo "=== [1/2] Create .env.local ==="
ENV_FILE=".env.local"
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" << 'ENVEOF'
# Local development — override .env settings
PORT=4097
HOSTNAME=0.0.0.0
NODE_ENV=development

# OpenCode connection (default: localhost:4096)
OPENCODE_URL=http://localhost:4096
OPENCODE_USERNAME=
OPENCODE_PASSWORD=
ENVEOF
  echo "Created $ENV_FILE — edit OPENCODE_USERNAME/OPENCODE_PASSWORD with your OpenCode credentials"
else
  echo "$ENV_FILE already exists, skipping"
fi

echo "=== [2/2] Start server ==="
echo "Server will listen on http://localhost:4097"
echo "Health check: curl http://localhost:4097/v1/models/status"
echo ""

exec node server.js
