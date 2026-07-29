# pretti-terminal

Generate beautiful GIFs of terminal sessions through one command.

Run `pretti`, use your shell normally, and a terminal would be spawned in the same directory in which you ran the command. Do stuff in that terminal. Type `exit` to stop recording. 

https://github.com/user-attachments/assets/043f2674-7ccd-47a0-bdcd-1cd40da105a7

This was the output GIF generated:

<img width="1089" height="869" alt="output" src="https://github.com/user-attachments/assets/60210b96-b990-49ce-8547-34e66c08eb32" />


## Install

```
npm install -g pretti-terminal
```

That installs the `pretti` command — the package is `pretti-terminal`, but what you type is `pretti`.

## Use

```
pretti                  # record a session
pretti demo.gif         # record a session, generating the gif under a different name
```

By default, the gif is saved to your Downloads folder as `output.gif`. You can save it under a different name by passing it as an argument.

## Settings

You can also edit colors, fonts, window chrome and timing from a config file. Run 

```
pretti config
```

to create the config.

You can also directly edit configs via arguments.

```
pretti config --bg '#101014' --font-size 18    # save the change to the file
pretti --bg '#101014'                          # apply it to this run only
```

Without `--config <file>`, pretti looks for `./pretti.config.json`, then `~/.pretti.json`, then `~/.config/pretti/config.json` (or the file named by `PRETTI_CONFIG`), and falls back to its built-in theme. Anything you leave out keeps its default.

Every setting is also a flag, named for its path in the file — `--font.size 24`, `--window.titleBar.show false`. On/off settings take a bare flag either way: `--styles.dim`, `--no-title-bar`.

### output

Where the GIF is written. A filename given on the command line wins for that run.

| Setting | Flag | Type | Default | Notes |
| --- | --- | --- | --- | --- |
| `output.directory` | `--out-dir` | path | `~/Downloads` | Created if it doesn't exist; a leading `~` is expanded. |
| `output.name` | `--out-name` | filename | `output.gif` | A name with no extension gets `.gif`. |

### terminal

The stage being filmed: its size and its colors.

| Setting | Flag | Type | Default | Notes |
| --- | --- | --- | --- | --- |
| `terminal.cols` | `--cols` | number, 20–500 | `100` | Recording is capped at 100 cols regardless. |
| `terminal.rows` | `--rows` | number, 5–200 | `28` | Recording is capped at 28 rows regardless. |
| `terminal.background` | `--bg` | hex color | `#2b2d3a` | |
| `terminal.foreground` | `--fg` | hex color | `#f8f8f2` | |
| `terminal.cursor.style` | `--cursor` | `block`, `underline`, `none` | `block` | |
| `terminal.cursor.background` | — | hex color | `#f8f8f2` | The painted cell; ignored by `underline` and `none`. |
| `terminal.cursor.foreground` | — | hex color | `#2b2d3a` | The character inside a block cursor. |
| `terminal.palette` | `--palette` | 16 hex colors | see below | The ANSI colors. Colors 16–255 are the standard xterm cube and are not configurable. |

`palette` must be exactly 16 entries, in order: black, red, green, yellow, blue, magenta, cyan, white, then the same eight as their bright variants. On the command line, pass them comma-separated or as a JSON array.

### font

| Setting | Flag | Type | Default | Notes |
| --- | --- | --- | --- | --- |
| `font.family` | `--font-family` | CSS font stack | `'Cascadia Code','JetBrains Mono',Consolas,ui-monospace,monospace` | The first font installed on the machine wins. |
| `font.size` | `--font-size` | number, 1–400 | `15` | In px. |
| `font.lineHeight` | — | number, 0.5–10 | `1.55` | A multiple of the font size. |
| `font.letterSpacing` | — | CSS length | `.02em` | |
| `font.ligatures` | — | boolean | `false` | On, `->` and `!=` render as single glyphs. |

### styles

Which of the terminal's text attributes are honored when rendering.

| Setting | Flag | Type | Default | Notes |
| --- | --- | --- | --- | --- |
| `styles.bold` | — | boolean | `true` | |
| `styles.italic` | — | boolean | `true` | |
| `styles.underline` | — | boolean | `true` | |
| `styles.dim` | — | boolean | `true` | |
| `styles.brightenBold` | — | boolean | `false` | On, bold text in one of the first eight colors uses its bright twin, as most terminals do. |

### window

The frame drawn around the terminal.

| Setting | Flag | Type | Default | Notes |
| --- | --- | --- | --- | --- |
| `window.background` | `--window-bg` | CSS background | `linear-gradient(150deg,#6f76e0,#8d6ec9)` | A flat color, a gradient, whatever CSS accepts. |
| `window.margin` | `--margin` | number, 0–2000 | `56` | Px between the window and the image edge. |
| `window.padding` | `--padding` | number, 0–2000 | `28` | Px between the text and the window edge. |
| `window.radius` | `--radius` | number, 0–2000 | `16` | Corner rounding, in px. |
| `window.shadow` | — | CSS box-shadow | `0 30px 80px rgba(0,0,0,.45)` | |
| `window.titleBar.show` | `--title-bar` | boolean | `true` | `--no-title-bar` turns it off. |
| `window.titleBar.background` | — | hex color | `#23252f` | |
| `window.titleBar.buttons` | — | list of hex colors | `#ff5f56`, `#ffbd2e`, `#27c93f` | The traffic lights, left to right; any number of them, including none. |

### animation

| Setting | Flag | Type | Default | Notes |
| --- | --- | --- | --- | --- |
| `animation.fps` | `--fps` | number, 1–50 | `10` | |
| `animation.holdMs` | `--hold` | number, 1–10000 | `100` | How long one output event stays on screen, in ms. |
| `animation.quality` | `--quality` | number, 1–20 | `10` | 1 is best and slowest, 20 is worst and fastest. |

Colors must be hex — `#abc` or `#aabbcc`. `window.background`, `window.shadow`, `font.family` and `font.letterSpacing` are passed through to CSS as written, so anything CSS understands works there.
