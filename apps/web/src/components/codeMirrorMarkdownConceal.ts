/**
 * `render-markdown.nvim`-style rendering for the composer.
 *
 * Every line renders its markdown — `**bold**` shows as bold with the asterisks
 * hidden, headings get a marker, list bullets become glyphs — except the line
 * the cursor is on, which falls back to raw source so you can edit the syntax
 * you are standing in. That is nvim's `conceallevel=2` with anti-conceal, which
 * is what LazyVim's markdown extra ships.
 *
 * Everything is a decoration over the real document: the text never changes, so
 * the prompt that gets sent is exactly what was typed.
 */
import { syntaxTree } from "@codemirror/language";
import { type Extension, type Range } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";

/** Heading markers, by level, matching render-markdown's defaults. */
const HEADING_MARKERS = ["󰲡", "󰲣", "󰲥", "󰲧", "󰲩", "󰲫"];
/** Nested list bullets, cycling the way render-markdown does. */
const BULLETS = ["●", "○", "◆", "◇"];

class GlyphWidget extends WidgetType {
  constructor(
    private readonly glyph: string,
    private readonly className: string,
  ) {
    super();
  }

  override eq(other: GlyphWidget): boolean {
    return other.glyph === this.glyph && other.className === this.className;
  }

  override toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = this.className;
    span.textContent = this.glyph;
    return span;
  }
}

const hidden = Decoration.replace({});
const strongMark = Decoration.mark({ class: "cm-md-strong" });
const emphasisMark = Decoration.mark({ class: "cm-md-emphasis" });
const strikeMark = Decoration.mark({ class: "cm-md-strike" });
const codeMark = Decoration.mark({ class: "cm-md-code" });
const linkMark = Decoration.mark({ class: "cm-md-link" });

/** Node types whose syntax markers are hidden and whose content is styled. */
const INLINE_STYLES: Readonly<Record<string, Decoration>> = {
  StrongEmphasis: strongMark,
  Emphasis: emphasisMark,
  Strikethrough: strikeMark,
  InlineCode: codeMark,
};

function buildDecorations(view: EditorView): DecorationSet {
  const builder: Range<Decoration>[] = [];
  const { state } = view;
  // Anti-conceal: the cursor's line stays raw so its syntax is editable.
  const cursorLine = state.doc.lineAt(state.selection.main.head).number;

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const line = state.doc.lineAt(node.from);
        if (line.number === cursorLine) return;

        const inlineStyle = INLINE_STYLES[node.name];
        if (inlineStyle) {
          builder.push(inlineStyle.range(node.from, node.to));
          return;
        }

        switch (node.name) {
          case "HeaderMark": {
            const level = Math.min(HEADING_MARKERS.length, node.to - node.from);
            const marker = HEADING_MARKERS[level - 1];
            if (!marker) return;
            builder.push(
              Decoration.replace({
                widget: new GlyphWidget(marker, `cm-md-heading-marker cm-md-h${level}`),
              }).range(node.from, node.to),
            );
            return;
          }
          case "ListMark": {
            const text = state.doc.sliceString(node.from, node.to);
            // Ordered lists keep their numbers; only bullets become glyphs.
            if (/^\d/.test(text)) return;
            const depth = Math.floor((node.from - line.from) / 2) % BULLETS.length;
            const bullet = BULLETS[depth] ?? BULLETS[0] ?? "●";
            builder.push(
              Decoration.replace({ widget: new GlyphWidget(bullet, "cm-md-bullet") }).range(
                node.from,
                node.to,
              ),
            );
            return;
          }
          case "EmphasisMark":
          case "CodeMark":
          case "StrikethroughMark":
            builder.push(hidden.range(node.from, node.to));
            return;
          case "QuoteMark":
            builder.push(
              Decoration.replace({ widget: new GlyphWidget("▎", "cm-md-quote") }).range(
                node.from,
                node.to,
              ),
            );
            return;
          case "URL":
          case "LinkMark":
            // A link renders as its label; the destination is what gets hidden.
            builder.push(hidden.range(node.from, node.to));
            return;
          case "LinkLabel":
            builder.push(linkMark.range(node.from, node.to));
            return;
          default:
            return;
        }
      },
    });
  }

  // Decoration sets must be sorted, and the tree walk emits marks and
  // replacements out of order relative to each other.
  builder.sort((left, right) => left.from - right.from || left.to - right.to);
  return Decoration.set(builder, true);
}

export function markdownConceal(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }

      update(update: ViewUpdate) {
        // Selection changes matter as much as edits: moving the cursor onto a
        // line is what reveals its source.
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
      // A replaced range must not be steppable into, or arrow keys stall on
      // hidden syntax.
      provide: (plugin) =>
        EditorView.atomicRanges.of((view) => view.plugin(plugin)?.decorations ?? Decoration.none),
    },
  );
}
