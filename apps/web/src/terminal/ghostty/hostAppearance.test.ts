import { describe, expect, it } from "vite-plus/test";

import {
  terminalFontFromHost,
  terminalHostAppearanceKey,
  terminalShadersFromHost,
  terminalThemeFromHostColors,
} from "./hostAppearance";

const appearance = {
  colors: {
    background: "#1e1e2e",
    foreground: "#cdd6f4",
    cursor: "#f5e0dc",
    cursorText: "#1e1e2e",
    selectionBackground: "#585b70",
    palette: ["#45475a", "#f38ba8"],
  },
  fontFamilies: ["JetBrainsMono Nerd Font"],
  fontSize: 12,
  shaders: [
    { path: "/shaders/cursor_warp.glsl", source: "void mainImage(out vec4 c, in vec2 p){}" },
  ],
  shaderAnimation: "true",
} as const;

describe("terminalThemeFromHostColors", () => {
  it("translates the host palette into Ghostty's color triples", () => {
    expect(terminalThemeFromHostColors(appearance.colors)).toEqual({
      background: { r: 30, g: 30, b: 46 },
      foreground: { r: 205, g: 214, b: 244 },
      cursor: { r: 245, g: 224, b: 220 },
      cursorText: "#1e1e2e",
      selectionBackground: "#585b70",
      palette: [
        { r: 69, g: 71, b: 90 },
        { r: 243, g: 139, b: 168 },
      ],
    });
  });

  it("falls back to the foreground when the host sets no cursor color", () => {
    const theme = terminalThemeFromHostColors({
      background: "#000000",
      foreground: "#ffffff",
      palette: [],
    });

    expect(theme?.cursor).toEqual({ r: 255, g: 255, b: 255 });
    expect(theme?.palette).toBeUndefined();
  });
});

describe("terminalFontFromHost", () => {
  it("quotes family names that are not bare CSS identifiers", () => {
    expect(terminalFontFromHost(appearance)).toEqual({
      family: '"JetBrainsMono Nerd Font"',
      size: 12,
    });
  });

  it("keeps the built-in font when the host config names none", () => {
    expect(terminalFontFromHost(undefined)).toEqual({});
  });
});

describe("terminalShadersFromHost", () => {
  it("defaults to Ghostty's focused-only animation when no host config exists", () => {
    expect(terminalShadersFromHost(undefined)).toEqual({ sources: [], animation: "true" });
  });

  it("passes the host shader chain through", () => {
    expect(terminalShadersFromHost(appearance).sources).toHaveLength(1);
  });
});

describe("terminalHostAppearanceKey", () => {
  it("changes when a shader file is edited without changing length", () => {
    const edited = {
      ...appearance,
      shaders: [
        { path: "/shaders/cursor_warp.glsl", source: "void mainImage(out vec4 d, in vec2 p){}" },
      ],
    };

    expect(terminalHostAppearanceKey(edited)).not.toBe(terminalHostAppearanceKey(appearance));
  });

  it("is null without a host config so the app theme stays in charge", () => {
    expect(terminalHostAppearanceKey(undefined)).toBeNull();
  });
});
