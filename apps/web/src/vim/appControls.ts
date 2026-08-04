/**
 * Controls that vim mode drives which have no bindable command: the composer's
 * reasoning menu, its access and plan/build toggles, and the header's git
 * quick action. Each is a real control the user clicks, reached here through a
 * stable marker attribute rather than a ref threaded through several layers of
 * render props for one binding apiece.
 *
 * Activating the marker is the same thing a click does, so the control keeps
 * ownership of its own state and keyboard handling.
 */

export type VimControl = "reasoning" | "access" | "planMode" | "gitQuickAction" | "composerEditor";

const CONTROL_SELECTORS: Readonly<Record<VimControl, string>> = {
  reasoning: "[data-composer-traits-trigger]",
  access: "[data-composer-runtime-mode-trigger]",
  planMode: "[data-composer-interaction-mode-toggle]",
  gitQuickAction: "[data-git-quick-action]",
  composerEditor: "[data-composer-editor-trigger]",
};

export const VIM_CONTROL_SELECTORS = CONTROL_SELECTORS;

/** Returns false when the control is not on screen — disabled, or not applicable here. */
export function activateControl(control: VimControl): boolean {
  const element = document.querySelector<HTMLElement>(CONTROL_SELECTORS[control]);
  if (!element) return false;
  if (element.getAttribute("aria-disabled") === "true") return false;
  if (element instanceof HTMLButtonElement && element.disabled) return false;
  element.click();
  return true;
}
