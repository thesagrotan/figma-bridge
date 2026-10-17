#!/usr/bin/env bash
# install-service.sh — Install figma-bridge as a macOS background service (LaunchAgent)
# Run once: bash scripts/install-service.sh
# After install the server starts automatically at login, forever.

set -euo pipefail

LABEL="com.figma-bridge.bridge"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="$(command -v node)"
LOG_DIR="$HOME/Library/Logs/figma-bridge"

# Load env from .env if present
ENV_FILE="$PROJECT_DIR/.env"

echo "📦  figma-bridge LaunchAgent installer"
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

# Non-secret defaults only. Secrets (FIGMA_PERSONAL_ACCESS_TOKEN, FIGMA_BRIDGE_TOKEN)
# are NOT written into the plist: the server loads `.env` from its working
# directory via dotenv, so embedding them here would only leak them onto disk in
# a world-readable LaunchAgent file.
ENV_XML="        <key>PORT</key>
        <string>${PORT:-3000}</string>
        <key>NODE_ENV</key>
        <string>development</string>
"

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

# The plist contains no secrets, but keep it owner-only anyway.
chmod 600 "$PLIST_PATH" 2>/dev/null || true
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
  echo "   Check logs: tail -f ~/Library/Logs/figma-bridge/stderr.log"
fi

echo ""
echo "Done! The bridge server will now:"
echo "  • Start automatically at macOS login"
echo "  • Restart automatically if it crashes"
echo "  • Log to ~/Library/Logs/figma-bridge/"
echo ""
echo "Other commands:"
echo "  Stop service  : launchctl unload ~/Library/LaunchAgents/${LABEL}.plist"
echo "  Start service : launchctl load -w ~/Library/LaunchAgents/${LABEL}.plist"
echo "  View logs     : tail -f ~/Library/Logs/figma-bridge/stderr.log"
echo "  Uninstall     : bash scripts/uninstall-service.sh"
