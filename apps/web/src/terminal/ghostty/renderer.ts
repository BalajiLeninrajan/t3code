import {
  GHOSTTY_CELL_WIDE,
  ghosttyColorsEqual,
  type GhosttyCell,
  type GhosttyColor,
  type GhosttySnapshot,
} from "./core";
import { tryDrawCustomGlyph } from "./vendor/xterm-custom-glyphs/CustomGlyphRasterizer";

export interface GhosttyCellMetrics {
  readonly width: number;
  readonly height: number;
  readonly baseline: number;
  /** Ink height of the face, without the line-height padding in `height`. */
  readonly charHeight: number;
}

/** The cell rectangle a glyph occupies, in the context's own coordinates. */
export interface GhosttyCellBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

const DEFAULT_SELECTION_BACKGROUND = "rgba(72, 122, 191, 0.35)";

function cssColor(color: GhosttyColor): string {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

function sameTextStyle(left: GhosttyCell, right: GhosttyCell): boolean {
  // Selection deliberately does not participate: it only tints the background
  // overlay, and splitting a text run at a selection boundary visibly shifts
  // glyph spacing whenever the face's true advance differs from the cell width.
  return (
    ghosttyColorsEqual(left.foreground, right.foreground) &&
    left.bold === right.bold &&
    left.italic === right.italic &&
    left.invisible === right.invisible
  );
}

export function ghosttyTextRunEnd(
  cells: readonly GhosttyCell[],
  start: number,
  sameStyle: (cell: GhosttyCell) => boolean,
): number {
  let end = start + 1;
  while (end < cells.length) {
    const next = cells[end];
    if (!next) break;
    if (next.wide === GHOSTTY_CELL_WIDE.spacerTail) {
      end += 1;
      continue;
    }
    if (next.text.length === 0 || !sameStyle(next)) break;
    end += 1;
  }
  return end;
}

function fontForCell(cell: GhosttyCell, fontSize: number, fontFamily: string): string {
  const style = cell.italic ? "italic" : "normal";
  const weight = cell.bold ? "700" : "400";
  return `${style} ${weight} ${fontSize}px ${fontFamily}`;
}

/**
 * Text the primary monospace face renders at exactly one cell per character.
 * Anything else — Nerd Font symbols, box drawing, CJK, emoji — resolves through
 * a fallback face whose advance need not match the cell the grid reserved.
 */
const PRIMARY_FACE_TEXT = /^[\u0020-\u007e\u00a0-\u017f]+$/;

/** The cell plus the spacer tails a wide glyph occupies. */
function ghosttyCellSpanEnd(cells: readonly GhosttyCell[], start: number): number {
  let end = start + 1;
  while (end < cells.length && cells[end]?.wide === GHOSTTY_CELL_WIDE.spacerTail) end += 1;
  return end;
}

/** The same handful of glyphs recur every frame, and measuring them is not free. */
const MAX_GLYPH_WIDTH_CACHE = 4096;
const glyphWidths = new Map<string, number>();
/** A character no font string contains, so the two halves of a key cannot merge. */
const GLYPH_KEY_SEPARATOR = String.fromCodePoint(0);

function measureGlyphWidth(context: CanvasRenderingContext2D, text: string): number {
  const key = `${context.font}${GLYPH_KEY_SEPARATOR}${text}`;
  const cached = glyphWidths.get(key);
  if (cached !== undefined) return cached;
  const width = context.measureText(text).width;
  if (glyphWidths.size >= MAX_GLYPH_WIDTH_CACHE) glyphWidths.clear();
  glyphWidths.set(key, width);
  return width;
}

/** The rasterizer only reports drawings it has no instructions for. */
const glyphLog = {
  error: (message: unknown, ...rest: unknown[]) => {
    console.error(message, ...rest);
  },
};

/**
 * Hand a cell to the vendored xterm.js rasterizer, which covers box drawing,
 * block elements, braille, powerline separators, sextants and octants — the
 * characters a terminal has to draw itself, because a font's own glyphs are cut
 * for the line height that font assumes and so neither tile against their
 * neighbours nor meet the segment behind them once the cell size differs.
 *
 * It expects a canvas addressed in device pixels, which is how it keeps lines
 * crisp; ours carries the ratio as a transform instead, so the transform comes
 * off for the call and the same rect goes in scaled up. The clip the caller set
 * is held in device space and so survives untouched.
 */
function drawCellGeometry(
  context: CanvasRenderingContext2D,
  text: string,
  box: GhosttyCellBox,
  metrics: GhosttyCellMetrics,
  fontSize: number,
  scale: number,
  background: string,
): boolean {
  context.save();
  context.resetTransform();
  const drawn = tryDrawCustomGlyph(
    context,
    text,
    box.left * scale,
    box.top * scale,
    box.width * scale,
    box.height * scale,
    metrics.width * scale,
    metrics.charHeight * scale,
    fontSize * scale,
    scale,
    glyphLog,
    background,
  );
  context.restore();
  return drawn;
}

/**
 * Draw one run's text inside the cells it occupies.
 *
 * Canvas's `maxWidth` condenses text horizontally only, so a glyph wider than
 * its cell comes out as a stretched sliver rather than a smaller symbol — the
 * common case being a Nerd Font icon whose fallback face advances wider than
 * the cell width measured from the primary face. Runs that can only come from
 * the primary face keep the cheap single-call path, where `maxWidth` is a no-op
 * for a true monospace face and still holds the columns of a mis-measured one.
 * Cell geometry is drawn rather than typeset, and every other fallback glyph is
 * scaled on both axes and centered, so an icon shrinks rather than distorting.
 */
function drawCellText(
  context: CanvasRenderingContext2D,
  text: string,
  box: GhosttyCellBox,
  metrics: GhosttyCellMetrics,
  fontSize: number,
  scale: number,
  background: string,
): void {
  if (PRIMARY_FACE_TEXT.test(text)) {
    context.fillText(text, box.left, box.top + metrics.baseline, box.width);
    return;
  }
  if (drawCellGeometry(context, text, box, metrics, fontSize, scale, background)) return;
  const natural = measureGlyphWidth(context, text);
  if (natural <= 0) {
    context.fillText(text, box.left, box.top + metrics.baseline);
    return;
  }
  if (natural <= box.width) {
    context.fillText(text, box.left + (box.width - natural) / 2, box.top + metrics.baseline);
    return;
  }
  context.save();
  context.translate(box.left, box.top + metrics.baseline);
  context.scale(box.width / natural, box.width / natural);
  context.fillText(text, 0, 0);
  context.restore();
}

export function measureGhosttyCell(
  context: CanvasRenderingContext2D,
  fontSize: number,
  fontFamily: string,
): GhosttyCellMetrics {
  context.font = `normal 400 ${fontSize}px ${fontFamily}`;
  const widthMeasurement = context.measureText("M");
  const verticalMeasurement = context.measureText("Mg");
  const ascent = verticalMeasurement.actualBoundingBoxAscent || fontSize;
  const descent = verticalMeasurement.actualBoundingBoxDescent;
  const glyphHeight = ascent + descent;
  const height = Math.max(1, Math.round(fontSize * 1.35), Math.ceil(glyphHeight));
  return {
    width: Math.max(1, widthMeasurement.width),
    height,
    baseline: Math.round((height - glyphHeight) / 2 + ascent),
    charHeight: Math.max(1, glyphHeight),
  };
}

export function terminalGridSize(
  width: number,
  height: number,
  metrics: GhosttyCellMetrics,
  padding: number,
): { cols: number; rows: number } {
  return {
    cols: Math.max(1, Math.floor((width - padding * 2) / metrics.width)),
    rows: Math.max(1, Math.floor((height - padding * 2) / metrics.height)),
  };
}

export function renderGhosttySnapshot(options: {
  readonly context: CanvasRenderingContext2D;
  readonly snapshot: GhosttySnapshot;
  readonly metrics: GhosttyCellMetrics;
  readonly fontSize: number;
  readonly fontFamily: string;
  readonly padding: number;
  readonly forceFull: boolean;
  readonly cursorOn: boolean;
  readonly previousCursorY?: number | null;
  readonly focused?: boolean;
  readonly selectionBackground?: string;
  /** Text color under a block cursor; defaults to the terminal background. */
  readonly cursorText?: string;
  /** Vertical origin of row 0; defaults to the horizontal padding. */
  readonly originY?: number;
  /**
   * Device pixels per context unit, so procedurally drawn cell geometry can
   * snap to the pixel grid. The surface installs a matching transform.
   */
  readonly devicePixelScale?: number;
}): void {
  const {
    context,
    snapshot,
    metrics,
    fontSize,
    fontFamily,
    padding,
    forceFull,
    cursorOn,
    previousCursorY,
  } = options;
  const focused = options.focused ?? true;
  const selectionBackground = options.selectionBackground ?? DEFAULT_SELECTION_BACKGROUND;
  const originY = options.originY ?? padding;
  const devicePixelScale = options.devicePixelScale ?? 1;
  const rowsToDraw = forceFull
    ? Array.from({ length: snapshot.rows }, (_, index) => index)
    : [...snapshot.dirtyRows];
  if (
    previousCursorY !== null &&
    previousCursorY !== undefined &&
    previousCursorY >= 0 &&
    !rowsToDraw.includes(previousCursorY)
  ) {
    rowsToDraw.push(previousCursorY);
  }
  if (snapshot.cursorVisible && snapshot.cursorY >= 0 && !rowsToDraw.includes(snapshot.cursorY)) {
    rowsToDraw.push(snapshot.cursorY);
  }

  if (forceFull) {
    context.save();
    context.resetTransform();
    context.fillStyle = cssColor(snapshot.background);
    context.fillRect(0, 0, context.canvas.width, context.canvas.height);
    context.restore();
  }

  context.textBaseline = "alphabetic";
  for (const rowIndex of rowsToDraw) {
    const row = snapshot.rowData[rowIndex];
    if (!row) continue;
    const top = originY + rowIndex * metrics.height;

    context.fillStyle = cssColor(snapshot.background);
    context.fillRect(padding, top, snapshot.cols * metrics.width, metrics.height);

    let backgroundStart = 0;
    while (backgroundStart < row.cells.length) {
      const first = row.cells[backgroundStart];
      if (!first) break;
      let backgroundEnd = backgroundStart + 1;
      while (backgroundEnd < row.cells.length) {
        const next = row.cells[backgroundEnd];
        if (
          !next ||
          next.selected !== first.selected ||
          !ghosttyColorsEqual(next.background, first.background)
        ) {
          break;
        }
        backgroundEnd += 1;
      }
      if (first.selected || !ghosttyColorsEqual(first.background, snapshot.background)) {
        const left = padding + backgroundStart * metrics.width;
        const width = (backgroundEnd - backgroundStart) * metrics.width;
        if (!ghosttyColorsEqual(first.background, snapshot.background)) {
          context.fillStyle = cssColor(first.background);
          context.fillRect(left, top, width, metrics.height);
        }
        if (first.selected) {
          context.fillStyle = selectionBackground;
          context.fillRect(left, top, width, metrics.height);
        }
      }
      backgroundStart = backgroundEnd;
    }

    let runStart = 0;
    while (runStart < row.cells.length) {
      const first = row.cells[runStart];
      if (!first) break;
      if (first.text.length === 0) {
        runStart += 1;
        continue;
      }
      // A glyph from a fallback face is fitted to its own cell, so it must not
      // be swept into a run with the primary-face text around it.
      const runEnd = PRIMARY_FACE_TEXT.test(first.text)
        ? ghosttyTextRunEnd(
            row.cells,
            runStart,
            (cell) => sameTextStyle(cell, first) && PRIMARY_FACE_TEXT.test(cell.text),
          )
        : ghosttyCellSpanEnd(row.cells, runStart);
      const text = row.cells
        .slice(runStart, runEnd)
        .map((cell) => cell.text)
        .join("");
      if (!first.invisible && text.trim().length > 0) {
        const box = {
          left: padding + runStart * metrics.width,
          top,
          width: (runEnd - runStart) * metrics.width,
          height: metrics.height,
        };
        context.save();
        context.beginPath();
        context.rect(box.left, box.top, box.width, box.height);
        context.clip();
        context.font = fontForCell(first, fontSize, fontFamily);
        context.fillStyle = cssColor(first.foreground);
        drawCellText(
          context,
          text,
          box,
          metrics,
          fontSize,
          devicePixelScale,
          cssColor(first.background),
        );
        context.restore();
      }
      runStart = runEnd;
    }

    for (let column = 0; column < row.cells.length; column += 1) {
      const cell = row.cells[column];
      if (!cell || (!cell.underline && !cell.strikethrough && !cell.overline)) continue;
      context.fillStyle = cssColor(cell.foreground);
      const left = padding + column * metrics.width;
      if (cell.underline) context.fillRect(left, top + metrics.height - 2, metrics.width, 1);
      if (cell.strikethrough) {
        context.fillRect(left, top + Math.floor(metrics.height * 0.55), metrics.width, 1);
      }
      if (cell.overline) context.fillRect(left, top + 1, metrics.width, 1);
    }
  }

  if (cursorOn && snapshot.cursorVisible && snapshot.cursorX >= 0 && snapshot.cursorY >= 0) {
    const left = padding + snapshot.cursorX * metrics.width;
    const top = originY + snapshot.cursorY * metrics.height;
    context.fillStyle = cssColor(snapshot.cursor);
    if (!focused) {
      // An unfocused terminal draws a hollow cursor so the active pane is obvious.
      context.strokeStyle = cssColor(snapshot.cursor);
      context.strokeRect(left + 0.5, top + 0.5, metrics.width - 1, metrics.height - 1);
    } else if (snapshot.cursorStyle === 0) {
      context.fillRect(left, top, 2, metrics.height);
    } else if (snapshot.cursorStyle === 2) {
      context.fillRect(left, top + metrics.height - 2, metrics.width, 2);
    } else if (snapshot.cursorStyle === 3) {
      context.strokeStyle = cssColor(snapshot.cursor);
      context.strokeRect(left + 0.5, top + 0.5, metrics.width - 1, metrics.height - 1);
    } else {
      context.fillRect(left, top, metrics.width, metrics.height);
      const cell = snapshot.rowData[snapshot.cursorY]?.cells[snapshot.cursorX];
      if (cell?.text) {
        context.font = fontForCell(cell, fontSize, fontFamily);
        context.fillStyle = options.cursorText ?? cssColor(snapshot.background);
        drawCellText(
          context,
          cell.text,
          { left, top, width: metrics.width, height: metrics.height },
          metrics,
          fontSize,
          devicePixelScale,
          cssColor(snapshot.cursor),
        );
      }
    }
  }
}
