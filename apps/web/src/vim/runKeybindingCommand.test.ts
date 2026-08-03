import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";

import { resolveShortcutCommand, shortcutForCommand } from "../keybindings";
import { VIM_KEYMAP } from "./vimKeymap";
import { shortcutKeyboardEventInit } from "./runKeybindingCommand";

const PLATFORMS = ["MacIntel", "Win32"];

/** Every app command a vim binding can fire. */
const VIM_DRIVEN_COMMANDS = [
  ...new Set(
    VIM_KEYMAP.flatMap((entry) => (entry.action.kind === "command" ? [entry.action.command] : [])),
  ),
  "thread.previous",
  "thread.next",
] as const;

describe("shortcutKeyboardEventInit", () => {
  it("round-trips every vim-driven command back to itself", () => {
    for (const platform of PLATFORMS) {
      for (const command of VIM_DRIVEN_COMMANDS) {
        const shortcut = shortcutForCommand(DEFAULT_RESOLVED_KEYBINDINGS, command, { platform });
        expect(shortcut, `${command} has no default binding on ${platform}`).not.toBeNull();
        if (!shortcut) continue;

        const init = shortcutKeyboardEventInit(shortcut, platform);
        const replayed = resolveShortcutCommand(
          {
            key: init.key ?? "",
            ...(init.code !== undefined ? { code: init.code } : {}),
            metaKey: init.metaKey ?? false,
            ctrlKey: init.ctrlKey ?? false,
            shiftKey: init.shiftKey ?? false,
            altKey: init.altKey ?? false,
          },
          DEFAULT_RESOLVED_KEYBINDINGS,
          { platform },
        );

        expect(replayed, `${command} replayed as ${replayed} on ${platform}`).toBe(command);
      }
    }
  });

  it("maps mod to Cmd on macOS and Ctrl elsewhere", () => {
    const shortcut = shortcutForCommand(DEFAULT_RESOLVED_KEYBINDINGS, "sidebar.toggle", {
      platform: "MacIntel",
    });
    expect(shortcut).not.toBeNull();
    if (!shortcut) return;

    expect(shortcutKeyboardEventInit(shortcut, "MacIntel")).toMatchObject({
      key: "b",
      code: "KeyB",
      metaKey: true,
      ctrlKey: false,
    });
    expect(shortcutKeyboardEventInit(shortcut, "Win32")).toMatchObject({
      key: "b",
      metaKey: false,
      ctrlKey: true,
    });
  });

  it("carries the event code for bracket keys so thread traversal matches", () => {
    const shortcut = shortcutForCommand(DEFAULT_RESOLVED_KEYBINDINGS, "thread.previous", {
      platform: "MacIntel",
    });
    expect(shortcut).not.toBeNull();
    if (!shortcut) return;

    expect(shortcutKeyboardEventInit(shortcut, "MacIntel")).toMatchObject({
      key: "[",
      code: "BracketLeft",
      shiftKey: true,
      metaKey: true,
    });
  });
});
