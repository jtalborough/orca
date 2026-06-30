#!/usr/bin/env bash
#
# Build the Orca desktop app and run it locally on macOS.
#
# Defaults to the fast unpacked build (electron-builder --dir): it produces a
# runnable Orca.app without spending time on DMG/zip packaging, which is what
# you want while iterating. Pass --dmg for the full installable artifacts.
#
# Usage:
#   config/scripts/build-and-run-macos.sh            # build (unpacked) + launch
#   config/scripts/build-and-run-macos.sh --dmg      # full DMG/zip build + launch
#   config/scripts/build-and-run-macos.sh --install  # also copy into /Applications
#   config/scripts/build-and-run-macos.sh --no-run   # build only, don't launch
#   config/scripts/build-and-run-macos.sh --no-build # skip build, just run existing app
#
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "error: this script is macOS-only (uses /Applications and 'open')." >&2
  exit 1
fi

# Repo root is two levels up from config/scripts/.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

DO_BUILD=1
DO_RUN=1
DO_INSTALL=0
BUILD_DMG=0

for arg in "$@"; do
  case "$arg" in
    --dmg) BUILD_DMG=1 ;;
    --install) DO_INSTALL=1 ;;
    --no-run) DO_RUN=0 ;;
    --no-build) DO_BUILD=0 ;;
    -h|--help)
      sed -n '3,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "error: unknown argument '$arg' (try --help)" >&2
      exit 1
      ;;
  esac
done

if [[ "$DO_BUILD" == "1" ]]; then
  if [[ "$BUILD_DMG" == "1" ]]; then
    echo "==> Building Orca (full DMG/zip via build:mac)..."
    pnpm run build:mac
  else
    echo "==> Building Orca (fast unpacked via build:unpack)..."
    pnpm run build:unpack
  fi
fi

# electron-builder writes the unpacked app to dist/mac-<arch>/Orca.app for both
# --dir and --mac targets. Pick the newest match so the latest build wins.
APP_PATH="$(find dist -maxdepth 2 -name 'Orca.app' -type d -print0 2>/dev/null \
  | xargs -0 ls -dt 2>/dev/null | head -n1 || true)"

if [[ -z "$APP_PATH" ]]; then
  echo "error: could not find a built Orca.app under dist/." >&2
  echo "       Run a build first (drop --no-build)." >&2
  exit 1
fi

echo "==> Built app: $APP_PATH"

if [[ "$DO_INSTALL" == "1" ]]; then
  DEST="/Applications/Orca.app"
  echo "==> Installing to ${DEST}..."
  # Quit a running copy so the bundle isn't busy, then replace it.
  osascript -e 'tell application "Orca" to quit' >/dev/null 2>&1 || true
  rm -rf "$DEST"
  cp -R "$APP_PATH" "$DEST"
  APP_PATH="$DEST"
  echo "==> Installed: $DEST"
fi

if [[ "$DO_RUN" == "1" ]]; then
  echo "==> Launching $APP_PATH"
  # -n forces a fresh instance even if Orca is already open.
  open -n "$APP_PATH"
fi
