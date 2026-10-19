#!/bin/bash
# Dock launcher: starts the About Time server when it is not running, then opens the page.
ROOT="$(cd "$(dirname "$0")/../Resources" && pwd)"   # server.py + web/ are bundled by make-app.sh
URL="http://localhost:47890"
DATA="$HOME/Library/Application Support/AboutTime"

running() { /usr/bin/curl -fs -o /dev/null "$URL/api/ping"; }

if ! running; then
  mkdir -p "$DATA"
  # A script app can start under Rosetta, and the Apple Silicon python3 shim then fails to load.
  ARCH=()
  [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = 1 ] && ARCH=(/usr/bin/arch -arm64)
  nohup "${ARCH[@]}" /usr/bin/python3 "$ROOT/server.py" >>"$DATA/server.log" 2>&1 &
  for _ in $(seq 1 50); do running && break; sleep 0.1; done
fi
open "$URL"
