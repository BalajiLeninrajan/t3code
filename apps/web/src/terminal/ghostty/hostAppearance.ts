import type { TerminalHostAppearance, TerminalHostColors } from "@t3tools/contracts";
import type { GhosttyColor, GhosttyTheme } from "./core";
import type { GhosttyTerminalFont, GhosttyTerminalShaders } from "./surface";

/**
 * Maps the host's Ghostty config onto the web terminal. The server resolves the
 * config past themes and includes, so everything here is a straight
 * translation: hex colors into Ghostty's RGB triples, font names into a CSS
 * family list, and custom shaders into the surface's shader chain.
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

/** Order-sensitive 32-bit hash, enough to notice an edited shader file. */
function hashSource(source: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
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

export function terminalShadersFromHost(
  appearance: TerminalHostAppearance | undefined,
): GhosttyTerminalShaders {
  return {
    sources: appearance?.shaders ?? [],
    animation: appearance?.shaderAnimation ?? "true",
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
    appearance.shaderAnimation,
    appearance.shaders.map((shader) => `${shader.path}:${hashSource(shader.source)}`).join(","),
  ].join("|");
}
