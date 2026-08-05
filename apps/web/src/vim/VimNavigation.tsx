/**
 * Vim mode: modal, LazyVim-flavoured navigation for the whole app.
 *
 * Mounted once, inert unless the `vimMode` client setting is on. It owns a
 * single capture-phase `keydown` listener; actions are executed either
 * directly (motions, window moves) or by replaying the chord bound to an
 * existing app command (see `runKeybindingCommand`).
 *
 * Normal mode swallows unmodified printable keys even when they are unbound,
 * exactly as vim does. That is deliberate: it is also what keeps the chat
 * view's type-to-focus behaviour from stealing `j`.
 */
import { useAtomValue } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useRef } from "react";

import { useComposerHandleContext } from "../composerHandleContext";
import { activateControl } from "./appControls";
import { focusModelPickerSearch, modelPickerElement, moveModelPickerProvider } from "./modelPicker";
import { useClientSettings } from "../hooks/useSettings";
import { isPreviewFocused } from "../lib/previewFocus";
import { getTerminalFocusOwner, isTerminalFocused } from "../lib/terminalFocus";
import { primaryServerKeybindingsAtom } from "../state/server";
import { isReplayingKeybinding, runKeybindingCommand } from "./runKeybindingCommand";
import { VimCheatSheet } from "./VimCheatSheet";
import { VimStatusLine } from "./VimStatusLine";
import {
  resolveVimSequence,
  vimKeyFromEvent,
  VIM_LEADER,
  type VimAction,
  type VimMotion,
} from "./vimKeymap";
import {
  activeGrid,
  adjacentRegion,
  focusRegion,
  moveGridFocus,
  regionForElement,
  regionScrollContainer,
  regionSearchInput,
  terminalInput,
} from "./vimRegions";
import {
  isActivatableElement,
  isEditableElement,
  isFocusInFloatingLayer,
  modeForActiveElement,
  useVimStateStore,
} from "./vimState";

/** A bare `j` scrolls about three text lines, which reads as one "step". */
const LINE_SCROLL_PX = 48;
/**
 * Readline-style movement inside menus, selects, and pickers. ⌃j/⌃k are here
 * too: window navigation means nothing while a dropdown owns the keyboard.
 */
const FLOATING_LAYER_ARROWS: Readonly<Record<string, "ArrowDown" | "ArrowUp" | undefined>> = {
  "<C-n>": "ArrowDown",
  "<C-j>": "ArrowDown",
  "<C-p>": "ArrowUp",
  "<C-k>": "ArrowUp",
};

/** How an open overlay marks the option matching its current value. */
const SELECTED_ITEM_SELECTOR = [
  '[role="option"][aria-selected="true"]',
  '[role="menuitemradio"][aria-checked="true"]',
  '[role="menuitemcheckbox"][aria-checked="true"]',
  "[data-selected]",
  "[data-checked]",
].join(",");

/**
 * Overlays already aligned since they opened. Each opening is a fresh element,
 * so this resets naturally and never needs clearing.
 */
const alignedOverlays = new WeakSet<Element>();

/**
 * Menus open with the highlight on the first option rather than the one
 * currently in effect, so the first ⌃n would step off the top of the list
 * instead of away from the current value. Move to the selected option, then
 * never again for this opening — realigning on every keystroke would drag the
 * highlight back and cap movement at one step either side.
 */
function alignOverlayHighlightToSelection(): void {
  const active = document.activeElement;
  const overlay = active?.closest('[data-slot$="-popup"], [data-command-palette]');
  if (!overlay || alignedOverlays.has(overlay)) return;
  alignedOverlays.add(overlay);

  // Overlays that keep focus on an input and track the highlight virtually
  // have no option to move focus to; leave those to their own handling.
  const selected = overlay.querySelector<HTMLElement>(SELECTED_ITEM_SELECTOR);
  if (!selected || selected.contains(active)) return;
  selected.focus({ preventScroll: false });
}

/** Replay as a real arrow press so the overlay's own keyboard handling runs. */
function pressArrowKey(key: "ArrowDown" | "ArrowUp"): void {
  const target = document.activeElement ?? document.body;
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

/**
 * Keys that keep their app-wide meaning even while the composer is in normal
 * mode. The leader is the point — normal mode is normal mode wherever the
 * caret happens to be — and window movement is worth more than vim's own
 * meaning for these chords inside a one-box buffer.
 */
const ALWAYS_GLOBAL_KEYS: ReadonlySet<string> = new Set([
  VIM_LEADER,
  ":",
  "<C-w>",
  "<C-h>",
  "<C-j>",
  "<C-k>",
  "<C-l>",
]);

/** Motions that also mean something inside a card grid. */
const GRID_DIRECTIONS: Partial<Record<VimMotion, "left" | "right" | "up" | "down">> = {
  left: "left",
  right: "right",
  down: "down",
  up: "up",
};

function scrollAmount(motion: VimMotion, viewportHeight: number): number | null {
  switch (motion) {
    case "left":
    case "right":
      return null;
    case "down":
      return LINE_SCROLL_PX;
    case "up":
      return -LINE_SCROLL_PX;
    case "halfDown":
      return viewportHeight / 2;
    case "halfUp":
      return -viewportHeight / 2;
    case "pageDown":
      return viewportHeight * 0.9;
    case "pageUp":
      return -viewportHeight * 0.9;
    case "top":
    case "bottom":
      return null;
  }
}

export function VimNavigation() {
  const enabled = useClientSettings((settings) => settings.vimMode);
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const composerHandleRef = useComposerHandleContext();
  const navigate = useNavigate();

  /** Whether the last focus sync saw the keyboard inside an overlay. */
  const wasInFloatingLayerRef = useRef(false);
  /** Whether `/` has handed the model picker's keyboard to its search box. */
  const modelPickerSearchingRef = useRef(false);

  const runCommand = (command: Parameters<typeof runKeybindingCommand>[1]) =>
    runKeybindingCommand(keybindings, command, {
      terminalFocus: isTerminalFocused(),
      previewFocus: isPreviewFocused(),
    });

  const runAction = useEffectEvent((action: VimAction) => {
    const { region, setRegion } = useVimStateStore.getState();

    switch (action.kind) {
      case "motion": {
        // A card grid in view is the cursor: hjkl walks its cells, and the
        // motion falls through only when there is no cell that way.
        const gridMove = GRID_DIRECTIONS[action.motion];
        if (gridMove) {
          const grid = activeGrid(region);
          if (grid && moveGridFocus(grid, gridMove)) return;
        }
        // Horizontal motion means nothing outside a grid.
        if (action.motion === "left" || action.motion === "right") return;

        // The thread list has no cursor of its own — its selection *is* the
        // open thread — so j/k there move between threads instead of
        // scrolling past them.
        if (region === "sidebar" && (action.motion === "down" || action.motion === "up")) {
          runCommand(action.motion === "down" ? "thread.next" : "thread.previous");
          return;
        }

        const container = regionScrollContainer(region);
        if (!container) return;
        if (action.motion === "top") {
          container.scrollTo({ top: 0 });
          return;
        }
        if (action.motion === "bottom") {
          container.scrollTo({ top: container.scrollHeight });
          return;
        }
        const delta = scrollAmount(action.motion, container.clientHeight);
        if (delta !== null) container.scrollBy({ top: delta });
        return;
      }

      case "window": {
        const target = adjacentRegion(region, action.direction);
        if (!target) return;
        if (focusRegion(target)) setRegion(target);
        return;
      }

      case "buffer":
        runCommand(action.direction === "previous" ? "thread.previous" : "thread.next");
        return;

      case "command":
        runCommand(action.command);
        return;

      case "insert": {
        // In the terminal, insert means terminal mode; Escape leaves it again,
        // and ⌘J (`<leader>ft`) closes the drawer outright.
        if (region === "terminal") {
          terminalInput()?.focus({ preventScroll: true });
          return;
        }
        composerHandleRef?.current?.focusAtEnd();
        return;
      }

      case "control":
        activateControl(action.control);
        return;

      case "help":
        useVimStateStore.getState().setHelpOpen(true);
        return;

      case "search": {
        const input = regionSearchInput(region);
        if (input) {
          input.focus();
          return;
        }
        runCommand("projectSearch.toggle");
        return;
      }

      case "navigate":
        void navigate({ to: action.to });
        return;
    }
  });

  // Mode and current window both follow focus, so they can never disagree
  // with where the next keystroke actually lands.
  useEffect(() => {
    if (!enabled) return;
    const { setMode, setRegion } = useVimStateStore.getState();

    const syncFromFocus = () => {
      // A menu, select, or dialog hands focus back to whatever opened it when
      // it closes, which parks the keyboard on a trigger button: Space would
      // re-open the thing you just finished with instead of being the leader.
      // Hand focus back to the window instead — unless the overlay chose a
      // text field on the way out, which is a deliberate destination (the
      // command palette focuses the composer).
      // Each time the picker opens it starts in list mode again.
      if (!modelPickerElement()) modelPickerSearchingRef.current = false;

      const inFloatingLayer = isFocusInFloatingLayer();
      const leftFloatingLayer = wasInFloatingLayerRef.current && !inFloatingLayer;
      wasInFloatingLayerRef.current = inFloatingLayer;
      if (leftFloatingLayer && !isEditableElement(document.activeElement)) {
        // Re-entrant by design: this fires focusin again, by which point the
        // flag is already false, so it settles after one hop.
        focusRegion(useVimStateStore.getState().region);
      }

      setMode(modeForActiveElement());
      const region = regionForElement(document.activeElement);
      if (region) setRegion(region);
    };

    // focusout fires before the incoming element takes focus, so reading
    // activeElement there would flash "normal" during every focus move.
    const syncAfterFocusMove = () => queueMicrotask(syncFromFocus);

    syncFromFocus();
    document.addEventListener("focusin", syncFromFocus);
    document.addEventListener("focusout", syncAfterFocusMove);
    return () => {
      document.removeEventListener("focusin", syncFromFocus);
      document.removeEventListener("focusout", syncAfterFocusMove);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      useVimStateStore.getState().clearPending();
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      // A chord this layer just replayed is not a keystroke to interpret.
      if (isReplayingKeybinding()) return;
      // The keybinding recorder in Settings needs raw keystrokes.
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("[data-keybinding-capture]")
      ) {
        return;
      }

      // A focused terminal owns every key. Whatever is running in it has its
      // own idea of what Escape and `:` mean, and both are keys it cannot do
      // without.
      //
      // The drawer is the exception, because it is a window you visit rather
      // than a program you are inside: Escape leaves terminal mode there and
      // falls through to the insert-mode handler below, the way ⌃\⌃n does in
      // nvim's terminal buffer. ⌃[ still reaches the shell as a literal
      // Escape, which is the way out for anything that genuinely needs one.
      // The composer's editor keeps every key — Escape is the whole point of
      // opening your own vim in there.
      const terminalOwner = getTerminalFocusOwner();
      if (terminalOwner !== null && !(terminalOwner === "drawer" && event.key === "Escape")) {
        return;
      }

      const { pending, setPending, clearPending } = useVimStateStore.getState();
      const key = vimKeyFromEvent(event);

      // Overlays own the keyboard, but a vim user still expects to move
      // through them without arrow keys. This runs before the mode split
      // because most of these overlays keep a text input focused.
      if (key !== null && isFocusInFloatingLayer()) {
        const claim = () => {
          event.preventDefault();
          event.stopPropagation();
        };

        // The model picker is two lists side by side: ⌃n/⌃p walk the provider
        // rail, j/k walk the models, and `/` is what starts typing.
        if (modelPickerElement()) {
          if (key === "<C-n>" || key === "<C-p>") {
            claim();
            moveModelPickerProvider(key === "<C-n>" ? 1 : -1);
            return;
          }
          if (key === "<C-j>" || key === "<C-k>") {
            claim();
            pressArrowKey(key === "<C-j>" ? "ArrowDown" : "ArrowUp");
            return;
          }
          if (modelPickerSearchingRef.current) {
            // Escape ends the search and hands the list back, rather than
            // closing the picker outright; a second Escape does that.
            if (key !== "<Esc>") return;
            claim();
            modelPickerSearchingRef.current = false;
            return;
          }
          if (key === "/") {
            claim();
            modelPickerSearchingRef.current = true;
            focusModelPickerSearch();
            return;
          }
          if (key === "j" || key === "k") {
            claim();
            pressArrowKey(key === "j" ? "ArrowDown" : "ArrowUp");
            return;
          }
          // Other printable keys would reach the still-focused search input.
          if (key.length === 1) claim();
          return;
        }

        const arrow = FLOATING_LAYER_ARROWS[key];
        if (arrow) {
          claim();
          alignOverlayHighlightToSelection();
          pressArrowKey(arrow);
          return;
        }
        // j/k too, but only where they cannot be mistaken for typing.
        if ((key === "j" || key === "k") && !isEditableElement(document.activeElement)) {
          claim();
          alignOverlayHighlightToSelection();
          pressArrowKey(key === "j" ? "ArrowDown" : "ArrowUp");
          return;
        }
        // Everything else in an overlay belongs to the overlay.
        return;
      }

      const activeMode = modeForActiveElement();

      if (activeMode === "insert") {
        // Escape (and vim's ⌃[) leaves a text field outright. The drawer's
        // terminal arrives here too, and leaving it means the same thing:
        // focus parks on the drawer window in normal mode.
        if (key !== "<Esc>") return;
        const active = document.activeElement;
        if (!(active instanceof HTMLElement)) return;
        event.preventDefault();
        event.stopPropagation();
        active.blur();
        // Park focus on the current window instead of <body>, so normal mode
        // has a home and nothing restores focus to the field behind our back.
        focusRegion(useVimStateStore.getState().region);
        useVimStateStore.getState().setMode("normal");
        return;
      }

      if (key === null) return;

      if (key === "<BS>") {
        // Backspace steps back one level of the sequence, as which-key does.
        // With nothing pending it is just a backspace.
        if (pending.length === 0) return;
        event.preventDefault();
        event.stopPropagation();
        setPending(pending.slice(0, -1));
        return;
      }

      if (key === "<Esc>") {
        // Only claim Escape when it has a sequence to cancel; otherwise it
        // still reaches handlers like "clear thread selection".
        if (pending.length === 0) return;
        event.preventDefault();
        event.stopPropagation();
        clearPending();
        return;
      }

      // Space activates a focused button or switch. Claiming it as the leader
      // there would take away the only key that works on those controls.
      if (
        key === VIM_LEADER &&
        pending.length === 0 &&
        isActivatableElement(document.activeElement)
      ) {
        return;
      }

      const resolution = resolveVimSequence(pending, key);

      // A half-typed sequence stays on screen until it resolves, fails, or is
      // cancelled with Escape. No timeout: which-key is there to be read.
      if (resolution.kind === "pending") {
        event.preventDefault();
        event.stopPropagation();
        setPending(resolution.keys);
        return;
      }

      if (resolution.kind === "action") {
        event.preventDefault();
        event.stopPropagation();
        clearPending();
        runAction(resolution.action);
        return;
      }

      clearPending();
      // Unbound printable keys are swallowed the way vim swallows them.
      // Everything with a longer name — Enter, Ctrl chords — keeps its meaning,
      // so focused controls still activate and app shortcuts still fire.
      if (key.length === 1) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    // Registered once per toggle, never re-registered on a dependency change:
    // re-adding the listener would move vim to the back of the capture queue
    // and let another window handler claim keys first.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [enabled]);

  if (!enabled) return null;
  return (
    <>
      <VimStatusLine />
      <VimCheatSheet />
    </>
  );
}
