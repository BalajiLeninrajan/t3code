/**
 * Composing in your real editor, the way `git commit` and Claude Code do it:
 * write the text to a scratch file, open `$EDITOR` on it in a terminal, and
 * read the file back when the editor exits.
 *
 * This module is the part that has no React and no I/O in it — building the
 * shell line, choosing the scratch path, and deciding from terminal activity
 * when the editor has exited — so the interesting rules are testable without a
 * browser or a PTY.
 */

/** Where scratch files live on the machine running the server. */
const SCRATCH_ROOT = "/tmp";
const SCRATCH_DIRECTORY = "t3code-compose";

export type EditorSessionKind = "draft" | "transcript";

/**
 * Single-quote for POSIX sh, ending and reopening the quote around any literal
 * quote in the path. Paths come from `editorScratchPath` today, but the whole
 * point of quoting is to not depend on that staying true.
 */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * `$EDITOR` first because that is what the user answered when asked, `$VISUAL`
 * next because that is the conventional name for a full-screen editor, and
 * nvim last so the feature still works on a machine with neither set.
 */
export function buildEditorCommand(absolutePath: string): string {
  return `\${EDITOR:-\${VISUAL:-nvim}} ${shellQuote(absolutePath)}`;
}

/**
 * A scratch path under the temp directory rather than the workspace, so
 * composing never leaves the repository dirty. `projects.writeFile` creates
 * missing parent directories, so the subdirectory needs no separate mkdir.
 *
 * `cwd` is `/tmp` rather than an OS-resolved temp dir because the client picks
 * this path and only the server knows its own `os.tmpdir()`. That makes this
 * POSIX-only, which matches a feature whose whole premise is a terminal editor.
 */
export function editorScratchPath(input: { kind: EditorSessionKind; sessionId: string }): {
  readonly cwd: string;
  readonly relativePath: string;
  readonly absolutePath: string;
} {
  const relativePath = `${SCRATCH_DIRECTORY}/${input.kind}-${input.sessionId}.md`;
  return {
    cwd: SCRATCH_ROOT,
    relativePath,
    absolutePath: `${SCRATCH_ROOT}/${relativePath}`,
  };
}

export interface EditorSessionContext {
  readonly kind: EditorSessionKind;
  readonly terminalId: string;
  readonly cwd: string;
  readonly relativePath: string;
  /**
   * Whether the file's contents come back into the composer on exit. The
   * transcript is opened to read and copy from, so its edits stay in the
   * scratch file.
   */
  readonly readBack: boolean;
}

export type EditorSessionState =
  | { readonly phase: "idle" }
  /** Command written to the terminal; the editor process has not been seen yet. */
  | ({ readonly phase: "armed" } & EditorSessionContext)
  /** The editor is running. The next time it is not, it has exited. */
  | ({ readonly phase: "editing" } & EditorSessionContext);

export type EditorSessionEvent =
  | ({ readonly type: "launched" } & EditorSessionContext)
  | { readonly type: "subprocess"; readonly terminalId: string; readonly running: boolean }
  | { readonly type: "cancelled" };

export type EditorSessionEffect = { readonly type: "read-back" } & EditorSessionContext;

export const IDLE_EDITOR_SESSION: EditorSessionState = { phase: "idle" };

/**
 * Drives the session from terminal activity. The rule that matters: a session
 * only completes on a running → not-running transition, never on the
 * not-running it starts in. Without that guard the editor "exits" in the same
 * tick it launches, and the untouched file overwrites the draft immediately.
 *
 * There is deliberately no timeout arming this. If the editor's start is never
 * observed the session simply stays armed and nothing happens — the draft is
 * left exactly as the user typed it, which is the failure worth having.
 */
export function editorSessionReducer(
  state: EditorSessionState,
  event: EditorSessionEvent,
): { readonly state: EditorSessionState; readonly effect: EditorSessionEffect | null } {
  switch (event.type) {
    case "launched": {
      const { type: _type, ...context } = event;
      return { state: { phase: "armed", ...context }, effect: null };
    }
    case "cancelled":
      return { state: IDLE_EDITOR_SESSION, effect: null };
    case "subprocess": {
      if (state.phase === "idle") return { state, effect: null };
      // Another terminal's activity says nothing about ours.
      if (event.terminalId !== state.terminalId) return { state, effect: null };
      if (state.phase === "armed") {
        return event.running
          ? { state: { ...state, phase: "editing" }, effect: null }
          : { state, effect: null };
      }
      if (event.running) return { state, effect: null };
      const { phase: _phase, ...context } = state;
      return {
        state: IDLE_EDITOR_SESSION,
        effect: context.readBack ? { type: "read-back", ...context } : null,
      };
    }
  }
}
