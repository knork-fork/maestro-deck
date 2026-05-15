#!/usr/bin/env bash
set -e

INSTALL_DIR="$HOME/.maestro-deck"
BIN_DIR="$HOME/.local/bin"
DEV_DIR="$(cd "$(dirname "$0")" && pwd)"

case "$1" in
  --local)
    echo "Switching to local dev..."

    # Remove existing install (symlink or directory)
    rm -rf "$INSTALL_DIR"

    # Symlink ~/.maestro-deck to this repo
    ln -s "$DEV_DIR" "$INSTALL_DIR"

    # Install all dependencies (including dev)
    cd "$DEV_DIR"
    npm install

    # Install Electron in isolated dir (skip if already present)
    ELECTRON_DIR="$HOME/.maestro-deck-electron"
    ELECTRON_BIN="$ELECTRON_DIR/node_modules/electron/dist/electron"
    if [ ! -f "$ELECTRON_BIN" ]; then
      echo "Installing Electron..."
      mkdir -p "$ELECTRON_DIR"
      [ -f "$ELECTRON_DIR/package.json" ] || echo '{"name":"maestro-deck-electron","private":true}' > "$ELECTRON_DIR/package.json"
      cd "$ELECTRON_DIR" && npm install electron@^35.0.0 --save && cd "$DEV_DIR"
    fi

    # Symlink binary
    mkdir -p "$BIN_DIR"
    chmod +x "$DEV_DIR/bin/maestro-deck.js"
    ln -sf "$DEV_DIR/bin/maestro-deck.js" "$BIN_DIR/maestro-deck"

    echo ""
    echo "Done. ~/.maestro-deck and maestro-deck binary now point to $DEV_DIR"
    ;;

  --release)
    echo "Switching to release..."

    rm -rf "$INSTALL_DIR"
    rm -f "$BIN_DIR/maestro-deck"

    bash "$DEV_DIR/install.sh"
    ;;

  *)
    echo "Usage: $0 [--local | --release]"
    echo ""
    echo "  --local    Symlink ~/.maestro-deck and maestro-deck binary to this dev folder"
    echo "  --release  Remove dev setup and reinstall from the release repo"
    exit 1
    ;;
esac
