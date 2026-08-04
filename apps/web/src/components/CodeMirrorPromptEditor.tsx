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
import { EditorView, highlightActiveLineGutter, lineNumbers } from "@codemirror/view";
import { getCM, vim } from "@replit/codemirror-vim";
import { tags } from "@lezer/highlight";
import { useEffect, useImperativeHandle, useRef } from "react";

import {
  collapseExpandedComposerCursor,
  expandCollapsedComposerCursor,
  isCollapsedCursorAdjacentToInlineToken,
} from "~/composer-logic";
import { INLINE_TERMINAL_CONTEXT_PLACEHOLDER } from "~/lib/terminalContext";
import { composerChips } from "./codeMirrorComposerChips";
import { markdownConceal } from "./codeMirrorMarkdownConceal";
import { cn } from "~/lib/utils";
import { useVimStateStore } from "~/vim/vimState";
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
  // Translucent, so the character shows through rather than being repainted.
  // The package fills it opaque at highest precedence, hence `!important`.
  ".cm-fat-cursor": {
    background: "color-mix(in srgb, var(--primary) 45%, transparent) !important",
    outline: "1px solid color-mix(in srgb, var(--primary) 60%, transparent)",
  },
  "&:not(.cm-focused) .cm-fat-cursor": {
    background: "none !important",
    outline: "1px solid color-mix(in srgb, var(--primary) 45%, transparent)",
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
  ".cm-composer-chip": { display: "inline-flex", verticalAlign: "middle", lineHeight: "1" },
});

/**
 * Keys the composer's trigger menu answers to.
 *
 * The `@` / `/` menu is anchored to the composer but never takes focus, so the
 * app's dropdown handling — which keys off focus being inside an overlay —
 * cannot see it. Readline movement is mapped here instead, where the keystroke
 * actually arrives.
 */
function composerCommandKey(
  event: KeyboardEvent,
): "ArrowDown" | "ArrowUp" | "Enter" | "Tab" | null {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") return event.key;
  if (event.key === "Enter" || event.key === "Tab") return event.key;
  if (!event.ctrlKey || event.metaKey || event.altKey) return null;
  const lowered = event.key.toLowerCase();
  if (lowered === "n" || lowered === "j") return "ArrowDown";
  if (lowered === "p" || lowered === "k") return "ArrowUp";
  return null;
}

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
  const setVimMode = useVimStateStore((state) => state.setMode);
  // Latest props for the extensions, which are built once and must not close
  // over a stale render.
  const latest = useRef({ onChange, onCommandKeyDown, terminalContexts, value, cursor });
  latest.current = { onChange, onCommandKeyDown, terminalContexts, value, cursor };
  /** True while we are pushing the controlled value in, so we do not echo it back. */
  const applyingRef = useRef(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // The composer owns these: they drive the trigger menu and send. Highest
    // precedence so they are decided before vim sees them. The composer only
    // claims them while its menu is open, so anything else still reaches the
    // editor.
    const commandKeys = Prec.highest(
      EditorView.domEventHandlers({
        keydown: (event) => {
          const key = composerCommandKey(event);
          if (!key) return false;
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
          // Relative numbers depend on the cursor, but the gutter only
          // recomputes on doc/viewport changes or when a gutter line class
          // changes — not on selection. This supplies a class that tracks the
          // active line, which is what makes moving the cursor redraw them.
          highlightActiveLineGutter(),
          markdown(),
          syntaxHighlighting(markdownHighlightStyle),
          markdownConceal(),
          composerChips(() => ({
            terminalContextLabels: latest.current.terminalContexts.map(
              (context) => context.terminalLabel,
            ),
          })),
          EditorView.lineWrapping,
          editorTheme,
          commandKeys,
          EditorView.editable.of(!disabled),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged && !update.selectionSet) return;
            if (applyingRef.current) return;
            const text = update.state.doc.toString();
            // CodeMirror has one offset space — the document — but the composer
            // contract still distinguishes the collapsed cursor (chips count as
            // one) from the expanded one, so translate on the way out rather
            // than leaking CodeMirror's model upward.
            const head = update.state.selection.main.head;
            const collapsed = collapseExpandedComposerCursor(text, head);
            latest.current.onChange(
              text,
              collapsed,
              head,
              isCollapsedCursorAdjacentToInlineToken(text, collapsed, "left") ||
                isCollapsedCursorAdjacentToInlineToken(text, collapsed, "right"),
              referencedTerminalContextIds(text, latest.current.terminalContexts),
            );
          }),
        ],
      }),
    });
    viewRef.current = view;

    // The app needs to know which mode the editor is in — to show it, and to
    // decide whether a key like <Space> is the leader or a literal space.
    // Subscribe to the editor rather than inferring it from the DOM: mode
    // changes on keystrokes, which fire no event the app would otherwise see.
    const cm = getCM(view);
    const onModeChange = (event: { mode: string }) => {
      setVimMode(
        event.mode === "insert" ? "insert" : event.mode.startsWith("visual") ? "visual" : "normal",
      );
    };
    cm?.on("vim-mode-change", onModeChange);
    // CodeMirror starts in normal mode; say so rather than leaving the app on
    // whatever the last non-editor focus implied.
    setVimMode("normal");

    return () => {
      cm?.off("vim-mode-change", onModeChange);
      view.destroy();
      viewRef.current = null;
    };
    // Built once; prop changes are applied through dispatches below.
  }, [disabled, setVimMode]);

  // Controlled value: only dispatch when the document genuinely differs, so
  // typing does not round-trip through React and fight the cursor.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    const expanded = expandCollapsedComposerCursor(value, cursor);
    applyingRef.current = true;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      selection: { anchor: Math.max(0, Math.min(value.length, expanded)) },
    });
    applyingRef.current = false;
  }, [value, cursor]);

  useImperativeHandle(
    editorRef,
    (): ComposerPromptEditorHandle => ({
      focus: () => viewRef.current?.focus(),
      // Callers pass a collapsed cursor, which is the composer's currency.
      focusAt: (nextCursor: number) => {
        const view = viewRef.current;
        if (!view) return;
        const text = view.state.doc.toString();
        const expanded = expandCollapsedComposerCursor(text, nextCursor);
        const position = Math.max(0, Math.min(view.state.doc.length, expanded));
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
          cursor: collapseExpandedComposerCursor(text, head),
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
