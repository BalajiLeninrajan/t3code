/**
 * Vim mode owns where focus lives.
 *
 * The app normally returns focus to the composer whenever it thinks you are
 * done with something — opening a thread, closing the terminal, changing a
 * composer control, dismissing the command palette. With vim mode on that is
 * wrong twice over: it drops you into insert without asking, and it takes the
 * keyboard away from normal mode. The composer is entered deliberately, with
 * `i`.
 *
 * Read at call time rather than through a hook: this is a decision made at the
 * moment focus would move, not state a component renders from.
 */
import { getClientSettings } from "../hooks/useSettings";
import { focusRegion } from "./vimRegions";
import { useVimStateStore } from "./vimState";

export function isComposerAutoFocusSuppressed(): boolean {
  return getClientSettings().vimMode;
}

/**
 * Where focus goes in vim mode when something on screen goes away — closing
 * the terminal drawer, most of all. Suppressing the composer's auto-focus
 * cannot be the whole answer there: the surface holding focus is unmounting,
 * so declining to move focus leaves the keyboard on `<body>` with no window to
 * act on. Chat is the window underneath, and normal mode is where `i` starts.
 *
 * Returns false when it did not apply, so callers keep their own behaviour.
 */
export function focusChatWindow(): boolean {
  if (!getClientSettings().vimMode) return false;
  if (!focusRegion("chat")) return false;
  useVimStateStore.getState().setRegion("chat");
  return true;
}
