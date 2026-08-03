/**
 * `<leader>?` — every vim binding, rendered from the keymap itself so it can
 * never drift from what the keys actually do.
 */
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../components/ui/dialog";
import { vimCheatSheet } from "./vimKeymap";
import { useVimStateStore } from "./vimState";

export function VimCheatSheet() {
  const open = useVimStateStore((state) => state.helpOpen);
  const setHelpOpen = useVimStateStore((state) => state.setHelpOpen);
  const sections = vimCheatSheet();

  return (
    <Dialog open={open} onOpenChange={setHelpOpen}>
      <DialogPopup
        className="max-w-2xl"
        // `q` closes it, the way `:help` does.
        onKeyDown={(event) => {
          if (event.key !== "q" || event.metaKey || event.ctrlKey || event.altKey) return;
          event.preventDefault();
          setHelpOpen(false);
        }}
      >
        <DialogHeader>
          <DialogTitle>Vim keymap</DialogTitle>
          <DialogDescription>
            Normal mode only. Press Esc or q to close, ⌘/Ctrl chords keep working everywhere.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {sections.map(([section, rows]) => (
            <section key={section} className="min-w-0">
              <h3 className="mb-1.5 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                {section}
              </h3>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {rows.map((row) => (
                  <div key={`${section}-${row.desc}`} className="contents">
                    <dt className="text-right font-mono text-[11px] whitespace-nowrap text-primary">
                      {row.keys}
                    </dt>
                    <dd className="min-w-0 truncate text-[12px] text-foreground">{row.desc}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
