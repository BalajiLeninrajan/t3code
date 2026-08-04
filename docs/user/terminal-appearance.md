# Terminal appearance

If [Ghostty](https://ghostty.org) is installed on the machine running the server, in-app terminals
adopt its configuration automatically. Nothing to enable: T3 Code reads the same config Ghostty
itself would, so your terminal in the app looks like your terminal outside it.

What carries over:

- **Colors** — `background`, `foreground`, `cursor-color`, `cursor-text`, `selection-background`,
  and the indexed `palette`, including everything a `theme` supplies.
- **Font** — `font-family` (falling back through the list you configured) and `font-size`.
- **Custom shaders** — each `custom-shader` runs as a post-process over the terminal, with the same
  cursor uniforms Ghostty provides, so cursor-trail shaders work. `custom-shader-animation` is
  honored: `true` animates only while the terminal is focused, `always` animates whenever it is on
  screen, and `false` renders a single frame per update. Shaders never animate when your system asks
  for reduced motion.

Everything else in the config — keybindings, padding, window options, shell integration — belongs to
the Ghostty application and is ignored.

## When it does not apply

- Ghostty is not installed on the server machine, or its CLI is not on the `PATH` and not in the
  standard install location. The terminal keeps the app's own light/dark theme.
- A shader fails to compile in the browser's WebGL. The terminal renders normally and the browser
  console names the shader file.
- Ghostty on the server machine is what counts, not on the device you are looking at. Connecting
  from a phone or another laptop shows the appearance of the machine running the server.

## Picking up changes

Edit your Ghostty config, then reload the client. The new appearance applies to open terminals
without restarting the server or losing your shell — the server re-reads the config when a client
asks for its configuration, at most once every 30 seconds.
