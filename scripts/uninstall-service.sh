#!/usr/bin/env bash
# uninstall-service.sh — Remove the figma-mcp LaunchAgent

set -euo pipefail

LABEL="com.figma-mcp.bridge"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"

echo "🗑️  Uninstalling figma-mcp service..."

launchctl unload "$PLIST_PATH" 2>/dev/null && echo "   ✓ Service stopped and unloaded" || echo "   (service was not loaded)"
rm -f "$PLIST_PATH" && echo "   ✓ Plist removed"

echo "Done. Run 'bash scripts/install-service.sh' to reinstall."
