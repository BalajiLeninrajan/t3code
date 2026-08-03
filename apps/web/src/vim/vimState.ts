/**
 * Zustand store for vim mode: which mode we are in, which window is current,
 * and the sequence collected so far.
 *
 * There is one mode for the whole app. Outside the composer it follows focus —
 * a text field is insert, anything else is normal — and inside the composer the
 * buffer engine drives it. The composer is a place the mode applies, not a mode
 * of its own.
 */
import { create } from "zustand";

import type { VimRegion } from "./vimRegions";

export type VimMode = "normal" | "insert" | "visual";

const EMPTY_PENDING: readonly string[] = [];

interface VimStateStore {
  mode: VimMode;
  region: VimRegion;
  pending: readonly string[];
  /** Whether the `<leader>?` keymap sheet is showing. */
  helpOpen: boolean;
  setMode: (mode: VimMode) => void;
  setRegion: (region: VimRegion) => void;
  setPending: (pending: readonly string[]) => void;
  clearPending: () => void;
  setHelpOpen: (helpOpen: boolean) => void;
}

export const useVimStateStore = create<VimStateStore>((set) => ({
  mode: "normal",
  region: "chat",
  pending: EMPTY_PENDING,
  helpOpen: false,
  setHelpOpen: (helpOpen) => set((state) => (state.helpOpen === helpOpen ? state : { helpOpen })),
  setMode: (mode) => set((state) => (state.mode === mode ? state : { mode })),
  setRegion: (region) => set((state) => (state.region === region ? state : { region })),
  setPending: (pending) => set({ pending }),
  clearPending: () =>
    set((state) => (state.pending.length === 0 ? state : { pending: EMPTY_PENDING })),
}));

const EDITABLE_SELECTOR = [
  "input",
  "textarea",
  "select",
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
  '[role="textbox"]',
].join(",");

/**
 * Overlays that own the keyboard while open. Vim mode steps aside for them
 * instead of racing their own key handling — the command palette and menus
 * already navigate with arrows and Enter.
 */
const FLOATING_LAYER_SELECTOR = [
  "[data-command-palette]",
  '[data-slot="dialog-popup"]',
  '[data-slot="menu-popup"]',
  '[data-slot="select-popup"]',
  '[data-slot="popover-popup"]',
  '[data-slot="combobox-popup"]',
  '[data-slot="autocomplete-popup"]',
].join(",");

/** Controls that Space activates. Vim has no such widgets; the web does. */
const ACTIVATABLE_SELECTOR = [
  "button",
  "summary",
  '[role="button"]',
  '[role="checkbox"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
].join(",");

export function isEditableElement(element: Element | null): boolean {
  if (!element) return false;
  return element.closest(EDITABLE_SELECTOR) !== null;
}

export function isActivatableElement(element: Element | null): boolean {
  if (!element) return false;
  return element.closest(ACTIVATABLE_SELECTOR) !== null;
}

/**
 * Whether the *focused* element sits inside an overlay, rather than whether
 * any overlay exists. Scoped to focus deliberately: an overlay that has not
 * taken the keyboard — a hover popover, a menu left open behind the composer —
 * must not disable normal mode, which is what made Escape look dead in the
 * composer.
 */
export function isFocusInFloatingLayer(): boolean {
  return document.activeElement?.closest(FLOATING_LAYER_SELECTOR) != null;
}

/** Mode implied by where focus currently sits. */
export function modeForActiveElement(): VimMode {
  return isEditableElement(document.activeElement) ? "insert" : "normal";
}
