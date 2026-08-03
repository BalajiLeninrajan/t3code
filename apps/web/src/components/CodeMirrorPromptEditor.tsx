/**
 * The composer's text editor, for vim mode.
 *
 * Implements exactly the same interface as `ComposerPromptEditor` — value,
 * cursor, and callbacks, all strings and offsets — so everything above it in
 * `ChatComposer` (model picker, approvals, stash, images, send) is unchanged
 * and does not know which editor is rendering the text.
 *
 * CodeMirror is used rather than a hand-written vim layer because the vim
 * behaviour, markdown highlighting, line numbers, and block cursor are all
 * things it already does. `@replit/codemirror-vim` descends from CodeMirror 5's
 * vim, which is far more complete than anything worth maintaining here.
 */
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState, Prec, type Extension } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { vim } from "@replit/codemirror-vim";
import { tags } from "@lezer/highlight";
import { useEffect, useImperativeHandle, useRef } from "react";

import { INLINE_TERMINAL_CONTEXT_PLACEHOLDER } from "~/lib/terminalContext";
import { markdownConceal } from "./codeMirrorMarkdownConceal";
import { cn } from "~/lib/utils";
import type { ComposerPromptEditorHandle, ComposerPromptEditorProps } from "./ComposerPromptEditor";

/**
 * Catppuccin, via the theme's own palette variables so the editor follows
 * Latte and Mocha with the rest of the app instead of pinning one flavour.
 */
const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: "var(--ctp-red)", fontWeight: "600" },
  { tag: tags.strong, color: "var(--ctp-peach)", fontWeight: "600" },
  { tag: tags.emphasis, color: "var(--ctp-yellow)", fontStyle: "italic" },
  { tag: tags.strikethrough, color: "var(--ctp-overlay1)", textDecoration: "line-through" },
  { tag: tags.link, color: "var(--ctp-blue)", textDecoration: "underline" },
  { tag: tags.url, color: "var(--ctp-sapphire)" },
  { tag: tags.monospace, color: "var(--ctp-green)" },
  { tag: tags.quote, color: "var(--ctp-subtext0)", fontStyle: "italic" },
  { tag: tags.list, color: "var(--ctp-mauve)" },
  { tag: tags.contentSeparator, color: "var(--ctp-overlay0)" },
  { tag: tags.processingInstruction, color: "var(--ctp-overlay1)" },
  { tag: tags.labelName, color: "var(--ctp-lavender)" },
]);

const editorTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "var(--foreground)",
    fontSize: "13px",
    maxHeight: "12.5rem",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-content": {
    fontFamily: "var(--font-mono)",
    padding: "0",
    caretColor: "var(--ctp-rosewater)",
  },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.6" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    border: "none",
    color: "color-mix(in srgb, var(--muted-foreground) 55%, transparent)",
    paddingRight: "0.75rem",
  },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--primary)" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--primary) 28%, transparent)",
  },
  // The vim block cursor.
  ".cm-fat-cursor": {
    backgroundColor: "color-mix(in srgb, var(--primary) 45%, transparent) !important",
    outline: "1px solid color-mix(in srgb, var(--primary) 60%, transparent)",
  },
  ".cm-placeholder": { color: "var(--muted-foreground)", fontStyle: "normal" },

  // Rendered markdown on every line but the cursor's.
  ".cm-md-strong": { fontWeight: "700", color: "var(--ctp-peach)" },
  ".cm-md-emphasis": { fontStyle: "italic", color: "var(--ctp-yellow)" },
  ".cm-md-strike": { textDecoration: "line-through", color: "var(--ctp-overlay1)" },
  ".cm-md-code": {
    fontFamily: "var(--font-mono)",
    color: "var(--ctp-green)",
    backgroundColor: "color-mix(in srgb, var(--ctp-surface0) 60%, transparent)",
    borderRadius: "3px",
    padding: "0 3px",
  },
  ".cm-md-link": { color: "var(--ctp-blue)", textDecoration: "underline" },
  ".cm-md-heading-marker": { color: "var(--ctp-red)", fontWeight: "700", marginRight: "0.4em" },
  ".cm-md-h1": { color: "var(--ctp-red)" },
  ".cm-md-h2": { color: "var(--ctp-peach)" },
  ".cm-md-h3": { color: "var(--ctp-yellow)" },
  ".cm-md-h4": { color: "var(--ctp-green)" },
  ".cm-md-h5": { color: "var(--ctp-sapphire)" },
  ".cm-md-h6": { color: "var(--ctp-lavender)" },
  ".cm-md-bullet": { color: "var(--ctp-mauve)", marginRight: "0.35em" },
  ".cm-md-quote": { color: "var(--ctp-overlay1)", marginRight: "0.4em" },
});

/** Hybrid `number` + `relativenumber`: the cursor's line shows its own number. */
function relativeLineNumbers(): Extension {
  return lineNumbers({
    formatNumber: (lineNumber, state) => {
      const cursorLine = state.doc.lineAt(state.selection.main.head).number;
      if (lineNumber === cursorLine) return String(lineNumber);
      return String(Math.abs(lineNumber - cursorLine));
    },
  });
}

/**
 * Terminal contexts are referenced by placeholder characters in the prompt, so
 * which ones are still attached is a question about the text.
 */
function referencedTerminalContextIds(
  text: string,
  contexts: ComposerPromptEditorProps["terminalContexts"],
): string[] {
  const ids: string[] = [];
  let index = 0;
  for (const char of text) {
    if (char !== INLINE_TERMINAL_CONTEXT_PLACEHOLDER) continue;
    const context = contexts[index];
    if (context) ids.push(context.id);
    index += 1;
  }
  return ids;
}

export function CodeMirrorPromptEditor({
  value,
  cursor,
  terminalContexts,
  disabled,
  placeholder,
  className,
  onChange,
  onCommandKeyDown,
  onPaste,
  editorRef,
}: ComposerPromptEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Latest props for the extensions, which are built once and must not close
  // over a stale render.
  const latest = useRef({ onChange, onCommandKeyDown, terminalContexts, value, cursor });
  latest.current = { onChange, onCommandKeyDown, terminalContexts, value, cursor };
  /** True while we are pushing the controlled value in, so we do not echo it back. */
  const applyingRef = useRef(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // The composer owns these four: they drive the trigger menu and send.
    // Highest precedence so they are decided before vim sees them.
    const commandKeys = Prec.highest(
      EditorView.domEventHandlers({
        keydown: (event) => {
          const key = event.key;
          if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Enter" && key !== "Tab") {
            return false;
          }
          const handled = latest.current.onCommandKeyDown?.(key, event) ?? false;
          if (handled) event.preventDefault();
          return handled;
        },
      }),
    );

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: latest.current.value,
        extensions: [
          // Must come first: vim rebinds keys the other extensions register.
          vim(),
          relativeLineNumbers(),
          markdown(),
          syntaxHighlighting(markdownHighlightStyle),
          markdownConceal(),
          EditorView.lineWrapping,
          editorTheme,
          commandKeys,
          EditorView.editable.of(!disabled),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged && !update.selectionSet) return;
            if (applyingRef.current) return;
            const text = update.state.doc.toString();
            const head = update.state.selection.main.head;
            latest.current.onChange(
              text,
              head,
              head,
              false,
              referencedTerminalContextIds(text, latest.current.terminalContexts),
            );
          }),
        ],
      }),
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Built once; prop changes are applied through dispatches below.
  }, [disabled]);

  // Controlled value: only dispatch when the document genuinely differs, so
  // typing does not round-trip through React and fight the cursor.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    applyingRef.current = true;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      selection: { anchor: Math.max(0, Math.min(value.length, cursor)) },
    });
    applyingRef.current = false;
  }, [value, cursor]);

  useImperativeHandle(
    editorRef,
    (): ComposerPromptEditorHandle => ({
      focus: () => viewRef.current?.focus(),
      focusAt: (nextCursor: number) => {
        const view = viewRef.current;
        if (!view) return;
        const position = Math.max(0, Math.min(view.state.doc.length, nextCursor));
        view.focus();
        view.dispatch({ selection: { anchor: position }, scrollIntoView: true });
      },
      focusAtEnd: () => {
        const view = viewRef.current;
        if (!view) return;
        view.focus();
        view.dispatch({ selection: { anchor: view.state.doc.length }, scrollIntoView: true });
      },
      readSnapshot: () => {
        const view = viewRef.current;
        const text = view?.state.doc.toString() ?? latest.current.value;
        const head = view?.state.selection.main.head ?? latest.current.cursor;
        return {
          value: text,
          cursor: head,
          expandedCursor: head,
          terminalContextIds: referencedTerminalContextIds(text, latest.current.terminalContexts),
        };
      },
    }),
    [],
  );

  return (
    <div
      ref={hostRef}
      className={cn("composer-codemirror w-full", className)}
      data-vim-codemirror=""
      data-placeholder={placeholder}
      onPaste={onPaste}
    />
  );
}
