#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

VERSION="$1"

if [ -z "$VERSION" ]; then
  echo "Usage: bash bump_version.sh <version>"
  echo "Example: bash bump_version.sh v1.2.3"
  exit 1
fi

if ! echo "$VERSION" | grep -qE '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Error: version must match vMAJOR.MINOR.PATCH (e.g. v1.2.3)"
  exit 1
fi

BARE_VERSION="${VERSION#v}"
NOTES_FILE="$SCRIPT_DIR/release-notes/$BARE_VERSION.md"

# Validate new version is greater than current
CURRENT=$(cat "$SCRIPT_DIR/version.txt")
CURRENT_BARE="${CURRENT#v}"
version_gt() {
  IFS='.' read -r a1 a2 a3 <<< "$1"
  IFS='.' read -r b1 b2 b3 <<< "$2"
  for pair in "$a1:$b1" "$a2:$b2" "$a3:$b3"; do
    local x="${pair%%:*}" y="${pair##*:}"
    if (( x > y )); then return 0; fi
    if (( x < y )); then return 1; fi
  done
  return 1
}
if ! version_gt "$BARE_VERSION" "$CURRENT_BARE"; then
  echo "Error: $VERSION is not greater than current version $CURRENT"
  exit 1
fi

# Create release notes stub if it doesn't exist
mkdir -p "$SCRIPT_DIR/release-notes"
if [ ! -f "$NOTES_FILE" ]; then
  cat > "$NOTES_FILE" <<EOF
## What's new in $VERSION

<!-- Describe changes here. This file must be filled in before bumping. -->
EOF
  echo "Created $NOTES_FILE — fill it in and re-run."
  exit 1
fi

# Refuse to continue if notes are empty or template-only
CONTENT=$(grep -v '^\s*$' "$NOTES_FILE" | grep -v '^##' | grep -v '^<!--' || true)
if [ -z "$CONTENT" ]; then
  echo "Error: $NOTES_FILE is empty or contains only the template. Fill in release notes first."
  exit 1
fi

# Apply changes
echo "$VERSION" > "$SCRIPT_DIR/version.txt"
if [[ "$(uname)" == "Darwin" ]]; then
  sed -i '' "s|/maestro-deck/v[^/]*/install\.sh|/maestro-deck/$VERSION/install.sh|" "$SCRIPT_DIR/README.md"
else
  sed -i "s|/maestro-deck/v[^/]*/install\.sh|/maestro-deck/$VERSION/install.sh|" "$SCRIPT_DIR/README.md"
fi

# Commit and tag
git -C "$SCRIPT_DIR" add version.txt README.md "release-notes/$BARE_VERSION.md"
git -C "$SCRIPT_DIR" commit -m "Release $VERSION"
git -C "$SCRIPT_DIR" tag -a "$VERSION" -m "Release $VERSION"

echo ""
echo "Done. Push with:"
echo "  git push && git push origin $VERSION"
