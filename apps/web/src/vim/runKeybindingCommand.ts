/**
 * Bridge from a vim binding to an existing app command.
 *
 * Every app command already has exactly one dispatcher: a window `keydown`
 * listener that runs `resolveShortcutCommand`. Rather than duplicating those
 * bodies (they live across the sidebar, chat view, command palette and
 * terminal drawer), a vim binding replays the chord the user has bound to the
 * command. Customized keybindings, `when` clauses, and commands added later
 * therefore work through vim mode with no extra wiring.
 */
import type {
  KeybindingCommand,
  KeybindingShortcut,
  ResolvedKeybindingsConfig,
} from "@t3tools/contracts";

import { shortcutForCommand, type ShortcutMatchContext } from "../keybindings";
import { isMacPlatform } from "../lib/utils";

const EVENT_CODES: Readonly<Record<string, string>> = {
  "[": "BracketLeft",
  "]": "BracketRight",
};

function eventCodeForKey(key: string): string | undefined {
  if (/^[a-z]$/.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  return EVENT_CODES[key];
}

/**
 * The keystroke that produces `shortcut` — the exact shape
 * `resolveShortcutCommand` reads back.
 */
export function shortcutKeyboardEventInit(
  shortcut: KeybindingShortcut,
  platform: string,
): KeyboardEventInit {
  const useMetaForMod = isMacPlatform(platform);
  const code = eventCodeForKey(shortcut.key);
  return {
    key: shortcut.key,
    ...(code ? { code } : {}),
    metaKey: shortcut.metaKey || (shortcut.modKey && useMetaForMod),
    ctrlKey: shortcut.ctrlKey || (shortcut.modKey && !useMetaForMod),
    shiftKey: shortcut.shiftKey,
    altKey: shortcut.altKey,
  };
}

let replaying = false;

/**
 * True while a replayed chord is being delivered. The vim layer listens on the
 * same window, so without this a replayed `Ctrl+B` would come straight back to
 * it as `<C-b>`.
 */
export function isReplayingKeybinding(): boolean {
  return replaying;
}

/**
 * Returns false when the command has no chord bound in this context, which is
 * the one case a vim binding cannot reach — the app has no other entry point
 * for it.
 */
export function runKeybindingCommand(
  keybindings: ResolvedKeybindingsConfig,
  command: KeybindingCommand,
  context?: Partial<ShortcutMatchContext>,
): boolean {
  const platform = navigator.platform;
  const shortcut = shortcutForCommand(keybindings, command, {
    platform,
    ...(context && { context }),
  });
  if (!shortcut) return false;

  // Dispatch is synchronous, so the flag covers exactly this delivery.
  replaying = true;
  try {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        ...shortcutKeyboardEventInit(shortcut, platform),
        bubbles: true,
        cancelable: true,
      }),
    );
  } finally {
    replaying = false;
  }
  return true;
}
