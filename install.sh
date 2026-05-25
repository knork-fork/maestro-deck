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
if [[ "$(uname)" == "Darwin" ]]; then
  ELECTRON_BIN="$ELECTRON_DIR/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
else
  ELECTRON_BIN="$ELECTRON_DIR/node_modules/electron/dist/electron"
fi
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

# 6. Desktop entry (Linux only)
# macOS has no equivalent: integrating with Launchpad/Dock requires a real .app
# bundle (CFBundleName, .icns icon, Info.plist) built via electron-builder or
# electron-forge. Until that's done, macOS users launch via the CLI and see
# "Electron" + default icon in the Dock.
if [[ "$(uname)" != "Darwin" ]]; then
  APPS_DIR="$HOME/.local/share/applications"
  mkdir -p "$APPS_DIR"
  # GNOME/KDE launch .desktop entries with a minimal PATH that may not contain
  # node (nvm, fnm, asdf, etc.). Bake the absolute node path into Exec so the
  # launcher works regardless of inherited PATH.
  NODE_BIN="$(command -v node)"
  cat > "$APPS_DIR/maestro-deck.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=MaestroDeck
Comment=Flexible tiled workspace for terminals, tools, dashboards, and workflows
Exec=$NODE_BIN $INSTALL_DIR/bin/maestro-deck.js
Icon=$INSTALL_DIR/icons/icon_full.png
Terminal=false
Categories=Development;Utility;
StartupWMClass=MaestroDeck
EOF
  if command -v update-desktop-database &>/dev/null; then
    update-desktop-database "$APPS_DIR" &>/dev/null || true
  fi
fi

# 7. PATH setup
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  if [[ "$SHELL" == */zsh ]]; then
    RCFILE="$HOME/.zshrc"
  else
    RCFILE="$HOME/.bashrc"
  fi
  EXPORT_LINE="export PATH=\"\$HOME/.local/bin:\$PATH\""
  if ! grep -qF "$BIN_DIR" "$RCFILE" 2>/dev/null; then
    echo "" >> "$RCFILE"
    echo "# maestro-deck" >> "$RCFILE"
    echo "$EXPORT_LINE" >> "$RCFILE"
    echo ""
    echo "Added $BIN_DIR to PATH in $RCFILE."
  fi
  echo "Run the following to use maestro-deck in this session:"
  echo "  source $RCFILE"
else
  echo ""
  echo "Done. Run 'maestro-deck' to get started."
fi
