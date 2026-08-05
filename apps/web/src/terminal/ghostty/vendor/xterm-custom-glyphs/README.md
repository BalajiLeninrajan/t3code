# xterm.js custom glyphs

Procedural drawings for the characters a terminal cannot leave to the font: box
drawing, block elements, powerline separators, braille, sextants and octants.
Vendored rather than installed because `@xterm/addon-webgl` publishes a bundle,
and depending on the addon would pull in the whole xterm.js renderer for three
files that only need a `CanvasRenderingContext2D`.

- Upstream: <https://github.com/xtermjs/xterm.js>, `addons/addon-webgl/src/customGlyphs/`
- Commit: `904ae935269eef5ec6a1415b64463c3d02eff1eb`
- Licence: MIT, see `LICENSE`

## Local modifications

`CustomGlyphRasterizer.ts` imports `throwIfFalsy` and `ILogService` from
`./deps` instead of from elsewhere in the xterm.js tree. `deps.ts` is ours.
Nothing else is changed, so upstream fixes can be pulled in by re-copying the
files and reapplying that one import.

## Coverage

| Range           | Characters                                                       |
| --------------- | ---------------------------------------------------------------- |
| `2500`–`257F`   | box drawing, including dashes, arcs, diagonals and mixed weights |
| `2580`–`259F`   | block elements and shades                                        |
| `2800`–`28FF`   | braille patterns                                                 |
| `E0A0`–`E0D4`   | powerline symbols and Powerline Extra                            |
| `EE00`–`EE0B`   | progress indicators                                              |
| `F5D0`–`F60D`   | git branch symbols                                               |
| `1FB00`–`1FB3B` | symbols for legacy computing                                     |
