/**
 * The vim mode indicator and which-key popup.
 *
 * Shown only while normal mode is active or a sequence is half-typed —
 * insert mode is the app behaving normally and needs no chrome.
 */
import { cn } from "../lib/utils";
import { formatVimKeys, vimContinuations } from "./vimKeymap";
import { VIM_REGION_LABELS } from "./vimRegions";
import { useVimStateStore } from "./vimState";

/** Tallest a which-key column gets before the menu splits into another one. */
const MAX_ROWS_PER_COLUMN = 8;

/** Balanced rows, so two columns are 7+6 rather than 8+5. */
function rowsPerColumn(count: number): number {
  const columns = Math.max(1, Math.ceil(count / MAX_ROWS_PER_COLUMN));
  return Math.ceil(count / columns);
}

export function VimStatusLine() {
  const mode = useVimStateStore((state) => state.mode);
  const region = useVimStateStore((state) => state.region);
  const pending = useVimStateStore((state) => state.pending);
  const continuations = vimContinuations(pending);

  // Always on. The mode is the one thing you need to know before pressing a
  // key, and hiding it in insert meant the indicator vanished exactly when you
  // were most likely to have forgotten which mode you were in.
  return (
    <div className="pointer-events-none fixed right-3 bottom-3 z-40 flex flex-col items-end gap-1.5">
      {continuations.length > 0 ? (
        <div className="max-h-[calc(100dvh-5rem)] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-lg border border-border/80 bg-popover/95 p-2 shadow-lg backdrop-blur-sm">
          <div
            className="grid grid-flow-col gap-x-5 gap-y-1"
            // Long menus wrap into balanced columns the way which-key does,
            // rather than growing a single list past the bottom of the screen.
            style={{ gridTemplateRows: `repeat(${rowsPerColumn(continuations.length)}, auto)` }}
          >
            {continuations.map((continuation) => (
              <div
                key={continuation.key}
                className="grid grid-cols-[auto_1fr] items-baseline gap-x-2.5"
              >
                <span className="text-right font-mono text-[11px] text-primary">
                  {continuation.key}
                </span>
                <span
                  className={cn(
                    "truncate text-[11px]",
                    continuation.isGroup ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {continuation.isGroup ? `+${continuation.desc}` : continuation.desc}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-1.5 rounded-md border border-border/70 bg-background/90 px-1.5 py-1 shadow-sm backdrop-blur-sm">
        <span
          className={cn(
            "rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.08em] uppercase",
            mode === "normal" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          {mode}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {VIM_REGION_LABELS[region]}
        </span>
        {pending.length > 0 ? (
          <span className="font-mono text-[10px] text-foreground">{formatVimKeys(pending)}</span>
        ) : null}
      </div>
    </div>
  );
}
