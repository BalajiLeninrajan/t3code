/**
 * Runs the open-in-`$EDITOR` round trip: stage the text in a scratch file, run
 * the editor on it in a thread terminal, and read the file back when the
 * editor exits.
 *
 * The exit signal is `hasRunningSubprocess`, which the server already streams
 * for every terminal and which the chat view already subscribes to in order to
 * decide whether a terminal is busy. So this watches a list it is handed rather
 * than opening a second stream, and there is no sentinel echo or ANSI parsing
 * anywhere in the flow.
 */
import type { EnvironmentId } from "@t3tools/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";

import {
  buildEditorCommand,
  editorScratchPath,
  editorSessionReducer,
  IDLE_EDITOR_SESSION,
  type EditorSessionKind,
  type EditorSessionState,
} from "./composerEditorSession";

export interface ComposerEditorSessionInput {
  readonly environmentId: EnvironmentId;
  /** Terminal ids currently running a subprocess, as the chat view already computes them. */
  readonly runningTerminalIds: ReadonlyArray<string>;
  /** Opens a terminal, runs `command` in it, and resolves with the terminal's id. */
  readonly runTerminalCommand: (input: {
    readonly command: string;
    readonly errorLabel: string;
    readonly preferNewTerminal?: boolean;
    readonly openDrawer?: boolean;
  }) => Promise<string | null>;
  /** Called with the edited text when a read-back session's editor exits. */
  readonly onReadBack: (contents: string) => void;
  /** Called once the editor has exited, so its terminal can be reaped. */
  readonly onSessionEnded: (terminalId: string) => void;
  readonly onError: (message: string) => void;
}

export interface ComposerEditorSession {
  readonly openInEditor: (input: {
    readonly kind: EditorSessionKind;
    readonly contents: string;
  }) => void;
  /**
   * The terminal the editor is running in, while it is running. The composer
   * renders it in place of the prompt box, so this is state rather than a ref.
   */
  readonly activeTerminalId: string | null;
}

interface ReadTarget {
  readonly cwd: string;
  readonly relativePath: string;
}

export function useComposerEditorSession(input: ComposerEditorSessionInput): ComposerEditorSession {
  const {
    environmentId,
    runningTerminalIds,
    runTerminalCommand,
    onReadBack,
    onSessionEnded,
    onError,
  } = input;
  const writeProjectFile = useAtomCommand(projectEnvironment.writeFile, { reportFailure: false });

  // A ref rather than state: nothing renders from the session, and re-rendering
  // the chat view on every terminal activity event would be a real cost.
  const sessionRef = useRef<EditorSessionState>(IDLE_EDITOR_SESSION);
  const sessionCounterRef = useRef(0);
  const [readTarget, setReadTarget] = useState<ReadTarget | null>(null);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);

  // The chat view passes these as inline closures, so pinning them here keeps
  // the effect below driven by the data it actually cares about.
  const callbacks = useRef({ onReadBack, onSessionEnded, onError });
  callbacks.current = { onReadBack, onSessionEnded, onError };
  const runningTerminalIdsRef = useRef(runningTerminalIds);
  runningTerminalIdsRef.current = runningTerminalIds;

  const scratchFile = useEnvironmentQuery(
    readTarget === null ? null : projectEnvironment.readFile({ environmentId, input: readTarget }),
  );

  useEffect(() => {
    const session = sessionRef.current;
    if (session.phase === "idle") return;
    const { state, effect } = editorSessionReducer(session, {
      type: "subprocess",
      terminalId: session.terminalId,
      running: runningTerminalIds.includes(session.terminalId),
    });
    sessionRef.current = state;
    if (state.phase === "idle") {
      setActiveTerminalId(null);
      // Nothing renders this terminal once the editor is gone, and leaving it
      // behind would pile up a dead tab per session.
      callbacks.current.onSessionEnded(session.terminalId);
    }
    if (effect) {
      setReadTarget({ cwd: effect.cwd, relativePath: effect.relativePath });
    }
  }, [runningTerminalIds]);

  useEffect(() => {
    if (readTarget === null) return;
    if (scratchFile.error !== null) {
      setReadTarget(null);
      callbacks.current.onError("Could not read back what you wrote in the editor.");
      return;
    }
    const file = scratchFile.data;
    if (file === null) return;
    setReadTarget(null);
    if (file.truncated) {
      callbacks.current.onError("That file was too large to read back in full.");
      return;
    }
    callbacks.current.onReadBack(file.contents.trimEnd());
  }, [readTarget, scratchFile.data, scratchFile.error]);

  const openInEditor = useCallback(
    (request: { kind: EditorSessionKind; contents: string }) => {
      void (async () => {
        sessionCounterRef.current += 1;
        // Unique per session, which also means each read goes to a path the
        // query layer has never cached.
        const sessionId = `${Date.now().toString(36)}-${sessionCounterRef.current}`;
        const scratch = editorScratchPath({ kind: request.kind, sessionId });

        const written = await writeProjectFile({
          environmentId,
          input: {
            cwd: scratch.cwd,
            relativePath: scratch.relativePath,
            contents: request.contents,
          },
        });
        if (written._tag !== "Success") {
          onError("Could not stage a file for the editor.");
          return;
        }

        // Always a fresh terminal. Reusing the active one would drop the editor
        // on top of whatever the user was already looking at, and a full-screen
        // editor is not something you want sharing a buffer.
        const terminalId = await runTerminalCommand({
          command: buildEditorCommand(scratch.absolutePath),
          errorLabel: "Could not open your editor.",
          preferNewTerminal: true,
          openDrawer: false,
        });
        if (terminalId === null) return;

        const launched = editorSessionReducer(IDLE_EDITOR_SESSION, {
          type: "launched",
          kind: request.kind,
          terminalId,
          cwd: scratch.cwd,
          relativePath: scratch.relativePath,
          // The transcript is opened to read and copy from; pulling it back
          // into the composer would replace the draft with the conversation.
          readBack: request.kind === "draft",
        });
        // Opening the terminal is awaited, so the editor can already be running
        // by the time the session exists — and the activity event that said so
        // arrived while there was no session to hear it. Settle against the
        // current state immediately or that session waits for an edge that has
        // already gone past.
        sessionRef.current = editorSessionReducer(launched.state, {
          type: "subprocess",
          terminalId,
          running: runningTerminalIdsRef.current.includes(terminalId),
        }).state;
        setActiveTerminalId(terminalId);
      })();
    },
    [environmentId, onError, runTerminalCommand, writeProjectFile],
  );

  return { openInEditor, activeTerminalId };
}
