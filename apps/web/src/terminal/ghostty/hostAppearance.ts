import type { TerminalHostAppearance, TerminalHostColors } from "@t3tools/contracts";
import type { GhosttyColor, GhosttyTheme } from "./core";
import type { GhosttyTerminalFont } from "./surface";

/**
 * Maps the host's Ghostty config onto the web terminal. The server resolves the
 * config past themes and includes, so everything here is a straight
 * translation: hex colors into Ghostty's RGB triples and font names into a CSS
 * family list.
 */

function parseHexColor(value: string): GhosttyColor | null {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(value.trim());
  if (!match) return null;
  const raw = Number.parseInt(match[1]!, 16);
  return { r: (raw >> 16) & 0xff, g: (raw >> 8) & 0xff, b: raw & 0xff };
}

export function terminalThemeFromHostColors(colors: TerminalHostColors): GhosttyTheme | null {
  const background = parseHexColor(colors.background);
  const foreground = parseHexColor(colors.foreground);
  if (!background || !foreground) return null;
  const palette = colors.palette
    .map(parseHexColor)
    .filter((color): color is GhosttyColor => color !== null);
  return {
    background,
    foreground,
    cursor: (colors.cursor === undefined ? null : parseHexColor(colors.cursor)) ?? foreground,
    ...(colors.cursorText !== undefined ? { cursorText: colors.cursorText } : {}),
    ...(colors.selectionBackground !== undefined
      ? { selectionBackground: colors.selectionBackground }
      : {}),
    ...(palette.length === colors.palette.length && palette.length > 0 ? { palette } : {}),
  };
}

/** CSS needs quotes around any family that is not a bare identifier. */
function cssFontFamily(family: string): string {
  const trimmed = family.trim();
  if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(trimmed)) return trimmed;
  return `"${trimmed.replaceAll('"', "")}"`;
}

export function terminalFontFromHost(
  appearance: TerminalHostAppearance | undefined,
): GhosttyTerminalFont {
  const families = appearance?.fontFamilies ?? [];
  const family = families.map(cssFontFamily).join(", ");
  return {
    ...(family.length > 0 ? { family } : {}),
    ...(appearance?.fontSize !== undefined ? { size: appearance.fontSize } : {}),
  };
}

/**
 * Identity for an appearance, so re-applying only happens when the host config
 * actually changed rather than on every server config broadcast.
 */
export function terminalHostAppearanceKey(
  appearance: TerminalHostAppearance | undefined,
): string | null {
  if (!appearance) return null;
  const colors = appearance.colors;
  return [
    colors?.background ?? "",
    colors?.foreground ?? "",
    colors?.cursor ?? "",
    colors?.cursorText ?? "",
    colors?.selectionBackground ?? "",
    colors?.palette.join(",") ?? "",
    appearance.fontFamilies.join(","),
    appearance.fontSize ?? "",
  ].join("|");
}
