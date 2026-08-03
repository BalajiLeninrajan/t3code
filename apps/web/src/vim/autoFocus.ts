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

export function isComposerAutoFocusSuppressed(): boolean {
  return getClientSettings().vimMode;
}
