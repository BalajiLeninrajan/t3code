/**
 * The `/transcript` viewer: the whole conversation as a vim scratch buffer.
 *
 * The chat view renders messages as rich components, which is right for
 * reading but awkward for lifting text out of. This is the same content as
 * markdown in an editor — a *normal* buffer, not a locked one, so every motion,
 * operator, and register works. Edits are local scratch: nothing here is ever
 * written back to the thread, and `:w` is harmless because this vim has no
 * file to save to. Escape closes the viewer.
 */
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { vim } from "@replit/codemirror-vim";
import { useCallback, useRef } from "react";

import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";

const transcriptHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: "var(--ctp-mauve)", fontWeight: "700" },
  { tag: tags.strong, color: "var(--ctp-peach)", fontWeight: "600" },
  { tag: tags.emphasis, color: "var(--ctp-yellow)", fontStyle: "italic" },
  { tag: tags.link, color: "var(--ctp-blue)", textDecoration: "underline" },
  { tag: tags.url, color: "var(--ctp-sapphire)" },
  { tag: tags.monospace, color: "var(--ctp-green)" },
  { tag: tags.quote, color: "var(--ctp-subtext0)", fontStyle: "italic" },
  { tag: tags.list, color: "var(--ctp-mauve)" },
]);

const transcriptTheme = EditorView.theme({
  "&": { backgroundColor: "transparent", color: "var(--foreground)", fontSize: "13px" },
  "&.cm-focused": { outline: "none" },
  ".cm-content": { fontFamily: "var(--font-mono)" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.65" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    border: "none",
    color: "color-mix(in srgb, var(--muted-foreground) 55%, transparent)",
  },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--primary)" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-fat-cursor": {
    background: "color-mix(in srgb, var(--primary) 45%, transparent) !important",
    outline: "1px solid color-mix(in srgb, var(--primary) 60%, transparent)",
  },
});

export function TranscriptViewDialog({
  open,
  transcript,
  title,
  onOpenChange,
}: {
  open: boolean;
  transcript: string;
  title: string;
  onOpenChange: (open: boolean) => void;
}) {
  const viewRef = useRef<EditorView | null>(null);

  // A callback ref rather than an effect: the dialog portals its content, so
  // the host node is not attached when an effect keyed on `open` would run —
  // it mounted with an empty editor every time. This fires exactly when the
  // node arrives, and again with null when it leaves.
  const attachEditor = useCallback(
    (host: HTMLDivElement | null) => {
      viewRef.current?.destroy();
      viewRef.current = null;
      if (!host) return;

      const view = new EditorView({
        parent: host,
        state: EditorState.create({
          doc: transcript,
          extensions: [
            vim(),
            lineNumbers(),
            markdown(),
            syntaxHighlighting(transcriptHighlightStyle),
            EditorView.lineWrapping,
            transcriptTheme,
          ],
        }),
      });
      viewRef.current = view;
      view.focus();
    },
    [transcript],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            A scratch vim buffer of this conversation. Every motion and operator works; edits stay
            here and never reach the thread. Escape closes.
          </DialogDescription>
        </DialogHeader>
        <div ref={attachEditor} className="max-h-[70vh] overflow-auto px-6 pb-6" />
      </DialogPopup>
    </Dialog>
  );
}
