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
- `tileType` — required (unless `layout` is set). Must name an existing tile (e.g. `"terminal"`). The dropped canvas leaf uses this tile type.
- `initCmd` — optional string. If set, it is sent as input to the tile immediately after its shell spawns (500 ms delay). Intended for tiles that accept terminal input (e.g. the `terminal` tile). Include a trailing `\n` to submit the command.
- `layout` — optional. If set, the drop creates a pre-arranged subtree of multiple tiles instead of a single tile. Mutually exclusive with `tileType`: provide one or the other. See below.

### Multi-tile plugins (`layout`)

A plugin can declare a pre-arranged BSP subtree that gets inserted at the drop site. The shape mirrors the canvas layout tree:

```json
{
  "label": "Claude Plan + Notepad",
  "description": "...",
  "icon": "<svg .../>",
  "layout": {
    "type": "split",
    "dir": "v",
    "ratio": 0.667,
    "a": { "type": "leaf", "tileType": "terminal", "initCmd": "claude --permission-mode plan\n" },
    "b": { "type": "leaf", "tileType": "notepad" }
  }
}
```

- A node is either a `leaf` (with `tileType` and optional `initCmd`) or a `split` (with `dir`, `ratio`, `a`, `b`).
- `dir`: `"v"` = top/bottom, `"h"` = left/right.
- `ratio`: number in `(0, 1)`, the fraction allocated to side `a`.
- Each leaf becomes a normal canvas tile with its own id after the drop — no link back to the plugin is stored. The user can then move, resize, close, or split them like any other tile.

## Loading locations

Plugins are loaded from two directories at server startup:

- `src/plugins/` — built-in plugins (shipped with the app)
- `~/.maestro-deck/resources/plugins/` — user-installed plugins

User plugins override built-in plugins of the same name.

## Drop behaviour

When a plugin is dragged onto the canvas:

1. A new tile leaf (or, for `layout` plugins, a subtree of leaves joined by splits) is created with the plugin's configured `tileType`(s).
2. For each leaf with an `initCmd`, the command is written to that tile's content store before mount so the tile can read and execute it on first load.
3. The leaf(es) are persisted in the workspace layout as regular tiles — the plugin name is not stored.

## Reference plugins

- `src/plugins/claude-plan/plugin.json` — single-tile plugin: opens a terminal and runs `claude --plan`.
- `src/plugins/claude-plan-notepad/plugin.json` — multi-tile plugin: drops a Claude planning-mode terminal (top, 2/3 height) and a notepad (bottom, 1/3 height) in a vertical split.
