# src/plugins — Plugin Development Guide

Plugins are extensions of tiles. They appear in the **Plugins** tab of the right sidebar and can be dragged onto the canvas. When dropped, a plugin creates a regular tile of its configured type — the canvas stores it as a plain tile with no reference back to the plugin.

## How plugins differ from tiles

Tiles define a UI component (`tile.html`, `tile.js`). Plugins are pure metadata: they reference an existing tile type and optionally pre-configure it (e.g. run an initial command in a terminal). There are no `plugin.html` or `plugin.js` files.

## Folder naming

Same rule as tiles: the folder name must match `/^[a-z][a-z0-9-]*$/` (lowercase, digits, hyphens; starts with a letter).

## Mandatory files

Every plugin folder must contain:

- `plugin.json` — metadata

## plugin.json schema

```json
{
  "label": "Human-readable name shown in sidebar",
  "description": "Short description shown below the label",
  "icon": "<svg .../>",
  "tileType": "terminal",
  "initCmd": "claude --plan\n"
}
```

- `label` — required string
- `description` — required string
- `icon` — required raw SVG string (no emojis). Use `stroke="currentColor"` so the icon inherits sidebar color.
- `tileType` — required. Must name an existing tile (e.g. `"terminal"`). The dropped canvas leaf uses this tile type.
- `initCmd` — optional string. If set, it is sent as input to the tile immediately after its shell spawns (500 ms delay). Intended for tiles that accept terminal input (e.g. the `terminal` tile). Include a trailing `\n` to submit the command.

## Loading locations

Plugins are loaded from two directories at server startup:

- `src/plugins/` — built-in plugins (shipped with the app)
- `~/.maestro-deck/resources/plugins/` — user-installed plugins

User plugins override built-in plugins of the same name.

## Drop behaviour

When a plugin is dragged onto the canvas:

1. A new tile leaf is created with `tileType` set to the plugin's `tileType`.
2. If `initCmd` is set, it is written to the tile's content store before mount so the tile can read and execute it on first load.
3. The leaf is persisted in the workspace layout as a regular tile — the plugin name is not stored.

## Reference: claude-plan plugin

The simplest possible plugin — opens a terminal and runs `claude --plan`. See `src/plugins/claude-plan/plugin.json`.
