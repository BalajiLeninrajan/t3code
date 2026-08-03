# Keybindings

Edit keybindings from **Settings** → **Keybindings**. That page lists every command, its current
shortcut, whether it is a default or your own, and warns about conflicts.

The same configuration lives in `~/.t3/userdata/keybindings.json` on the machine running the
server, if you prefer editing it directly. T3 Code writes the built-in defaults into that file on
first run, and adds any new defaults on later startups unless a rule of yours already claims the
command or the shortcut.

The file is a JSON array of rules.

```json
[
  { "key": "mod+g", "command": "terminal.toggle" },
  { "key": "mod+shift+g", "command": "terminal.new", "when": "terminalFocus" }
]
```

Invalid rules are ignored. An invalid file is ignored entirely, and the server logs a warning.

## Rule Shape

- `key` (required): shortcut string, like `mod+j`, `ctrl+k`, `cmd+shift+d`
- `command` (required): the command ID to run
- `when` (optional): boolean expression controlling when the shortcut is active

## Key Syntax

Modifiers: `mod` (`cmd` on macOS, `ctrl` elsewhere), `cmd` / `meta`, `ctrl` / `control`, `shift`,
`alt` / `option`.

Examples: `mod+j`, `mod+shift+d`, `ctrl+l`, `cmd+k`.

## Commands

Commands are IDs like `terminal.toggle`, `commandPalette.toggle`, `preview.refresh`, and
`chat.new`. Project scripts are addressable as `script.{id}.run`, for example `script.test.run`.

`filePicker.toggle` opens file search for the active project and defaults to `mod+p`.
`projectSearch.toggle` searches inside the active project's files and defaults to `mod+shift+f`.
Repeating either shortcut closes that search, and switching shortcuts replaces the open search.

The command palette searches active thread titles, projects, branches, user messages, and final
agent responses across connected environments. Message matches show one labeled excerpt while
keeping the thread's project, branch, and machine context visible. Message search begins after two
characters and uses SQLite's ASCII case-insensitive matching.

The full command list and the current defaults are shown in **Settings** → **Keybindings**, which
always matches the build you are running. Use that rather than a copied list.

Note that `chat.new` and `chat.newLocal` both create a thread through the same path. A new thread
inherits the project you were in, along with model and mode selections. Branch, worktree, and
environment mode always come from your configured defaults, not from the thread you were looking
at. To keep a worktree, use the explicit "new thread in this worktree" action in the branch
toolbar. The only difference between the two commands: with the current sidebar and more than one
project, `chat.new` opens a project chooser first.

## `when` Conditions

A `when` expression is evaluated against context keys describing the current UI state. The keys
the app supplies today are `terminalFocus`, `terminalOpen`, `previewFocus`, `previewOpen`, and
`modelPickerOpen`. The set is open and grows over time, so treat that as the current list rather
than a fixed one. Any key the running app does not supply evaluates to `false`.

Operators: `!` (not), `&&` (and), `||` (or), and parentheses.

Examples:

- `"when": "terminalFocus"`
- `"when": "terminalOpen && !terminalFocus"`
- `"when": "!terminalFocus"`

## Precedence

- Rules are evaluated in array order.
- For a key event, the last rule where both `key` matches and `when` evaluates to `true` wins.
- Precedence is across commands, not only within the same command. A later rule for a different
  command can take a key away from an earlier one.

## Vim Mode

Turn on **Settings** → **Keybindings** → **Vim mode** for modal navigation modelled on LazyVim.
Everything below is on top of your configured keybindings — ⌘/⌥ shortcuts keep working exactly as
they do with vim mode off.

T3 Code is modal in the way an editor is. Focus inside a text field is **insert** mode and behaves
normally; everywhere else is **normal** mode, where unmodified keys are commands. A small indicator
in the bottom-right corner shows the current mode, the pane you are in, and any half-typed
sequence, with a which-key popup listing what can come next.

Press `<Space>?` for the full keymap at any time. It is generated from the bindings themselves, so
it always matches the build you are running — prefer it over this page.

A half-typed sequence stays on screen until it completes, hits a key that cannot continue it, or
you cancel it with `Esc`. It never times out.

### The composer is a buffer

`Esc` (or `⌃[`) in the composer puts you in normal mode **inside the prompt**, with the caret where
you left it, drawn as a block over the character it sits on. A second `Esc` leaves the composer for
the surrounding app; `i`, `a`, `I`, `A`, `o`, `O`, `c` and `s` put you back into insert.

There is only one mode. The composer is a place normal mode applies, not a mode of its own, so the
leader still works from inside it — `<Space>`, `:`, and the `⌃w` window keys keep their app-wide
meaning there. Everything else goes to the buffer.

|              |                                                                    |
| ------------ | ------------------------------------------------------------------ |
| Motions      | `h j k l`, `w W b B e E`, `0 ^ $`, `gg G`, `f F t T`, `; ,`, `{ }` |
| Operators    | `d c y > <` over any motion, plus `dd cc yy`                       |
| Text objects | `iw aw`, `i" a"`, `i( a(`, `i[ a[`, `i{ a{` — so `ciw`, `di"`      |
| Edits        | `x X D C Y r s S J ~ p P` and `.` to repeat                        |
| Visual       | `v` charwise, `V` linewise, then `d c y`                           |
| Registers    | `"a` through `"z`, plus macros with `q` and `@`                    |
| Search       | `/` `?` `n` `N`                                                    |
| History      | `u` undo, `⌃r` redo                                                |

Counts work where you would expect them: `3w`, `d2w`, `2dd`.

### Windows

Panes are windows: the thread sidebar, the chat transcript, the terminal drawer, and the right
panel.

| Key                             | Action                               |
| ------------------------------- | ------------------------------------ |
| `⌃h` / `⌃l`                     | Window left / right                  |
| `⌃j` / `⌃k`                     | Window down (terminal) / up          |
| `⌃w` then `h` `j` `k` `l`       | Same, with the vim window prefix     |
| `<Space>w` then `h` `j` `k` `l` | Same, discoverable through which-key |

The terminal drawer is a normal-mode window like any other, so `⌃k` gets you back out of it. Press
`i` inside it to hand the keyboard to the shell; from there the terminal toggle (`⌘J`, or
`<Space>ft`) leaves again.

### Motions

| Key         | Action                                                              |
| ----------- | ------------------------------------------------------------------- |
| `h` / `l`   | Left / right within a card grid                                     |
| `j` / `k`   | Down / up — moves between threads in the sidebar, scrolls elsewhere |
| `⌃d` / `⌃u` | Half page down / up                                                 |
| `⌃f` / `⌃b` | Page down / up                                                      |
| `gg` / `G`  | Top / bottom                                                        |
| `/`         | Focus the current window's search field                             |

Card grids — such as the right panel's "Open a surface" picker — are cursors: entering that pane
highlights the first card, `hjkl` moves the highlight, and `Enter` opens it.

### Threads are buffers

| Key         | Action                 |
| ----------- | ---------------------- |
| `H` / `L`   | Previous / next thread |
| `[b` / `]b` | Previous / next thread |
| `o`         | New thread             |

### Leader

`<Space>` is the leader.

| Key              | Action                                                                               |
| ---------------- | ------------------------------------------------------------------------------------ |
| `<Space><Space>` | Find file                                                                            |
| `<Space>,`       | Switch thread (command palette)                                                      |
| `<Space>/`       | Grep the project                                                                     |
| `<Space>?`       | Show the full vim keymap                                                             |
| `<Space>e`       | Toggle the sidebar                                                                   |
| `<Space>o`       | Open in your editor                                                                  |
| `<Space>b`       | **buffer** — `bb` other, `bp` previous, `bn` next thread                             |
| `<Space>c`       | **composer** — `cs` stash the prompt                                                 |
| `<Space>f`       | **file/find** — `ff` find file, `fn` new thread, `fN` new thread here, `ft` terminal |
| `<Space>g`       | **git** — `gc` commit and push, `gg` / `gd` toggle the diff                          |
| `<Space>m`       | **model** — `mm` model, `mr` reasoning, `ma` access, `mp` plan / build               |
| `<Space>s`       | **search** — `sf` find file, `sg` grep, `sk` this keybindings page                   |
| `<Space>u`       | **ui** — `up` preview, `ur` right panel, `ue` sidebar                                |
| `<Space>w`       | **window** — `wh` `wj` `wk` `wl`                                                     |
| `:`              | Command palette                                                                      |

`<Space>gc` runs whatever the git button offers right now — commit, commit and push, or commit,
push and open a change request — so it follows the state of your branch rather than needing three
bindings.

Leader bindings run whatever shortcut you have bound to the underlying command, so remapping a
command in Settings remaps its vim binding too.

### Dropdowns

While a menu, select, or picker has the keyboard, vim mode steps aside for it — except for
movement. `⌃n` / `⌃p` and `⌃j` / `⌃k` always move the highlight, and `j` / `k` do too wherever they
cannot be mistaken for typing. Closing one hands focus back to the pane you were in rather than
leaving it on the button that opened it, so `<Space>` is the leader again immediately.

The model picker is two lists, so it splits them:

| Key                        | Action                                  |
| -------------------------- | --------------------------------------- |
| `⌃n` / `⌃p`                | Previous / next provider                |
| `j` / `k` (or `⌃j` / `⌃k`) | Move through models                     |
| `/`                        | Search models                           |
| `Esc`                      | Leave the search, then close the picker |

Because the picker is modal here, plain letters do not filter — press `/` first.

In a browser, a few chords are claimed before T3 Code sees them (`⌃w` closes the tab on Windows and
Linux, for instance). The desktop app receives all of them.
