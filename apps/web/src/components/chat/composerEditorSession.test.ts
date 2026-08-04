import { describe, expect, it } from "vite-plus/test";

import {
  buildEditorCommand,
  editorScratchPath,
  editorSessionReducer,
  IDLE_EDITOR_SESSION,
  shellQuote,
  type EditorSessionContext,
  type EditorSessionState,
} from "./composerEditorSession";

const CONTEXT: EditorSessionContext = {
  kind: "draft",
  terminalId: "terminal-2",
  cwd: "/tmp",
  relativePath: "t3code-compose/draft-abc.md",
  readBack: true,
};

function armed(overrides: Partial<EditorSessionContext> = {}): EditorSessionState {
  return { phase: "armed", ...CONTEXT, ...overrides };
}

function editing(overrides: Partial<EditorSessionContext> = {}): EditorSessionState {
  return { phase: "editing", ...CONTEXT, ...overrides };
}

describe("shellQuote", () => {
  it("wraps a plain path in single quotes", () => {
    expect(shellQuote("/tmp/draft.md")).toBe("'/tmp/draft.md'");
  });

  it("survives a path containing a single quote", () => {
    expect(shellQuote("/tmp/it's here.md")).toBe(`'/tmp/it'\\''s here.md'`);
  });

  it("leaves shell metacharacters inert", () => {
    expect(shellQuote("/tmp/a b;rm -rf $HOME.md")).toBe("'/tmp/a b;rm -rf $HOME.md'");
  });
});

describe("buildEditorCommand", () => {
  it("prefers $EDITOR, then $VISUAL, then nvim", () => {
    expect(buildEditorCommand("/tmp/draft.md")).toBe("${EDITOR:-${VISUAL:-nvim}} '/tmp/draft.md'");
  });
});

describe("editorScratchPath", () => {
  it("keeps the file outside the workspace", () => {
    expect(editorScratchPath({ kind: "draft", sessionId: "abc" })).toEqual({
      cwd: "/tmp",
      relativePath: "t3code-compose/draft-abc.md",
      absolutePath: "/tmp/t3code-compose/draft-abc.md",
    });
  });

  it("gives the two kinds distinct paths", () => {
    const draft = editorScratchPath({ kind: "draft", sessionId: "abc" });
    const transcript = editorScratchPath({ kind: "transcript", sessionId: "abc" });
    expect(draft.absolutePath).not.toBe(transcript.absolutePath);
  });
});

describe("editorSessionReducer", () => {
  it("arms on launch", () => {
    const { state, effect } = editorSessionReducer(IDLE_EDITOR_SESSION, {
      type: "launched",
      ...CONTEXT,
    });
    expect(state).toEqual(armed());
    expect(effect).toBeNull();
  });

  it("stays armed through the not-running it launches into", () => {
    // The guard that matters: without it the editor "exits" before it starts
    // and the untouched file immediately overwrites the draft.
    const { state, effect } = editorSessionReducer(armed(), {
      type: "subprocess",
      terminalId: CONTEXT.terminalId,
      running: false,
    });
    expect(state).toEqual(armed());
    expect(effect).toBeNull();
  });

  it("reads back on the running to not-running transition", () => {
    const started = editorSessionReducer(armed(), {
      type: "subprocess",
      terminalId: CONTEXT.terminalId,
      running: true,
    });
    expect(started.state).toEqual(editing());

    const exited = editorSessionReducer(started.state, {
      type: "subprocess",
      terminalId: CONTEXT.terminalId,
      running: false,
    });
    expect(exited.state).toEqual(IDLE_EDITOR_SESSION);
    expect(exited.effect).toEqual({ type: "read-back", ...CONTEXT });
  });

  it("ignores activity from a different terminal", () => {
    expect(
      editorSessionReducer(editing(), {
        type: "subprocess",
        terminalId: "terminal-9",
        running: false,
      }),
    ).toEqual({ state: editing(), effect: null });
  });

  it("ends without reading back when the session does not want the text", () => {
    const context = { ...CONTEXT, kind: "transcript" as const, readBack: false };
    const exited = editorSessionReducer(
      { phase: "editing", ...context },
      { type: "subprocess", terminalId: context.terminalId, running: false },
    );
    expect(exited.state).toEqual(IDLE_EDITOR_SESSION);
    expect(exited.effect).toBeNull();
  });

  it("ignores terminal activity while idle", () => {
    expect(
      editorSessionReducer(IDLE_EDITOR_SESSION, {
        type: "subprocess",
        terminalId: CONTEXT.terminalId,
        running: true,
      }),
    ).toEqual({ state: IDLE_EDITOR_SESSION, effect: null });
  });

  it("abandons an in-flight session on cancel", () => {
    expect(editorSessionReducer(editing(), { type: "cancelled" })).toEqual({
      state: IDLE_EDITOR_SESSION,
      effect: null,
    });
  });
});
