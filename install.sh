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
if ! command -v git &>/dev/null; then
  echo "Error: git is required."
  if [[ "$(uname)" == "Darwin" ]]; then
    echo "  Install via Homebrew: brew install git"
    echo "  Or install Xcode Command Line Tools: xcode-select --install"
  fi
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

# 3. Install dependencies
cd "$INSTALL_DIR"
npm install --omit=dev

# 4. Symlink binary
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
