# maestro-deck — dev notes

## Architecture

CLI entry: `bin/maestro-deck.js` (ESM, `"type": "module"`)
GUI: local HTTP server (`src/gui/server.js`) + Electron window (`src/gui/electron-main.cjs`)

## Electron quirks

### ELECTRON_RUN_AS_NODE
Claude Code and VS Code set `ELECTRON_RUN_AS_NODE=1` in the environment. This makes the Electron binary act as plain Node.js — `process.type` is `undefined`, `require('electron')` fails, no window opens. The CLI strips this env var before spawning Electron.

### Isolated install directory
Electron is installed in `~/.maestro-deck-electron/` rather than `~/.maestro-deck/node_modules/`. If the `electron` npm package lives anywhere in the ancestor directories of `electron-main.cjs`, Node's module resolver finds its shim (`index.js` returns `process.execPath`) before Electron's runtime can intercept `require('electron')`. Keeping it in a sibling directory avoids the shadow.

### CJS main process
`electron-main.cjs` uses `.cjs` extension (always CommonJS regardless of `"type": "module"`). This is required because `require('electron')` in the main process is intercepted by the Electron runtime — ESM static imports (`import { app } from 'electron'`) trigger a CJS pre-parse step that fails because Electron's built-in module isn't a standard CJS module.

### --no-sandbox
Linux systems often require `--no-sandbox` because the `chrome-sandbox` binary needs root-owned setuid permissions. The CLI passes `--no-sandbox` when spawning Electron.

## install.sh

- Runs `npm install --omit=dev` in the project dir (currently no production deps).
- Installs Electron once into `~/.maestro-deck-electron/` — skipped if binary already exists to avoid slow re-runs on update.
- Re-run install.sh after deleting `~/.maestro-deck-electron/` to upgrade Electron.

## dev.sh

- `--local`: symlinks `~/.maestro-deck` → repo, runs `npm install`, installs Electron if missing, symlinks binary.
- `--release`: removes dev setup and re-runs install.sh from the release repo.

## Testing the GUI directly

```bash
env -u ELECTRON_RUN_AS_NODE \
  ~/.maestro-deck-electron/node_modules/electron/dist/electron \
  --no-sandbox \
  src/gui
```
