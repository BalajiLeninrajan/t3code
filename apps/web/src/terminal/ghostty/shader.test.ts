import { describe, expect, it } from "vite-plus/test";

import {
  composeGhosttyShaderSource,
  ghosttyShaderCursorRect,
  hoistUniformInitializedGlobals,
  renameBuiltinOverloads,
} from "./shader";

describe("renameBuiltinOverloads", () => {
  it("renames a shader's own overload of a built-in and its calls", () => {
    const result = renameBuiltinOverloads(
      [
        "vec2 normalize(vec2 value, float isPosition) { return value * isPosition; }",
        "vec2 use(vec2 v) { return normalize(v, 1.0); }",
      ].join("\n"),
    );

    expect(result).toContain("vec2 t3GhosttyShadowed_normalize_2(vec2 value, float isPosition)");
    expect(result).toContain("t3GhosttyShadowed_normalize_2(v, 1.0)");
  });

  it("leaves genuine built-in calls of a different arity bound to the built-in", () => {
    const result = renameBuiltinOverloads(
      [
        "vec2 normalize(vec2 value, float isPosition) { return value * isPosition; }",
        "vec2 use(vec2 v) { return normalize(v) + normalize(v, 1.0); }",
      ].join("\n"),
    );

    expect(result).toContain("normalize(v) + t3GhosttyShadowed_normalize_2(v, 1.0)");
  });

  it("does not touch shaders that only call built-ins", () => {
    const source =
      "void mainImage(out vec4 c, in vec2 p) { c = vec4(mix(0.0, 1.0, step(p.x, 1.0))); }";

    expect(renameBuiltinOverloads(source)).toBe(source);
  });

  it("counts nested call arguments as one argument", () => {
    const result = renameBuiltinOverloads(
      ["float mod(float a) { return a; }", "float use() { return mod(min(1.0, 2.0)); }"].join("\n"),
    );

    expect(result).toContain("t3GhosttyShadowed_mod_1(min(1.0, 2.0))");
  });
});

describe("hoistUniformInitializedGlobals", () => {
  it("moves a uniform-initialized global into the entry point", () => {
    const result = hoistUniformInitializedGlobals(
      "// --- CONFIGURATION ---\nvec4 TRAIL_COLOR = iCurrentCursorColor;\nvoid mainImage(out vec4 c, in vec2 p) { c = TRAIL_COLOR; }\n",
    );

    expect(result.source).toContain("vec4 TRAIL_COLOR;");
    expect(result.source).not.toContain("TRAIL_COLOR = iCurrentCursorColor;");
    expect(result.prelude).toBe("TRAIL_COLOR = iCurrentCursorColor;");
  });

  it("leaves constant globals and function bodies alone", () => {
    const source = [
      "const float DURATION = 0.2;",
      "float ease(float x) { float t = iTime; return x * t; }",
      "void mainImage(out vec4 c, in vec2 p) { c = vec4(DURATION); }",
    ].join("\n");

    const result = hoistUniformInitializedGlobals(source);

    expect(result.source).toBe(source);
    expect(result.prelude).toBe("");
  });

  it("does not rewrite preprocessor lines", () => {
    const source = "#define TRAIL iCurrentCursorColor\nvec4 c = vec4(0.0);\n";

    expect(hoistUniformInitializedGlobals(source).source).toBe(source);
  });
});

describe("composeGhosttyShaderSource", () => {
  it("supplies Ghostty's uniforms and calls mainImage with the terminal frame", () => {
    const composed = composeGhosttyShaderSource(
      "void mainImage(out vec4 fragColor, in vec2 fragCoord) { fragColor = vec4(1.0); }",
    );

    expect(composed.startsWith("#version 300 es")).toBe(true);
    expect(composed).toContain("uniform vec4 iCurrentCursor;");
    expect(composed).toContain("uniform float iTimeCursorChange;");
    expect(composed).toContain("mainImage(color, gl_FragCoord.xy);");
  });
});

describe("ghosttyShaderCursorRect", () => {
  it("converts a CSS-pixel cursor box into bottom-up drawing-buffer pixels", () => {
    expect(
      ghosttyShaderCursorRect({
        left: 10,
        top: 20,
        width: 8,
        height: 16,
        canvasHeight: 200,
        scale: 2,
      }),
    ).toEqual({ x: 20, y: 160, width: 16, height: 32 });
  });
});
