/**
 * Local stand-ins for the two xterm.js internals the rasterizer imports, so the
 * vendored files can be copied from upstream unmodified apart from this import.
 */

/** Verbatim from xterm.js `browser/renderer/shared/RendererUtils`. */
export function throwIfFalsy<T>(value: T | undefined | null): T {
  if (!value) {
    throw new Error("value must not be falsy");
  }
  return value;
}

/** The one method the rasterizer calls on xterm.js's `ILogService`. */
export interface ILogService {
  error(message: unknown, ...optionalParams: unknown[]): void;
}
