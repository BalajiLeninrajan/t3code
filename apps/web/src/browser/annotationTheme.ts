import type { DesktopPreviewAnnotationTheme } from "@t3tools/contracts";

const readVariable = (styles: CSSStyleDeclaration, name: string, fallback: string): string =>
  styles.getPropertyValue(name).trim() || fallback;

// Catppuccin Latte, used only if a token is somehow missing from the document.
// The overlay defaults to the light flavor, so these mirror the :host block in
// apps/desktop/src/preview/Annotation.css.
const LATTE = {
  base: "#eff1f5",
  mantle: "#e6e9ef",
  crust: "#dce0e8",
  surface0: "#ccd0da",
  surface1: "#bcc0cc",
  text: "#4c4f69",
  subtext0: "#6c6f85",
  mauve: "#8839ef",
} as const;

export function readPreviewAnnotationTheme(): DesktopPreviewAnnotationTheme {
  const root = document.documentElement;
  const styles = getComputedStyle(root);
  return {
    colorScheme: root.classList.contains("dark") ? "dark" : "light",
    radius: readVariable(styles, "--radius", "0.625rem"),
    background: readVariable(styles, "--background", LATTE.mantle),
    foreground: readVariable(styles, "--foreground", LATTE.text),
    popover: readVariable(styles, "--popover", LATTE.base),
    popoverForeground: readVariable(styles, "--popover-foreground", LATTE.text),
    primary: readVariable(styles, "--primary", LATTE.mauve),
    primaryForeground: readVariable(styles, "--primary-foreground", LATTE.base),
    muted: readVariable(styles, "--muted", LATTE.crust),
    mutedForeground: readVariable(styles, "--muted-foreground", LATTE.subtext0),
    accent: readVariable(styles, "--accent", LATTE.surface0),
    accentForeground: readVariable(styles, "--accent-foreground", LATTE.text),
    border: readVariable(styles, "--border", LATTE.surface0),
    input: readVariable(styles, "--input", LATTE.surface1),
    ring: readVariable(styles, "--ring", LATTE.mauve),
    fontSans: readVariable(styles, "--font-sans", styles.fontFamily || "system-ui, sans-serif"),
    fontMono: readVariable(styles, "--font-mono", "ui-monospace, monospace"),
  };
}
