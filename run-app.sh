#!/usr/bin/env bash
# AnyRun Multi-OS Standalone App Launcher (macOS / Linux)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 1. Check for standalone packaged binary
if [[ "$OSTYPE" == "darwin"* ]]; then
  APP_BIN="$SCRIPT_DIR/dist-desktop/AnyRun-darwin-x64/AnyRun.app/Contents/MacOS/AnyRun"
  ARM_BIN="$SCRIPT_DIR/dist-desktop/AnyRun-darwin-arm64/AnyRun.app/Contents/MacOS/AnyRun"
  if [[ -x "$ARM_BIN" ]]; then
    exec "$ARM_BIN" "$@"
  elif [[ -x "$APP_BIN" ]]; then
    exec "$APP_BIN" "$@"
  fi
elif [[ "$OSTYPE" == "linux"* ]]; then
  LINUX_BIN="$SCRIPT_DIR/dist-desktop/AnyRun-linux-x64/AnyRun"
  if [[ -x "$LINUX_BIN" ]]; then
    exec "$LINUX_BIN" "$@"
  fi
fi

# 2. Check for Node.js
if ! command -v node &> /dev/null; then
  echo "[ERROR] Node.js is required to launch AnyRun in development mode."
  echo "Please install Node.js from https://nodejs.org/"
  exit 1
fi

# 3. Launch via Electron
exec npx electron src/desktop/main.js "$@"
