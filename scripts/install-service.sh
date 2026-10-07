#!/usr/bin/env bash
# install-service.sh — Install figma-mcp as a macOS background service (LaunchAgent)
# Run once: bash scripts/install-service.sh
# After install the server starts automatically at login, forever.

set -euo pipefail

LABEL="com.figma-mcp.bridge"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="$(command -v node)"
LOG_DIR="$HOME/Library/Logs/figma-mcp"

# Load env from .env if present
ENV_FILE="$PROJECT_DIR/.env"

echo "📦  figma-mcp LaunchAgent installer"
echo "    Project : $PROJECT_DIR"
echo "    Node    : $NODE_BIN ($(node --version))"
echo "    Plist   : $PLIST_PATH"
echo ""

# Build the project first
echo "🔨  Building..."
cd "$PROJECT_DIR"
npm run build --silent
echo "    ✓ dist/index.js ready"
echo ""

# Create log directory
mkdir -p "$LOG_DIR"

# Parse env vars from .env to inject into the plist EnvironmentVariables dict
ENV_XML=""
if [[ -f "$ENV_FILE" ]]; then
  while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" =~ ^# ]] && continue
    # Strip surrounding quotes from value
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
    ENV_XML+="        <key>${key}</key>
        <string>${value}</string>
"
  done < "$ENV_FILE"
fi

# Write the plist
cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>

    <key>ProgramArguments</key>
    <array>
        <string>${NODE_BIN}</string>
        <string>${PROJECT_DIR}/dist/index.js</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${PROJECT_DIR}</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
${ENV_XML}    </dict>

    <!-- Restart automatically if it crashes -->
    <key>KeepAlive</key>
    <true/>

    <!-- Start immediately when loaded -->
    <key>RunAtLoad</key>
    <true/>

    <!-- Throttle restart attempts (seconds) -->
    <key>ThrottleInterval</key>
    <integer>5</integer>

    <key>StandardOutPath</key>
    <string>${LOG_DIR}/stdout.log</string>

    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/stderr.log</string>
</dict>
</plist>
PLIST

echo "✅  Plist written to $PLIST_PATH"

# Unload first if already loaded (suppress errors)
launchctl unload "$PLIST_PATH" 2>/dev/null || true

# Load and start the service
launchctl load -w "$PLIST_PATH"
echo "🚀  Service loaded and started"
echo ""

# Give it a moment to come up
sleep 2

# Check it's running
if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
  echo "✅  Bridge is UP on http://localhost:3000"
else
  echo "⚠️  Bridge not responding yet on :3000 (may still be starting)"
  echo "   Check logs: tail -f ~/Library/Logs/figma-mcp/stderr.log"
fi

echo ""
echo "Done! The bridge server will now:"
echo "  • Start automatically at macOS login"
echo "  • Restart automatically if it crashes"
echo "  • Log to ~/Library/Logs/figma-mcp/"
echo ""
echo "Other commands:"
echo "  Stop service  : launchctl unload ~/Library/LaunchAgents/${LABEL}.plist"
echo "  Start service : launchctl load -w ~/Library/LaunchAgents/${LABEL}.plist"
echo "  View logs     : tail -f ~/Library/Logs/figma-mcp/stderr.log"
echo "  Uninstall     : bash scripts/uninstall-service.sh"
