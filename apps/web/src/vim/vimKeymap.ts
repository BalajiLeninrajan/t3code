/**
 * The vim keymap: pure key-sequence resolution, no DOM and no app state.
 *
 * Notation follows vim/LazyVim so the table reads like an `init.lua`: bare
 * characters are themselves and case-sensitive (`j` vs `J`), control chords
 * are `<C-x>`, and the leader is `<Space>`. `⌘`/`⌥` chords never reach this
 * layer — those stay with the configured keybindings so vim mode adds a
 * vocabulary rather than replacing one.
 *
 * Invariant: no complete sequence is a prefix of another, so a resolution is
 * always unambiguous (`vimKeymap.test.ts` enforces it).
 */
import type { KeybindingCommand } from "@t3tools/contracts";

import type { VimControl } from "./appControls";

export type VimMotion =
  | "left"
  | "right"
  | "down"
  | "up"
  | "halfDown"
  | "halfUp"
  | "pageDown"
  | "pageUp"
  | "top"
  | "bottom";

export type VimAction =
  /** Move within the current window — a card grid, a list cursor, or a scroll container. */
  | { readonly kind: "motion"; readonly motion: VimMotion }
  /** `<C-w>`-style window navigation between the app's panes. */
  | { readonly kind: "window"; readonly direction: "left" | "right" | "up" | "down" }
  /** Threads are this app's buffers. */
  | { readonly kind: "buffer"; readonly direction: "previous" | "next" }
  /** Run an existing app command through whatever chord the user has bound to it. */
  | { readonly kind: "command"; readonly command: KeybindingCommand }
  /** Leave normal mode by focusing the composer (or the terminal). */
  | { readonly kind: "insert" }
  /** Activate a composer or header control that has no bindable command. */
  | { readonly kind: "control"; readonly control: VimControl }
  /** `/` — focus the current window's own search field. */
  | { readonly kind: "search" }
  /** Show every vim binding. */
  | { readonly kind: "help" }
  /** Route somewhere in the app. */
  | { readonly kind: "navigate"; readonly to: "/settings/keybindings" };

/** Cheat-sheet sections, in display order. */
export const VIM_SECTIONS = ["Windows", "Motions", "Threads", "Modes", "Leader"] as const;
export type VimSection = (typeof VIM_SECTIONS)[number];

export interface VimKeymapEntry {
  readonly keys: readonly string[];
  readonly action: VimAction;
  /** which-key and cheat-sheet label. */
  readonly desc: string;
  readonly section: VimSection;
}

export const VIM_LEADER = "<Space>";

function motion(motionKind: VimMotion): VimAction {
  return { kind: "motion", motion: motionKind };
}

function command(commandName: KeybindingCommand): VimAction {
  return { kind: "command", command: commandName };
}

function control(name: VimControl): VimAction {
  return { kind: "control", control: name };
}

/**
 * Bindings are LazyVim's where LazyVim has one, and its closest analogue
 * otherwise: threads stand in for buffers, the thread sidebar for neo-tree,
 * and the command palette for the picker.
 */
export const VIM_KEYMAP: readonly VimKeymapEntry[] = [
  // ── Motions within the focused window ──────────────────────────────
  { keys: ["h"], action: motion("left"), section: "Motions", desc: "Left" },
  { keys: ["j"], action: motion("down"), section: "Motions", desc: "Down" },
  { keys: ["k"], action: motion("up"), section: "Motions", desc: "Up" },
  { keys: ["l"], action: motion("right"), section: "Motions", desc: "Right" },
  { keys: ["<C-d>"], action: motion("halfDown"), section: "Motions", desc: "Half page down" },
  { keys: ["<C-u>"], action: motion("halfUp"), section: "Motions", desc: "Half page up" },
  { keys: ["<C-f>"], action: motion("pageDown"), section: "Motions", desc: "Page down" },
  { keys: ["<C-b>"], action: motion("pageUp"), section: "Motions", desc: "Page up" },
  { keys: ["g", "g"], action: motion("top"), section: "Motions", desc: "Go to top" },
  { keys: ["G"], action: motion("bottom"), section: "Motions", desc: "Go to bottom" },

  // ── Window navigation ──────────────────────────────────────────────
  {
    keys: ["<C-h>"],
    action: { kind: "window", direction: "left" },
    section: "Windows",
    desc: "Left window",
  },
  {
    keys: ["<C-j>"],
    action: { kind: "window", direction: "down" },
    section: "Windows",
    desc: "Lower window",
  },
  {
    keys: ["<C-k>"],
    action: { kind: "window", direction: "up" },
    section: "Windows",
    desc: "Upper window",
  },
  {
    keys: ["<C-l>"],
    action: { kind: "window", direction: "right" },
    section: "Windows",
    desc: "Right window",
  },
  {
    keys: ["<C-w>", "h"],
    action: { kind: "window", direction: "left" },
    section: "Windows",
    desc: "Left window",
  },
  {
    keys: ["<C-w>", "j"],
    action: { kind: "window", direction: "down" },
    section: "Windows",
    desc: "Lower window",
  },
  {
    keys: ["<C-w>", "k"],
    action: { kind: "window", direction: "up" },
    section: "Windows",
    desc: "Upper window",
  },
  {
    keys: ["<C-w>", "l"],
    action: { kind: "window", direction: "right" },
    section: "Windows",
    desc: "Right window",
  },

  // ── Threads are buffers ────────────────────────────────────────────
  {
    keys: ["H"],
    action: { kind: "buffer", direction: "previous" },
    section: "Threads",
    desc: "Prev thread",
  },
  {
    keys: ["L"],
    action: { kind: "buffer", direction: "next" },
    section: "Threads",
    desc: "Next thread",
  },
  {
    keys: ["[", "b"],
    action: { kind: "buffer", direction: "previous" },
    section: "Threads",
    desc: "Prev thread",
  },
  {
    keys: ["]", "b"],
    action: { kind: "buffer", direction: "next" },
    section: "Threads",
    desc: "Next thread",
  },
  { keys: ["o"], action: command("chat.new"), section: "Threads", desc: "New thread" },

  // ── Entering insert, searching, the command line ───────────────────
  { keys: ["i"], action: { kind: "insert" }, section: "Modes", desc: "Compose" },
  { keys: ["a"], action: { kind: "insert" }, section: "Modes", desc: "Compose" },
  { keys: ["A"], action: { kind: "insert" }, section: "Modes", desc: "Compose" },
  { keys: [":"], action: command("commandPalette.toggle"), section: "Modes", desc: "Commands" },
  { keys: ["/"], action: { kind: "search" }, section: "Modes", desc: "Search window" },
  { keys: ["<C-/>"], action: command("terminal.toggle"), section: "Modes", desc: "Terminal" },

  // ── <leader> ───────────────────────────────────────────────────────
  {
    keys: [VIM_LEADER, VIM_LEADER],
    action: command("filePicker.toggle"),
    section: "Leader",
    desc: "Find file",
  },
  {
    keys: [VIM_LEADER, ","],
    action: command("commandPalette.toggle"),
    section: "Leader",
    desc: "Switch thread",
  },
  {
    keys: [VIM_LEADER, "/"],
    action: command("projectSearch.toggle"),
    section: "Leader",
    desc: "Grep",
  },
  { keys: [VIM_LEADER, "?"], action: { kind: "help" }, section: "Leader", desc: "Keymap help" },
  {
    keys: [VIM_LEADER, "e"],
    action: command("sidebar.toggle"),
    section: "Leader",
    desc: "Explorer",
  },
  {
    keys: [VIM_LEADER, "o"],
    action: command("editor.openFavorite"),
    section: "Leader",
    desc: "Open in editor",
  },
  {
    keys: [VIM_LEADER, "c", "s"],
    action: command("composer.stash"),
    section: "Leader",
    desc: "Stash prompt",
  },
  {
    keys: [VIM_LEADER, "c", "e"],
    action: control("composerEditor"),
    section: "Leader",
    desc: "Edit prompt in $EDITOR",
  },

  // buffer/thread
  {
    keys: [VIM_LEADER, "b", "b"],
    action: { kind: "buffer", direction: "previous" },
    section: "Leader",
    desc: "Other thread",
  },
  {
    keys: [VIM_LEADER, "b", "p"],
    action: { kind: "buffer", direction: "previous" },
    section: "Leader",
    desc: "Prev thread",
  },
  {
    keys: [VIM_LEADER, "b", "n"],
    action: { kind: "buffer", direction: "next" },
    section: "Leader",
    desc: "Next thread",
  },

  // file/find
  {
    keys: [VIM_LEADER, "f", "f"],
    action: command("filePicker.toggle"),
    section: "Leader",
    desc: "Find file",
  },
  {
    keys: [VIM_LEADER, "f", "n"],
    action: command("chat.new"),
    section: "Leader",
    desc: "New thread",
  },
  {
    keys: [VIM_LEADER, "f", "N"],
    action: command("chat.newLocal"),
    section: "Leader",
    desc: "New thread (here)",
  },
  // No `<leader>fT` for `terminal.new`: it is bound `when: terminalFocus`, so
  // there is no chord to replay from anywhere a leader sequence can be typed.
  {
    keys: [VIM_LEADER, "f", "t"],
    action: command("terminal.toggle"),
    section: "Leader",
    desc: "Terminal",
  },

  // git
  { keys: [VIM_LEADER, "g", "g"], action: command("diff.toggle"), section: "Leader", desc: "Diff" },
  { keys: [VIM_LEADER, "g", "d"], action: command("diff.toggle"), section: "Leader", desc: "Diff" },
  {
    keys: [VIM_LEADER, "g", "c"],
    action: control("gitQuickAction"),
    section: "Leader",
    desc: "Commit & push",
  },

  // model
  {
    keys: [VIM_LEADER, "m", "m"],
    action: command("modelPicker.toggle"),
    section: "Leader",
    desc: "Model",
  },
  {
    keys: [VIM_LEADER, "m", "r"],
    action: control("reasoning"),
    section: "Leader",
    desc: "Reasoning",
  },
  { keys: [VIM_LEADER, "m", "a"], action: control("access"), section: "Leader", desc: "Access" },
  {
    keys: [VIM_LEADER, "m", "p"],
    action: control("planMode"),
    section: "Leader",
    desc: "Plan / build",
  },

  // search
  {
    keys: [VIM_LEADER, "s", "g"],
    action: command("projectSearch.toggle"),
    section: "Leader",
    desc: "Grep",
  },
  {
    keys: [VIM_LEADER, "s", "f"],
    action: command("filePicker.toggle"),
    section: "Leader",
    desc: "Find file",
  },
  {
    keys: [VIM_LEADER, "s", "k"],
    action: { kind: "navigate", to: "/settings/keybindings" },
    section: "Leader",
    desc: "Keymaps",
  },

  // ui
  {
    keys: [VIM_LEADER, "u", "p"],
    action: command("preview.toggle"),
    section: "Leader",
    desc: "Preview",
  },
  {
    keys: [VIM_LEADER, "u", "r"],
    action: command("rightPanel.toggle"),
    section: "Leader",
    desc: "Right panel",
  },
  {
    keys: [VIM_LEADER, "u", "e"],
    action: command("sidebar.toggle"),
    section: "Leader",
    desc: "Explorer",
  },

  // window — the same moves as <C-w>, surfaced under the leader so which-key
  // can teach them.
  {
    keys: [VIM_LEADER, "w", "h"],
    action: { kind: "window", direction: "left" },
    section: "Leader",
    desc: "Left window",
  },
  {
    keys: [VIM_LEADER, "w", "j"],
    action: { kind: "window", direction: "down" },
    section: "Leader",
    desc: "Lower window",
  },
  {
    keys: [VIM_LEADER, "w", "k"],
    action: { kind: "window", direction: "up" },
    section: "Leader",
    desc: "Upper window",
  },
  {
    keys: [VIM_LEADER, "w", "l"],
    action: { kind: "window", direction: "right" },
    section: "Leader",
    desc: "Right window",
  },
];

/** which-key group names, keyed by the joined prefix they label. */
const VIM_GROUP_LABELS: Readonly<Record<string, string>> = {
  g: "goto",
  "[": "prev",
  "]": "next",
  "<C-w>": "window",
  [`${VIM_LEADER} b`]: "buffer",
  [`${VIM_LEADER} c`]: "composer",
  [`${VIM_LEADER} f`]: "file/find",
  [`${VIM_LEADER} g`]: "git",
  [`${VIM_LEADER} m`]: "model",
  [`${VIM_LEADER} s`]: "search",
  [`${VIM_LEADER} u`]: "ui",
  [`${VIM_LEADER} w`]: "window",
};

function joinKeys(keys: readonly string[]): string {
  return keys.join(" ");
}

function startsWith(keys: readonly string[], prefix: readonly string[]): boolean {
  if (prefix.length > keys.length) return false;
  return prefix.every((key, index) => keys[index] === key);
}

export type VimResolution =
  | { readonly kind: "action"; readonly action: VimAction; readonly keys: readonly string[] }
  | { readonly kind: "pending"; readonly keys: readonly string[] }
  | { readonly kind: "none" };

/**
 * Feed one key into a (possibly empty) pending sequence.
 *
 * `pending` means the sequence is a live prefix and the caller should keep
 * collecting; `none` means no binding can still match, which in normal mode
 * is a swallowed key rather than a passthrough — the same as vim.
 */
export function resolveVimSequence(
  pending: readonly string[],
  key: string,
  keymap: readonly VimKeymapEntry[] = VIM_KEYMAP,
): VimResolution {
  const keys = [...pending, key];

  const exact = keymap.find((entry) => joinKeys(entry.keys) === joinKeys(keys));
  if (exact) {
    return { kind: "action", action: exact.action, keys };
  }

  if (keymap.some((entry) => startsWith(entry.keys, keys))) {
    return { kind: "pending", keys };
  }

  return { kind: "none" };
}

export interface VimContinuation {
  readonly key: string;
  readonly desc: string;
  readonly isGroup: boolean;
}

/**
 * The which-key rows for a pending prefix: one entry per distinct next key,
 * labelled with the group name when more than one binding lives under it.
 */
export function vimContinuations(
  pending: readonly string[],
  keymap: readonly VimKeymapEntry[] = VIM_KEYMAP,
): readonly VimContinuation[] {
  if (pending.length === 0) return [];

  const byNextKey = new Map<string, VimKeymapEntry[]>();
  for (const entry of keymap) {
    if (!startsWith(entry.keys, pending) || entry.keys.length === pending.length) continue;
    const nextKey = entry.keys[pending.length];
    if (nextKey === undefined) continue;
    const bucket = byNextKey.get(nextKey);
    if (bucket) {
      bucket.push(entry);
    } else {
      byNextKey.set(nextKey, [entry]);
    }
  }

  return [...byNextKey.entries()].map(([key, entries]) => {
    const isGroup = entries.some((entry) => entry.keys.length > pending.length + 1);
    if (!isGroup) {
      return { key, desc: entries[0]?.desc ?? "", isGroup: false };
    }
    const groupLabel = VIM_GROUP_LABELS[joinKeys([...pending, key])];
    return { key, desc: groupLabel ?? `+${key}`, isGroup: true };
  });
}

export interface VimCheatSheetRow {
  readonly keys: string;
  readonly desc: string;
}

/**
 * The keymap as `<leader>?` renders it: one row per binding, de-duplicated so
 * aliases for the same action share a row (`H` and `[b` become `H  [b`).
 */
export function vimCheatSheet(
  keymap: readonly VimKeymapEntry[] = VIM_KEYMAP,
): ReadonlyArray<readonly [VimSection, readonly VimCheatSheetRow[]]> {
  return VIM_SECTIONS.map((section) => {
    const byDescription = new Map<string, string[]>();
    for (const entry of keymap) {
      if (entry.section !== section) continue;
      const rendered = formatVimKeys(entry.keys);
      const bucket = byDescription.get(entry.desc);
      if (bucket) {
        if (!bucket.includes(rendered)) bucket.push(rendered);
      } else {
        byDescription.set(entry.desc, [rendered]);
      }
    }
    const rows = [...byDescription.entries()].map(([desc, keys]) => ({
      keys: keys.join("  "),
      desc,
    }));
    return [section, rows] as const;
  }).filter(([, rows]) => rows.length > 0);
}

export interface VimKeyEventLike {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}

/**
 * Translate a keyboard event into vim notation, or null when the event
 * belongs to another layer. ⌘/⌥ chords are deliberately excluded: those are
 * the configured keybindings' territory.
 */
export function vimKeyFromEvent(event: VimKeyEventLike): string | null {
  if (event.metaKey || event.altKey) return null;

  if (event.ctrlKey) {
    // Only the chords the keymap can express; anything else (⌃C, ⌃A…) keeps
    // its native meaning.
    if (event.key.length !== 1) return null;
    // ⌃[ is Escape in every vim, and reaches the browser as "[".
    if (event.key === "[") return "<Esc>";
    const lowered = event.key.toLowerCase();
    if (!/^[a-z/]$/.test(lowered)) return null;
    return `<C-${lowered}>`;
  }

  if (event.key === "Escape") return "<Esc>";
  if (event.key === "Backspace") return "<BS>";
  if (event.key === " ") return VIM_LEADER;
  if (event.key === "Enter") return "<CR>";
  if (event.key.length !== 1) return null;
  return event.key;
}

/** Human-readable rendering of a sequence, e.g. `<Space>ff`. */
export function formatVimKeys(keys: readonly string[]): string {
  return keys.join("");
}
