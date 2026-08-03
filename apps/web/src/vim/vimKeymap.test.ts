import { describe, expect, it } from "vite-plus/test";

import {
  resolveVimSequence,
  vimCheatSheet,
  vimContinuations,
  vimKeyFromEvent,
  VIM_KEYMAP,
  VIM_LEADER,
  VIM_SECTIONS,
} from "./vimKeymap";

function keyEvent(overrides: Partial<Parameters<typeof vimKeyFromEvent>[0]> & { key: string }) {
  return {
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...overrides,
  };
}

describe("VIM_KEYMAP", () => {
  it("has no sequence that is a prefix of another", () => {
    const sequences = VIM_KEYMAP.map((entry) => entry.keys.join(" "));
    for (const sequence of sequences) {
      const shadowed = sequences.filter(
        (other) => other !== sequence && other.startsWith(`${sequence} `),
      );
      expect(shadowed, `${sequence} shadows ${shadowed.join(", ")}`).toEqual([]);
    }
  });
});

describe("resolveVimSequence", () => {
  it("resolves a single-key binding immediately", () => {
    const resolution = resolveVimSequence([], "j");
    expect(resolution).toMatchObject({
      kind: "action",
      action: { kind: "motion", motion: "down" },
    });
  });

  it("holds a prefix pending until the sequence completes", () => {
    const first = resolveVimSequence([], "g");
    expect(first).toEqual({ kind: "pending", keys: ["g"] });

    const second = resolveVimSequence(["g"], "g");
    expect(second).toMatchObject({ kind: "action", action: { kind: "motion", motion: "top" } });
  });

  it("distinguishes case, so G is not gg", () => {
    expect(resolveVimSequence([], "G")).toMatchObject({
      kind: "action",
      action: { kind: "motion", motion: "bottom" },
    });
  });

  it("walks a three-key leader sequence", () => {
    expect(resolveVimSequence([], VIM_LEADER)).toEqual({ kind: "pending", keys: [VIM_LEADER] });
    expect(resolveVimSequence([VIM_LEADER], "f")).toEqual({
      kind: "pending",
      keys: [VIM_LEADER, "f"],
    });
    expect(resolveVimSequence([VIM_LEADER, "f"], "f")).toMatchObject({
      kind: "action",
      action: { kind: "command", command: "filePicker.toggle" },
    });
  });

  it("reports no match when the sequence cannot complete", () => {
    expect(resolveVimSequence([VIM_LEADER, "f"], "z")).toEqual({ kind: "none" });
    expect(resolveVimSequence([], "z")).toEqual({ kind: "none" });
  });
});

describe("vimContinuations", () => {
  it("lists the next keys under a prefix and labels groups", () => {
    const continuations = vimContinuations([VIM_LEADER]);
    const byKey = new Map(continuations.map((entry) => [entry.key, entry]));

    expect(byKey.get("e")).toEqual({ key: "e", desc: "Explorer", isGroup: false });
    expect(byKey.get("?")).toEqual({ key: "?", desc: "Keymap help", isGroup: false });
    expect(byKey.get("f")).toEqual({ key: "f", desc: "file/find", isGroup: true });
    expect(byKey.get("g")).toEqual({ key: "g", desc: "git", isGroup: true });
    expect(byKey.get("m")).toEqual({ key: "m", desc: "model", isGroup: true });
    expect(byKey.get("w")).toEqual({ key: "w", desc: "window", isGroup: true });
  });

  it("names every leader group rather than falling back to +key", () => {
    for (const group of vimContinuations([VIM_LEADER])) {
      if (!group.isGroup) continue;
      expect(group.desc, `${group.key} has no group label`).not.toMatch(/^\+/);
    }
  });

  it("is empty with nothing pending", () => {
    expect(vimContinuations([])).toEqual([]);
  });
});

describe("leader mnemonics", () => {
  it("puts model, reasoning, access, and plan mode under <leader>m", () => {
    expect(resolveVimSequence([VIM_LEADER, "m"], "m")).toMatchObject({
      kind: "action",
      action: { kind: "command", command: "modelPicker.toggle" },
    });
    expect(resolveVimSequence([VIM_LEADER, "m"], "r")).toMatchObject({
      kind: "action",
      action: { kind: "control", control: "reasoning" },
    });
    expect(resolveVimSequence([VIM_LEADER, "m"], "a")).toMatchObject({
      kind: "action",
      action: { kind: "control", control: "access" },
    });
    expect(resolveVimSequence([VIM_LEADER, "m"], "p")).toMatchObject({
      kind: "action",
      action: { kind: "control", control: "planMode" },
    });
  });

  it("exposes the everyday actions the command palette otherwise hides", () => {
    expect(resolveVimSequence([VIM_LEADER, "g"], "c")).toMatchObject({
      kind: "action",
      action: { kind: "control", control: "gitQuickAction" },
    });
    expect(resolveVimSequence([VIM_LEADER], "o")).toMatchObject({
      kind: "action",
      action: { kind: "command", command: "editor.openFavorite" },
    });
    expect(resolveVimSequence([VIM_LEADER, "c"], "s")).toMatchObject({
      kind: "action",
      action: { kind: "command", command: "composer.stash" },
    });
    expect(resolveVimSequence([VIM_LEADER, "f"], "N")).toMatchObject({
      kind: "action",
      action: { kind: "command", command: "chat.newLocal" },
    });
  });

  it("opens the keymap sheet on <leader>?", () => {
    expect(resolveVimSequence([VIM_LEADER], "?")).toMatchObject({
      kind: "action",
      action: { kind: "help" },
    });
  });
});

describe("vimCheatSheet", () => {
  it("groups by section in display order", () => {
    const sections = vimCheatSheet().map(([section]) => section);
    expect(sections).toEqual(VIM_SECTIONS.filter((section) => sections.includes(section)));
    expect(sections).toContain("Leader");
  });

  it("collapses aliases for one action onto a single row", () => {
    const threads = vimCheatSheet().find(([section]) => section === "Threads")?.[1] ?? [];
    const prevThread = threads.find((row) => row.desc === "Prev thread");
    expect(prevThread?.keys).toBe("H  [b");
  });

  it("covers every binding", () => {
    const rowCount = vimCheatSheet().reduce((total, [, rows]) => total + rows.length, 0);
    expect(rowCount).toBeGreaterThan(0);
    expect(rowCount).toBeLessThanOrEqual(VIM_KEYMAP.length);
  });
});

describe("vimKeyFromEvent", () => {
  it("passes through printable keys with their case", () => {
    expect(vimKeyFromEvent(keyEvent({ key: "j" }))).toBe("j");
    expect(vimKeyFromEvent(keyEvent({ key: "H" }))).toBe("H");
  });

  it("names the leader, escape and enter", () => {
    expect(vimKeyFromEvent(keyEvent({ key: " " }))).toBe(VIM_LEADER);
    expect(vimKeyFromEvent(keyEvent({ key: "Escape" }))).toBe("<Esc>");
    expect(vimKeyFromEvent(keyEvent({ key: "Enter" }))).toBe("<CR>");
  });

  it("treats ⌃[ as Escape, the way every vim does", () => {
    expect(vimKeyFromEvent(keyEvent({ key: "[", ctrlKey: true }))).toBe("<Esc>");
  });

  it("writes control chords in vim notation, normalizing case", () => {
    expect(vimKeyFromEvent(keyEvent({ key: "d", ctrlKey: true }))).toBe("<C-d>");
    expect(vimKeyFromEvent(keyEvent({ key: "D", ctrlKey: true }))).toBe("<C-d>");
    expect(vimKeyFromEvent(keyEvent({ key: "/", ctrlKey: true }))).toBe("<C-/>");
  });

  it("leaves cmd and alt chords to the configured keybinding layer", () => {
    expect(vimKeyFromEvent(keyEvent({ key: "k", metaKey: true }))).toBeNull();
    expect(vimKeyFromEvent(keyEvent({ key: "k", altKey: true }))).toBeNull();
  });

  it("ignores keys the keymap cannot express", () => {
    expect(vimKeyFromEvent(keyEvent({ key: "Tab" }))).toBeNull();
    expect(vimKeyFromEvent(keyEvent({ key: "ArrowDown" }))).toBeNull();
    expect(vimKeyFromEvent(keyEvent({ key: "Enter", ctrlKey: true }))).toBeNull();
  });
});
