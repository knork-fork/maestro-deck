# src/tiles — Tile Development Guide

Tiles are self-contained UI components that users place on the main canvas. Each tile lives in its own folder.

## Folder naming

The folder name is the tile's unique identifier. It must match `/^[a-z][a-z0-9-]*$/` (lowercase, digits, hyphens; starts with a letter). Example: `my-tile-123`.

## Mandatory files

Every tile folder must contain:

- `tile.json` — metadata
- `tile.html` — HTML fragment (the tile body)

## tile.json schema

```json
{
  "label": "Human-readable name shown in sidebar",
  "description": "Short description shown below the label",
  "icon": "<svg .../>",
  "extends": "other-tile-name"
}
```

- `label` — required string
- `description` — required string
- `icon` — required raw SVG string (no emojis). Use `stroke="currentColor"` so the icon inherits sidebar color.
- `extends` — optional. Must reference an existing tile name. The child tile's files take full precedence over the parent (no automatic merging). The `extends` key is validated but inheritance merging is deferred — implement it manually in `tile.js` if needed.

## tile.html

An HTML fragment — **not a full document**. Do not include `<html>`, `<head>`, or `<body>` tags.

May include `<style>` tags. Scope your styles to your tile's wrapper class to avoid bleeding into other tiles or the app shell.

```html
<style>
  .my-tile-wrap { width: 100%; height: 100%; }
</style>
<div class="my-tile-wrap">
  <!-- tile content -->
</div>
```

## tile.js (optional)

An ES module. Export a single `mount` function:

```js
export async function mount(container, api) {
  // container — the .tile-content HTMLElement
  // Set up your tile here.

  const saved = await api.getContent();
  // saved is any previously persisted JSON value, or null on first use.

  // Persist state:
  api.saveContent(myData);  // debounced 1 second; accepts any JSON-serializable value

  // Return an optional cleanup function (called when tile is closed):
  return () => { /* teardown timers, listeners, etc. */ };
}
```

`api` methods:
- `api.getContent()` — `Promise<any|null>`. Returns saved content or null.
- `api.saveContent(data)` — Debounced 1s write. Accepts any JSON-serializable value.

## What the framework handles

Do **not** reimplement these in your tile:

- Tile outline / focus / notification colors
- Drag (titlebar), resize (8-directional handles), min size enforcement
- Titlebar and close (X) button
- Persistence scheduling and layout save
- Sidebar drag-and-drop

Only tile-specific code belongs in the tile folder.

## Multiple instances

`mount()` is called once per tile instance. Each instance gets its own `container` element and its own `api` object bound to a unique ID, so state is fully independent between instances of the same tile type.

## Layout: i3-style tiling

Tiles render inside a binary-tree tiling layout (BSP, like i3/bspwm). Your tile fills its allocated rectangle entirely — no fixed widths, no min-content sizing. The rectangle can be any aspect ratio and reflows when the user adds/removes/resizes neighbors, opens/closes the sidebar, or resizes the window. Make your tile.html use `width: 100%; height: 100%` containers and avoid hard-coded dimensions.

## Content storage

Content is stored per-instance in `~/.maestro-deck/resources/projects/<hash>/tile-<id>.json` as `{ "content": <your data> }`. The `hash` is derived from the workspace path, so content is tied to a specific workspace.

## Reference: Notepad tile

The simplest possible tile — a plain text textarea. See `src/tiles/notepad/` for the full implementation. Key points:
- `tile.html`: scoped styles + a single `<textarea>` in a flex wrapper
- `tile.js`: restores saved string on mount, saves on `input`
- No cleanup needed (no external resources)
