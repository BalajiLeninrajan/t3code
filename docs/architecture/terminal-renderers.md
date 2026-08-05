# Terminal renderers

Terminal sessions remain server-owned PTYs. Clients receive the existing raw byte stream and send
input and resize events over the existing terminal contracts; renderer choices never cross the
wire.

## Ghostty alignment

Android and web use the official `libghostty-vt` C ABI for parsing, terminal state, grapheme
boundaries, keyboard encoding, selection, and scrollback:

- Android links the native shared library and converts render state into a compact JNI snapshot.
- Web loads a separately cached WebAssembly build and reads render state into a Canvas 2D surface.
- Both artifacts are built from the revision in
  `native/libghostty-vt/VERSION`.

The platform adapters deliberately own only platform behavior. Android owns its Kotlin Canvas and
touch integration. Web owns browser font shaping, the hidden IME textarea, clipboard and DOM input,
and its Canvas renderer. The web adapter also delegates application mouse encoding, word and line
selection, and OSC 8 hyperlink metadata to the official ABI. Browser conventions remain available:
holding Shift bypasses application mouse capture, and the platform link modifier opens hyperlinks.
React does not participate in terminal frames.

The web runtime is singleton-scoped per browser tab so split terminals share one compiled module
and memory. Each visible terminal owns and frees its own terminal, render state, row iterator, cell
iterator, key and mouse encoder, and input event handles. Restoring captured scrollback temporarily
detaches the PTY callback so historical device queries cannot emit replies into the current shell.

## Host appearance

When the server host has Ghostty installed, `ghostty +show-config` resolves that user's colors and
font — themes and includes already applied — and the result rides along on `ServerConfig` as
`terminalAppearance`. Web and desktop apply it: colors and the indexed palette go to Ghostty through
the terminal options, and the font list becomes the canvas font.

`custom-shader` is deliberately not honored. Reproducing Ghostty's Shadertoy post-process meant
compositing an opaque WebGL2 overlay over the Canvas 2D grid and rewriting desktop-GL sources into
GLSL ES, which was a persistent source of rendering artifacts for a purely decorative feature.

## Drawn glyphs

`libghostty-vt` gives us terminal state, not pixels: Ghostty's own renderer is Metal or OpenGL over
a CoreText atlas, and none of it crosses the C ABI. So the grid is ours to paint, and the characters
that have to tile — box drawing, block elements, braille, powerline separators, sextants and octants
— cannot come from a font. Their glyphs are cut for the line height their face assumes, so at any
other cell size a rule stops short of its neighbour and a separator leaves a seam against the
segment behind it. Every terminal that looks right draws these itself; we vendor xterm.js's
rasterizer to do it, under `apps/web/src/terminal/ghostty/vendor/xterm-custom-glyphs`, which has its
own README covering provenance and coverage.

It wants a canvas addressed in device pixels, so `renderer.ts` drops the ratio transform for the
call and scales the cell rect up to match. Anything it has no drawing for falls back to the font,
scaled down uniformly if it overflows its cell.

## Updating Ghostty

Update and rebuild Android first, because mobile's `VERSION` file is the single source of truth for
the upstream pin (the upstream `LICENSE` lives beside it). Then run:

```sh
pnpm --dir apps/web build:ghostty-wasm
```

Commit the regenerated web `wasm` artifacts. The build embeds the pinned revision into the binary as
semver build metadata, and the focused web ABI test reads it back through `ghostty_build_info` and
compares it against mobile's `VERSION` — so the web vendor directory holds only the artifacts, drift
cannot hide, and there is no second pin to keep in sync. The same test enforces the artifact budget
and exercises repeated create/write/free cycles with multi-codepoint graphemes.
