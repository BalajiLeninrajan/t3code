/**
 * The app's "windows" for vim navigation, and the DOM plumbing to move
 * between them. Regions are located through markers the app already owns
 * wherever one exists, so this layer stays additive.
 */

export type VimRegion = "sidebar" | "chat" | "terminal" | "panel";

/** Left-to-right, which is the order `<C-h>` / `<C-l>` walk. */
export const VIM_REGION_ORDER: readonly VimRegion[] = ["sidebar", "chat", "panel"];

const REGION_SELECTORS: Readonly<Record<VimRegion, string>> = {
  sidebar: "[data-app-sidebar]",
  chat: '[data-vim-region="chat"]',
  terminal: '[data-terminal-owner="drawer"]',
  panel: "[data-preview-panel-mode]",
};

export const VIM_REGION_LABELS: Readonly<Record<VimRegion, string>> = {
  sidebar: "explorer",
  chat: "chat",
  terminal: "terminal",
  panel: "panel",
};

function isRendered(element: HTMLElement | null): element is HTMLElement {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function regionElement(region: VimRegion): HTMLElement | null {
  const element = document.querySelector<HTMLElement>(REGION_SELECTORS[region]);
  return isRendered(element) ? element : null;
}

export function isRegionAvailable(region: VimRegion): boolean {
  return regionElement(region) !== null;
}

/**
 * The next visible region in `direction`. Horizontal movement walks the
 * sidebar → chat → panel row; the terminal drawer sits under the chat column,
 * so vertical movement swaps between the two and horizontal movement treats
 * it as the chat column.
 */
export function adjacentRegion(
  region: VimRegion,
  direction: "left" | "right" | "up" | "down",
): VimRegion | null {
  if (direction === "down") {
    return region !== "terminal" && isRegionAvailable("terminal") ? "terminal" : null;
  }
  if (direction === "up") {
    return region === "terminal" && isRegionAvailable("chat") ? "chat" : null;
  }

  const column: VimRegion = region === "terminal" ? "chat" : region;
  const step = direction === "left" ? -1 : 1;
  let index = VIM_REGION_ORDER.indexOf(column) + step;
  while (index >= 0 && index < VIM_REGION_ORDER.length) {
    const candidate = VIM_REGION_ORDER[index];
    if (candidate && isRegionAvailable(candidate)) return candidate;
    index += step;
  }
  return null;
}

/** The nearest region containing `target`, or null when it is outside all of them. */
export function regionForElement(target: Element | null): VimRegion | null {
  if (!target) return null;
  for (const region of ["terminal", "sidebar", "panel", "chat"] as const) {
    if (target.closest(REGION_SELECTORS[region])) return region;
  }
  return null;
}

function findScrollContainer(root: HTMLElement): HTMLElement | null {
  const candidates = [root, ...root.querySelectorAll<HTMLElement>("*")];
  let best: HTMLElement | null = null;
  for (const candidate of candidates) {
    if (candidate.scrollHeight <= candidate.clientHeight + 1) continue;
    const overflowY = window.getComputedStyle(candidate).overflowY;
    if (overflowY !== "auto" && overflowY !== "scroll" && overflowY !== "overlay") continue;
    if (!best || candidate.clientHeight > best.clientHeight) best = candidate;
  }
  return best;
}

/**
 * Cached because the search walks every node under a region and reads computed
 * style, and motions run on key repeat. A cached node stays valid as long as it
 * is still mounted inside the region it was found in — which survives the list
 * re-rendering under it.
 */
const scrollContainerCache = new Map<VimRegion, HTMLElement>();

/**
 * The scrollable node a motion should act on. Regions rarely scroll at their
 * own root — the timeline virtualizer and the sidebar both scroll a
 * descendant — so pick the tallest overflowing candidate inside the region.
 */
export function regionScrollContainer(region: VimRegion): HTMLElement | null {
  const root = regionElement(region);
  if (!root) {
    scrollContainerCache.delete(region);
    return null;
  }

  const cached = scrollContainerCache.get(region);
  if (cached?.isConnected && root.contains(cached)) return cached;

  const found = findScrollContainer(root);
  if (found) {
    scrollContainerCache.set(region, found);
  } else {
    scrollContainerCache.delete(region);
  }
  return found;
}

/**
 * Card grids that normal mode navigates with `hjkl`, like the right panel's
 * "Open a surface" picker. Any container tagged `data-vim-grid` participates;
 * its focusable children are the cells.
 */
const GRID_SELECTOR = "[data-vim-grid]";
const GRID_ITEM_SELECTOR =
  'button:not([disabled]):not([aria-disabled="true"]), [role="button"], a[href]';

function gridItems(grid: HTMLElement): HTMLElement[] {
  return [...grid.querySelectorAll<HTMLElement>(GRID_ITEM_SELECTOR)].filter(isRendered);
}

/**
 * The grid `hjkl` should drive: the one holding focus, else the only visible
 * grid inside `region`. The fallback is what makes the picker navigable the
 * moment it appears, before anything has been focused.
 */
export function activeGrid(region: VimRegion): HTMLElement | null {
  const focused = document.activeElement?.closest<HTMLElement>(GRID_SELECTOR);
  if (focused && isRendered(focused)) return focused;

  const root = regionElement(region);
  const candidate = root?.querySelector<HTMLElement>(GRID_SELECTOR) ?? null;
  return isRendered(candidate) ? candidate : null;
}

/** Put focus on a grid's first cell, or leave it where it already is inside. */
export function focusGrid(grid: HTMLElement): boolean {
  const items = gridItems(grid);
  if (items.some((item) => item.contains(document.activeElement))) return true;
  const first = items[0];
  if (!first) return false;
  first.focus();
  return true;
}

/**
 * Move focus one cell in `direction`, by geometry rather than DOM order so
 * wrapped rows behave the way they look. Returns false at the edge — vim does
 * not wrap either.
 */
export function moveGridFocus(
  grid: HTMLElement,
  direction: "left" | "right" | "up" | "down",
): boolean {
  const items = gridItems(grid);
  if (items.length === 0) return false;

  const current = items.find((item) => item.contains(document.activeElement));
  if (!current) {
    items[0]?.focus();
    return true;
  }

  const from = current.getBoundingClientRect();
  const horizontal = direction === "left" || direction === "right";
  const sign = direction === "left" || direction === "up" ? -1 : 1;

  let best: { element: HTMLElement; distance: number } | null = null;
  for (const item of items) {
    if (item === current) continue;
    const rect = item.getBoundingClientRect();
    const along = horizontal ? rect.left - from.left : rect.top - from.top;
    if (along * sign <= 0) continue;
    // Prefer the nearest cell in the direction of travel, breaking ties toward
    // the one best aligned on the other axis.
    const across = horizontal ? Math.abs(rect.top - from.top) : Math.abs(rect.left - from.left);
    const distance = Math.abs(along) + across * 2;
    if (!best || distance < best.distance) best = { element: item, distance };
  }

  if (!best) return false;
  best.element.focus();
  return true;
}

/** The terminal's real keyboard input — the target of `i` inside the drawer. */
export function terminalInput(): HTMLElement | null {
  return regionElement("terminal")?.querySelector<HTMLElement>(".t3-ghostty-input") ?? null;
}

/** The search field a region owns, if any — the target of `/`. */
export function regionSearchInput(region: VimRegion): HTMLElement | null {
  const root = regionElement(region);
  if (!root) return null;
  return root.querySelector<HTMLElement>(
    'input[type="search"], input[aria-label*="Search" i], input[placeholder*="Search" i]',
  );
}

/**
 * Move keyboard focus into a region without leaving normal mode — including
 * the terminal, which vim also treats as a normal-mode buffer until you press
 * `i`. Focusing its input here instead would be a one-way door: every key,
 * including the ones that navigate back out, would belong to the shell.
 */
export function focusRegion(region: VimRegion): boolean {
  const root = regionElement(region);
  if (!root) return false;

  // A region showing a card grid has somewhere better to put focus than its
  // scroll container: the first cell, so `hjkl` has a cursor to move.
  const grid = root.querySelector<HTMLElement>(GRID_SELECTOR);
  if (grid && isRendered(grid) && focusGrid(grid)) {
    return true;
  }

  const scrollContainer = regionScrollContainer(region) ?? root;
  if (!scrollContainer.hasAttribute("tabindex")) {
    scrollContainer.setAttribute("tabindex", "-1");
  }
  scrollContainer.focus({ preventScroll: true });
  return true;
}
