import { assert, describe, it } from "@effect/vitest";

import { parseGhosttyShowConfig } from "./GhosttyAppearance.ts";

// Trimmed from real `ghostty +show-config` output, which prints every resolved
// key including the ones a theme supplied.
const SHOW_CONFIG = `font-family = JetBrainsMono Nerd Font
font-family-bold = JetBrainsMono Nerd Font
font-size = 12
theme = Catppuccin Mocha
background = #1e1e2e
foreground = #cdd6f4
selection-background = #585b70
palette = 0=#45475a
palette = 1=#f38ba8
palette = 2=#a6e3a1
cursor-color = #f5e0dc
cursor-text = #1e1e2e
window-padding-y = 10,0
keybind = shift+enter=text:\\x1b\\r
custom-shader = /home/user/.config/ghostty/shaders/cursor_warp.glsl
`;

describe("parseGhosttyShowConfig", () => {
  it("reads the font, colors, and palette a web terminal can honor", () => {
    const parsed = parseGhosttyShowConfig(SHOW_CONFIG);

    assert.deepStrictEqual(parsed.fontFamilies, ["JetBrainsMono Nerd Font"]);
    assert.strictEqual(parsed.fontSize, 12);
    assert.deepStrictEqual(parsed.colors, {
      background: "#1e1e2e",
      foreground: "#cdd6f4",
      cursor: "#f5e0dc",
      cursorText: "#1e1e2e",
      selectionBackground: "#585b70",
      palette: ["#45475a", "#f38ba8", "#a6e3a1"],
    });
  });

  it("keeps the app theme when the config cannot supply a full color pair", () => {
    const parsed = parseGhosttyShowConfig("font-size = 14\nbackground = #1e1e2e\n");

    assert.strictEqual(parsed.colors, undefined);
    assert.strictEqual(parsed.fontSize, 14);
  });

  it("truncates the palette at the first missing index so colors never shift", () => {
    const parsed = parseGhosttyShowConfig(
      [
        "background = #000000",
        "foreground = #ffffff",
        "palette = 0=#111111",
        "palette = 2=#333333",
      ].join("\n"),
    );

    assert.deepStrictEqual(parsed.colors?.palette, ["#111111"]);
  });

  it("ignores values it cannot use rather than reporting a broken appearance", () => {
    const parsed = parseGhosttyShowConfig(
      ["# a comment", "background = not-a-color", "foreground = #ffffff", "font-size = huge"].join(
        "\n",
      ),
    );

    assert.strictEqual(parsed.colors, undefined);
    assert.strictEqual(parsed.fontSize, undefined);
  });
});
