#!/usr/bin/env bash
set -e

INSTALL_DIR="$HOME/.maestro-deck"
BIN_DIR="$HOME/.local/bin"
REPO_URL="https://github.com/knork-fork/maestro-deck"

# 1. Check dependencies
if ! command -v node &>/dev/null; then
  echo "Error: Node.js is required."
  if [[ "$(uname)" == "Darwin" ]]; then
    echo "  Install via Homebrew: brew install node"
    echo "  Or download from https://nodejs.org"
  else
    echo "  Install from https://nodejs.org"
  fi
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Error: Node.js 18 or newer is required (found $(node -v))."
  exit 1
fi
if ! command -v git &>/dev/null; then
  echo "Error: git is required."
  if [[ "$(uname)" == "Darwin" ]]; then
    echo "  Install via Homebrew: brew install git"
    echo "  Or install Xcode Command Line Tools: xcode-select --install"
  fi
  exit 1
fi
if ! command -v npx &>/dev/null; then
  echo "Error: npx is required (ships with npm)."
  echo "  Most Node.js installs include it. On distros that split node/npm, install npm separately."
  echo "  Debian/Ubuntu: sudo apt install npm"
  echo "  Fedora:        sudo dnf install npm"
  exit 1
fi

# 2. Clone or update
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "Updating maestro-deck..."
  git -C "$INSTALL_DIR" pull
else
  echo "Installing maestro-deck..."
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

# 3. Install app dependencies
cd "$INSTALL_DIR"
npm install --omit=dev

# 4. Install Electron in an isolated directory so it doesn't shadow its own runtime module
ELECTRON_DIR="$HOME/.maestro-deck-electron"
ELECTRON_BIN="$ELECTRON_DIR/node_modules/electron/dist/electron"
if [ ! -f "$ELECTRON_BIN" ]; then
  echo "Installing Electron..."
  mkdir -p "$ELECTRON_DIR"
  if [ ! -f "$ELECTRON_DIR/package.json" ]; then
    echo '{"name":"maestro-deck-electron","private":true}' > "$ELECTRON_DIR/package.json"
  fi
  cd "$ELECTRON_DIR"
  npm install electron@^35.0.0 --save
  cd "$INSTALL_DIR"
else
  echo "Electron already installed, skipping."
fi

# 4b. Rebuild native modules (node-pty) against the isolated Electron's ABI
ELECTRON_VERSION="$(node -p "require('$ELECTRON_DIR/node_modules/electron/package.json').version")"
echo "Rebuilding native modules for Electron $ELECTRON_VERSION..."
cd "$INSTALL_DIR"
npx --yes @electron/rebuild@^3.6.0 -v "$ELECTRON_VERSION" -f -w node-pty

# 4c. Stage vendored xterm.js assets for the terminal tile
VENDOR_DIR="$INSTALL_DIR/src/tiles/terminal/vendor"
mkdir -p "$VENDOR_DIR"
cp -f "$INSTALL_DIR/node_modules/@xterm/xterm/lib/xterm.js"      "$VENDOR_DIR/xterm.js"
cp -f "$INSTALL_DIR/node_modules/@xterm/xterm/css/xterm.css"     "$VENDOR_DIR/xterm.css"
cp -f "$INSTALL_DIR/node_modules/@xterm/addon-fit/lib/addon-fit.js" "$VENDOR_DIR/xterm-addon-fit.js"

# 5. Symlink binary
mkdir -p "$BIN_DIR"
chmod +x "$INSTALL_DIR/bin/maestro-deck.js"
ln -sf "$INSTALL_DIR/bin/maestro-deck.js" "$BIN_DIR/maestro-deck"

# 5. PATH guidance
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  echo ""
  echo "Add $BIN_DIR to your PATH. For example:"
  if [[ "$SHELL" == */zsh ]]; then
    RCFILE="~/.zshrc"
  else
    RCFILE="~/.bashrc"
  fi
  echo "  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> $RCFILE && source $RCFILE"
fi

echo ""
echo "Done. Run 'maestro-deck' to get started."
