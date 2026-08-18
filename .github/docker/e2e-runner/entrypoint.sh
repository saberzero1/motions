#!/usr/bin/env bash
set -euo pipefail

git config --global --add safe.directory '*'

DISPLAY="${DISPLAY:-:99}"
export DISPLAY

Xvfb "$DISPLAY" -screen 0 1280x1024x24 +extension GLX -noreset &

for _ in $(seq 1 30); do
    xdpyinfo -display "$DISPLAY" >/dev/null 2>&1 && break
    sleep 0.2
done

if ! xdpyinfo -display "$DISPLAY" >/dev/null 2>&1; then
    echo "Xvfb failed to start on $DISPLAY" >&2
    exit 1
fi

herbstluftwm &

for _ in $(seq 1 30); do
    herbstclient list_monitors >/dev/null 2>&1 && break
    sleep 0.2
done

if ! herbstclient list_monitors >/dev/null 2>&1; then
    echo "herbstluftwm failed to start" >&2
    exit 1
fi

exec "$@"
