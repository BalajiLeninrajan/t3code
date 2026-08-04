import { describe, expect, it } from "vite-plus/test";

import { ghosttyConsumedMods, ghosttyKeyForCode, ghosttyUnshiftedCodepoint } from "./keyCodes";

describe("ghosttyKeyForCode", () => {
  it("keeps the tail of the pinned Ghostty key enum in order", () => {
    expect(ghosttyKeyForCode("F25")).toBe(ghosttyKeyForCode("F24") + 1);
    expect(ghosttyKeyForCode("PrintScreen")).toBe(ghosttyKeyForCode("FnLock") + 1);
    expect(ghosttyKeyForCode("Pause")).toBe(ghosttyKeyForCode("ScrollLock") + 1);
    expect(ghosttyKeyForCode("Paste")).toBe(ghosttyKeyForCode("Cut") + 1);
  });
});

describe("ghosttyUnshiftedCodepoint", () => {
  it("provides the logical base character for Kitty keyboard encoding", () => {
    expect(ghosttyUnshiftedCodepoint({ code: "KeyC", key: "c", shiftKey: false })).toBe(
      "c".codePointAt(0),
    );
    expect(ghosttyUnshiftedCodepoint({ code: "KeyC", key: "C", shiftKey: true })).toBe(
      "c".codePointAt(0),
    );
    expect(ghosttyUnshiftedCodepoint({ code: "Digit1", key: "!", shiftKey: true })).toBe(
      "1".codePointAt(0),
    );
    expect(ghosttyUnshiftedCodepoint({ code: "Slash", key: "?", shiftKey: true })).toBe(
      "/".codePointAt(0),
    );
    expect(ghosttyUnshiftedCodepoint({ code: "Digit1", key: "&", shiftKey: false })).toBe(
      "&".codePointAt(0),
    );
    expect(ghosttyUnshiftedCodepoint({ code: "Enter", key: "Enter", shiftKey: false })).toBe(0);
  });

  it("reports unknown instead of the shifted character without layout data", () => {
    expect(ghosttyUnshiftedCodepoint({ code: "Digit7", key: "/", shiftKey: true })).toBe(0);
    expect(ghosttyUnshiftedCodepoint({ code: "KeyD", key: "Д", shiftKey: true })).toBe(
      "д".codePointAt(0),
    );
  });

  it("prefers the active browser layout over US physical key positions", () => {
    const layoutMap = new Map([
      ["Digit1", "&"],
      ["KeyC", "j"],
    ]);
    expect(ghosttyUnshiftedCodepoint({ code: "Digit1", key: "1", shiftKey: true }, layoutMap)).toBe(
      "&".codePointAt(0),
    );
    expect(ghosttyUnshiftedCodepoint({ code: "KeyC", key: "J", shiftKey: true }, layoutMap)).toBe(
      "j".codePointAt(0),
    );
  });
});

describe("ghosttyConsumedMods", () => {
  const SHIFT = 1;

  it("reports shift as spent when it produced a different character", () => {
    // The reported bug: `>` reached nvim as `<S-.>` because shift was still
    // advertised as active after the layout had already used it.
    expect(ghosttyConsumedMods({ code: "Period", key: ">", shiftKey: true })).toBe(SHIFT);
    expect(ghosttyConsumedMods({ code: "Semicolon", key: ":", shiftKey: true })).toBe(SHIFT);
    expect(ghosttyConsumedMods({ code: "Digit1", key: "!", shiftKey: true })).toBe(SHIFT);
    expect(ghosttyConsumedMods({ code: "KeyC", key: "C", shiftKey: true })).toBe(SHIFT);
  });

  it("reports nothing spent without shift", () => {
    expect(ghosttyConsumedMods({ code: "Period", key: ".", shiftKey: false })).toBe(0);
    expect(ghosttyConsumedMods({ code: "KeyC", key: "c", shiftKey: false })).toBe(0);
  });

  it("leaves shift active when it did not change the character", () => {
    // Shift+Enter still means shift+Enter: nothing was consumed producing it,
    // so the modifier must survive into the encoding.
    expect(ghosttyConsumedMods({ code: "Enter", key: "Enter", shiftKey: true })).toBe(0);
    expect(ghosttyConsumedMods({ code: "Tab", key: "Tab", shiftKey: true })).toBe(0);
    expect(ghosttyConsumedMods({ code: "ArrowUp", key: "ArrowUp", shiftKey: true })).toBe(0);
  });

  it("prefers layout data over the built-in shifted-character table", () => {
    const layout = new Map([["Period", "."]]);
    expect(ghosttyConsumedMods({ code: "Period", key: ">", shiftKey: true }, layout)).toBe(SHIFT);
  });
});
