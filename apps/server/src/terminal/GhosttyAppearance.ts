import type {
  TerminalHostAppearance,
  TerminalHostColors,
  TerminalHostShader,
  TerminalHostShaderAnimation,
} from "@t3tools/contracts";
import { HostProcessEnvironment, HostProcessPlatform } from "@t3tools/shared/hostProcess";
import { resolveCommandPath } from "@t3tools/shared/shell";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import * as ProcessRunner from "../processRunner.ts";

/** Ghostty prints every resolved key, so the output is large but bounded. */
const SHOW_CONFIG_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const SHOW_CONFIG_TIMEOUT = "5 seconds";
const MAX_FONT_FAMILIES = 16;
const MAX_SHADERS = 8;
/** Matches the contract's per-shader source limit. */
const MAX_SHADER_BYTES = 262_144;

export class GhosttyShowConfigError extends Schema.TaggedErrorClass<GhosttyShowConfigError>()(
  "GhosttyShowConfigError",
  {
    executable: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to read the host Ghostty config with ${this.executable}.`;
  }
}

export class GhosttyShaderReadError extends Schema.TaggedErrorClass<GhosttyShaderReadError>()(
  "GhosttyShaderReadError",
  {
    path: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to read the Ghostty custom shader at ${this.path}.`;
  }
}

export interface GhosttyConfigValues {
  readonly fontFamilies: readonly string[];
  readonly fontSize: number | undefined;
  readonly colors: TerminalHostColors | undefined;
  readonly shaderPaths: readonly string[];
  readonly shaderAnimation: TerminalHostShaderAnimation;
}

function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value.at(-1);
    if ((first === '"' || first === "'") && first === last) return value.slice(1, -1);
  }
  return value;
}

/** Ghostty prints `#rrggbb`; the shorter and bare forms are accepted defensively. */
function normalizeHexColor(value: string): string | undefined {
  const raw = value.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    const [r, g, b] = raw;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  return undefined;
}

/** Indices are contiguous from 0 in real output; a gap truncates rather than shifts colors. */
function densePalette(entries: ReadonlyMap<number, string>): readonly string[] {
  const palette: string[] = [];
  for (let index = 0; index < 256; index += 1) {
    const color = entries.get(index);
    if (color === undefined) break;
    palette.push(color);
  }
  return palette;
}

/**
 * Parse `ghostty +show-config` output. Ghostty has already applied `theme`,
 * `config-file` includes, and every default, so this only has to read `key =
 * value` lines and keep the handful of keys a web terminal can honor.
 */
export function parseGhosttyShowConfig(stdout: string): GhosttyConfigValues {
  const fontFamilies: string[] = [];
  const shaderPaths: string[] = [];
  const paletteEntries = new Map<number, string>();
  let fontSize: number | undefined;
  let background: string | undefined;
  let foreground: string | undefined;
  let cursor: string | undefined;
  let cursorText: string | undefined;
  let selectionBackground: string | undefined;
  let shaderAnimation: TerminalHostShaderAnimation = "true";

  for (const line of stdout.split(/\r?\n/g)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = unquote(trimmed.slice(separator + 1).trim());
    if (value.length === 0) continue;

    switch (key) {
      case "font-family": {
        if (fontFamilies.length < MAX_FONT_FAMILIES && !fontFamilies.includes(value)) {
          fontFamilies.push(value);
        }
        break;
      }
      case "font-size": {
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed) && parsed > 0) fontSize = parsed;
        break;
      }
      case "background": {
        background = normalizeHexColor(value) ?? background;
        break;
      }
      case "foreground": {
        foreground = normalizeHexColor(value) ?? foreground;
        break;
      }
      case "cursor-color": {
        cursor = normalizeHexColor(value) ?? cursor;
        break;
      }
      case "cursor-text": {
        cursorText = normalizeHexColor(value) ?? cursorText;
        break;
      }
      case "selection-background": {
        selectionBackground = normalizeHexColor(value) ?? selectionBackground;
        break;
      }
      case "palette": {
        const paletteSeparator = value.indexOf("=");
        if (paletteSeparator <= 0) break;
        const index = Number.parseInt(value.slice(0, paletteSeparator).trim(), 10);
        const color = normalizeHexColor(value.slice(paletteSeparator + 1));
        if (Number.isInteger(index) && index >= 0 && index < 256 && color !== undefined) {
          paletteEntries.set(index, color);
        }
        break;
      }
      case "custom-shader": {
        if (shaderPaths.length < MAX_SHADERS && !shaderPaths.includes(value)) {
          shaderPaths.push(value);
        }
        break;
      }
      case "custom-shader-animation": {
        if (value === "false" || value === "true" || value === "always") shaderAnimation = value;
        break;
      }
      default:
        break;
    }
  }

  // Background and foreground anchor every other color, so a config missing
  // either one keeps the app's own terminal theme rather than half of Ghostty's.
  const colors: TerminalHostColors | undefined =
    background !== undefined && foreground !== undefined
      ? {
          background,
          foreground,
          ...(cursor !== undefined ? { cursor } : {}),
          ...(cursorText !== undefined ? { cursorText } : {}),
          ...(selectionBackground !== undefined ? { selectionBackground } : {}),
          palette: densePalette(paletteEntries),
        }
      : undefined;

  return { fontFamilies, fontSize, colors, shaderPaths, shaderAnimation };
}

/**
 * Ghostty installs its CLI inside the app bundle on macOS, which is often
 * missing from the PATH a desktop-launched server inherits.
 */
function ghosttyExecutableCandidates(
  platform: NodeJS.Platform,
  home: string | undefined,
): readonly string[] {
  if (platform === "darwin") {
    return [
      "/Applications/Ghostty.app/Contents/MacOS/ghostty",
      ...(home ? [`${home}/Applications/Ghostty.app/Contents/MacOS/ghostty`] : []),
    ];
  }
  if (platform === "linux") {
    return ["/usr/bin/ghostty", "/usr/local/bin/ghostty"];
  }
  return [];
}

const findGhosttyExecutable = Effect.fn("ghosttyAppearance.findExecutable")(function* () {
  const platform = yield* HostProcessPlatform;
  // Ghostty has no Windows build, so probing there is pure cost.
  if (platform === "win32") return undefined;

  const onPath = yield* resolveCommandPath("ghostty").pipe(
    Effect.catchTag("CommandResolutionError", () => Effect.succeed(null)),
  );
  if (onPath !== null) return onPath;

  const fileSystem = yield* FileSystem.FileSystem;
  const environment = yield* HostProcessEnvironment;
  for (const candidate of ghosttyExecutableCandidates(platform, environment.HOME?.trim())) {
    const exists = yield* fileSystem.exists(candidate).pipe(Effect.orElseSucceed(() => false));
    if (exists) return candidate;
  }
  return undefined;
});

const runShowConfig = Effect.fn("ghosttyAppearance.showConfig")(function* (executable: string) {
  const processRunner = yield* ProcessRunner.ProcessRunner;
  const result = yield* processRunner
    .run({
      command: executable,
      args: ["+show-config"],
      timeout: SHOW_CONFIG_TIMEOUT,
      timeoutBehavior: "timedOutResult",
      maxOutputBytes: SHOW_CONFIG_MAX_OUTPUT_BYTES,
      outputMode: "truncate",
    })
    .pipe(
      Effect.mapError((cause) => new GhosttyShowConfigError({ executable, cause })),
      Effect.catchTag("GhosttyShowConfigError", (error) =>
        Effect.logDebug(error.message).pipe(
          Effect.annotateLogs({ executable: error.executable, cause: error }),
          Effect.as(undefined),
        ),
      ),
    );

  if (result === undefined || result.timedOut || result.code !== 0 || result.stdoutTruncated) {
    return undefined;
  }
  return result.stdout;
});

const readShaderSources = Effect.fn("ghosttyAppearance.readShaders")(function* (
  paths: readonly string[],
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const shaders: TerminalHostShader[] = [];
  for (const path of paths) {
    const source = yield* fileSystem.readFileString(path).pipe(
      Effect.mapError((cause) => new GhosttyShaderReadError({ path, cause })),
      Effect.catchTag("GhosttyShaderReadError", (error) =>
        Effect.logDebug(error.message).pipe(
          Effect.annotateLogs({ path: error.path, cause: error }),
          Effect.as(undefined),
        ),
      ),
    );
    if (source === undefined || source.trim().length === 0) continue;
    if (Buffer.byteLength(source, "utf8") > MAX_SHADER_BYTES) {
      yield* Effect.logDebug(`Skipping oversized Ghostty custom shader at ${path}.`);
      continue;
    }
    shaders.push({ path, source });
  }
  return shaders;
});

/**
 * Resolve the host's Ghostty appearance for clients. Returns undefined whenever
 * Ghostty is absent or its config yields nothing a client could apply, which
 * leaves in-app terminals on the app's own theme.
 */
export const resolveGhosttyTerminalAppearance = Effect.fn("ghosttyAppearance.resolve")(
  function* () {
    const executable = yield* findGhosttyExecutable();
    if (executable === undefined) return undefined;

    const stdout = yield* runShowConfig(executable);
    if (stdout === undefined) return undefined;

    const parsed = parseGhosttyShowConfig(stdout);
    const shaders = yield* readShaderSources(parsed.shaderPaths);
    if (parsed.colors === undefined && parsed.fontFamilies.length === 0 && shaders.length === 0) {
      return undefined;
    }

    return {
      fontFamilies: parsed.fontFamilies,
      ...(parsed.fontSize !== undefined ? { fontSize: parsed.fontSize } : {}),
      ...(parsed.colors !== undefined ? { colors: parsed.colors } : {}),
      shaders,
      shaderAnimation: parsed.shaderAnimation,
    } satisfies TerminalHostAppearance;
  },
);
