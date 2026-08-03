/**
 * The model picker is a two-pane list — a provider rail beside a model list —
 * that keeps its search input focused so typing filters. Vim mode makes it
 * modal instead: the list is navigated, and `/` is what starts a search.
 */

const CONTENT_SELECTOR = "[data-model-picker-content]";
const PROVIDER_SELECTOR = "[data-model-picker-provider]";

export function modelPickerElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>(CONTENT_SELECTOR);
}

export function modelPickerSearchInput(): HTMLInputElement | null {
  return modelPickerElement()?.querySelector<HTMLInputElement>("input") ?? null;
}

export function focusModelPickerSearch(): boolean {
  const input = modelPickerSearchInput();
  if (!input) return false;
  input.focus();
  return true;
}

/**
 * Step the provider rail. Returns false at either end — the rail is short and
 * wrapping would make it easy to overshoot the one you wanted.
 */
export function moveModelPickerProvider(delta: 1 | -1): boolean {
  const content = modelPickerElement();
  if (!content) return false;

  const providers = [...content.querySelectorAll<HTMLElement>(PROVIDER_SELECTOR)].filter(
    (provider) => provider.dataset.disabled !== "true",
  );
  if (providers.length === 0) return false;

  const current = providers.findIndex((provider) => provider.dataset.selected === "true");
  const next = providers[(current === -1 ? 0 : current) + delta];
  if (!next) return false;

  const button = next.querySelector<HTMLElement>("button");
  if (!button) return false;
  button.click();
  return true;
}
