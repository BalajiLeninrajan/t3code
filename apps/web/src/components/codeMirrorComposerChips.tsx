/**
 * Inline chips for the CodeMirror composer: file mentions, skills, and
 * terminal contexts rendered as atoms instead of their serialized text.
 *
 * The document always holds the real serialized prompt — a mention stays
 * `[app.ts](src/app.ts)` in the text that gets sent — and the chip is a
 * decoration drawn over it. That keeps one set of offsets: the document's.
 * Lexical needed two coordinate spaces because its chips replaced the text.
 *
 * As with the markdown conceal, the cursor's line shows its raw source so the
 * syntax you are standing in stays editable.
 */
import { type Extension, type Range } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { collectComposerInlineTokens } from "@t3tools/shared/composerInlineTokens";
import { createRoot, type Root } from "react-dom/client";

import { FILE_TAG_CHIP_CLASS_NAME, FileTagChipContent } from "./chat/FileTagChip";
import {
  COMPOSER_INLINE_CHIP_ICON_CLASS_NAME,
  COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME,
  COMPOSER_INLINE_SKILL_CHIP_CLASS_NAME,
  SKILL_CHIP_ICON_SVG,
} from "./composerInlineChip";
import { INLINE_TERMINAL_CONTEXT_PLACEHOLDER } from "~/lib/terminalContext";
import { basenameOfPath } from "~/pierre-icons";

function resolvedThemeFromDocument(): "light" | "dark" {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Renders a React chip inside a CodeMirror widget. */
class ReactChipWidget extends WidgetType {
  private root: Root | null = null;

  constructor(
    private readonly key: string,
    private readonly render: () => React.ReactElement,
  ) {
    super();
  }

  override eq(other: ReactChipWidget): boolean {
    return other.key === this.key;
  }

  override toDOM(): HTMLElement {
    const host = document.createElement("span");
    host.className = "cm-composer-chip";
    host.setAttribute("contenteditable", "false");
    this.root = createRoot(host);
    this.root.render(this.render());
    return host;
  }

  override destroy(): void {
    // Unmount off the current task: React refuses to tear a root down while it
    // is rendering, which is exactly when CodeMirror discards the widget.
    const root = this.root;
    this.root = null;
    if (root) queueMicrotask(() => root.unmount());
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

function mentionWidget(path: string): ReactChipWidget {
  return new ReactChipWidget(`mention:${path}`, () => (
    <span className={FILE_TAG_CHIP_CLASS_NAME} data-composer-mention-chip="true">
      <FileTagChipContent
        path={path}
        label={basenameOfPath(path)}
        theme={resolvedThemeFromDocument()}
      />
    </span>
  ));
}

function skillWidget(name: string): ReactChipWidget {
  return new ReactChipWidget(`skill:${name}`, () => (
    <span className={COMPOSER_INLINE_SKILL_CHIP_CLASS_NAME} data-composer-skill-chip="true">
      <span
        aria-hidden="true"
        className={COMPOSER_INLINE_CHIP_ICON_CLASS_NAME}
        dangerouslySetInnerHTML={{ __html: SKILL_CHIP_ICON_SVG }}
      />
      <span className={COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME}>{name}</span>
    </span>
  ));
}

function terminalContextWidget(label: string): ReactChipWidget {
  return new ReactChipWidget(`terminal:${label}`, () => (
    <span className={COMPOSER_INLINE_SKILL_CHIP_CLASS_NAME} data-composer-terminal-chip="true">
      <span className={COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME}>{label}</span>
    </span>
  ));
}

export interface ComposerChipContext {
  /** Labels for the terminal contexts referenced by placeholder, in order. */
  readonly terminalContextLabels: ReadonlyArray<string>;
}

function buildChipDecorations(view: EditorView, context: ComposerChipContext): DecorationSet {
  const { state } = view;
  const text = state.doc.toString();
  const cursorLine = state.doc.lineAt(state.selection.main.head).number;
  const builder: Range<Decoration>[] = [];

  const onCursorLine = (from: number) => state.doc.lineAt(from).number === cursorLine;

  for (const token of collectComposerInlineTokens(text)) {
    if (onCursorLine(token.start)) continue;
    const widget = token.type === "mention" ? mentionWidget(token.value) : skillWidget(token.value);
    builder.push(Decoration.replace({ widget }).range(token.start, token.end));
  }

  let placeholderIndex = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== INLINE_TERMINAL_CONTEXT_PLACEHOLDER) continue;
    const label = context.terminalContextLabels[placeholderIndex] ?? "terminal";
    placeholderIndex += 1;
    if (onCursorLine(index)) continue;
    builder.push(
      Decoration.replace({ widget: terminalContextWidget(label) }).range(index, index + 1),
    );
  }

  builder.sort((left, right) => left.from - right.from || left.to - right.to);
  return Decoration.set(builder, true);
}

export function composerChips(getContext: () => ComposerChipContext): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildChipDecorations(view, getContext());
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = buildChipDecorations(update.view, getContext());
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
      // A chip is one unit to the arrow keys, which is what Lexical was
      // hand-rolling with its cursor-adjacency checks.
      provide: (plugin) =>
        EditorView.atomicRanges.of((view) => view.plugin(plugin)?.decorations ?? Decoration.none),
    },
  );
}
