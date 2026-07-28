// render.ts

import * as fs from 'node:fs';
import { pathToFileURL } from 'node:url';

import xtermHeadless from '@xterm/headless';

import { COLS, ROWS } from './terminal.js';
import { launchBrowser } from './browser.js';
import { GifStream } from './gif-stream.js';
import { ConfigError, configSource, loadConfig, resolveOutputPath, type PrettiConfig } from './config.js';

const { Terminal } = xtermHeadless;
type Terminal = InstanceType<typeof Terminal>;

export { COLS, ROWS };

// How long one GIF frame lasts. Recorded timestamps are ignored: each output
// event is held for animation.holdMs instead, so idle gaps in the original
// session vanish and the pace stays even however long you sat thinking.
export function frameIntervalMs(config: PrettiConfig): number {
  return 1000 / config.animation.fps;
}

/** How many frames one output event occupies - at least one, however brief. */
export function holdFrames(config: PrettiConfig): number {
  return Math.max(1, Math.round(config.animation.holdMs / frameIntervalMs(config)));
}

interface MetaEvent {
  t: number;
  type: 'meta';
  cols: number;
  rows: number;
}

interface OutputEvent {
  t: number;
  type: 'out';
  data: string;
}

// Written last by the recorders: the output-event index where the `exit` that
// ended the session began. Everything from there on is stage machinery.
interface TrimEvent {
  t: number;
  type: 'trim';
  index: number;
}

type CaptureEvent = MetaEvent | OutputEvent | TrimEvent;

function loadEvents(path: string): CaptureEvent[] {
  return fs.readFileSync(path, 'utf-8')
    .trim()
    .split('\n')
    .map((line) => {
      // captures predating tagged events had no `type` and were all output
      const event = JSON.parse(line);
      return (event.type ? event : { ...event, type: 'out' }) as CaptureEvent;
    });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// The 6x6x6 color cube's channel levels, as xterm defines them.
const CUBE_LEVELS = [0, 95, 135, 175, 215, 255];

/**
 * An ANSI palette index as a hex color. 0-15 come from the config, so a theme
 * can restyle every color a program asks for by name; 16-255 are the fixed
 * xterm cube and greyscale ramp.
 */
function paletteColor(index: number, config: PrettiConfig): string {
  if (index < 16) return config.terminal.palette[index]!;

  if (index < 232) {
    const n = index - 16;
    const channels = [
      CUBE_LEVELS[Math.floor(n / 36) % 6]!,
      CUBE_LEVELS[Math.floor(n / 6) % 6]!,
      CUBE_LEVELS[n % 6]!
    ];
    return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  }

  const grey = 8 + (index - 232) * 10;
  return `#${grey.toString(16).padStart(2, '0').repeat(3)}`;
}

type Cell = NonNullable<ReturnType<NonNullable<ReturnType<Terminal['buffer']['active']['getLine']>>['getCell']>>;

/**
 * The color a cell asks for, or undefined when it wants the terminal default.
 * xterm reports a color as either a 24-bit RGB value or a palette index, and
 * the two mean entirely different numbers - `getFgColor` alone cannot tell
 * them apart, so the mode has to be checked first.
 */
function cellColor(cell: Cell, ground: 'fg' | 'bg', config: PrettiConfig): string | undefined {
  const isDefault = ground === 'fg' ? cell.isFgDefault() : cell.isBgDefault();
  if (isDefault) return undefined;

  const value = ground === 'fg' ? cell.getFgColor() : cell.getBgColor();
  const isRgb = ground === 'fg' ? cell.isFgRGB() : cell.isBgRGB();
  if (isRgb) return `#${(value >>> 0).toString(16).padStart(6, '0')}`;

  const bright = ground === 'fg' && config.styles.brightenBold && cell.isBold() && value < 8;
  return paletteColor(bright ? value + 8 : value, config);
}

/** The CSS for one cell: its colors, its attributes, and the cursor on top. */
function cellStyle(cell: Cell | undefined, isCursor: boolean, config: PrettiConfig): string {
  const { terminal, styles } = config;
  const cursor = terminal.cursor;

  let fg = cell ? cellColor(cell, 'fg', config) : undefined;
  let bg = cell ? cellColor(cell, 'bg', config) : undefined;

  // Inverse video swaps the two, which means the defaults have to be made
  // explicit first - there is nothing to swap while they are still implied.
  if (cell?.isInverse()) {
    const swapped = bg ?? terminal.background;
    bg = fg ?? terminal.foreground;
    fg = swapped;
  }

  if (isCursor && cursor.style === 'block') {
    fg = cursor.foreground;
    bg = cursor.background;
  }

  const declarations = [`color:${fg ?? terminal.foreground}`];
  if (bg) declarations.push(`background:${bg}`);

  if (cell?.isBold() && styles.bold) declarations.push('font-weight:700');
  if (cell?.isItalic() && styles.italic) declarations.push('font-style:italic');
  if (cell?.isUnderline() && styles.underline) declarations.push('text-decoration:underline');
  if (cell?.isDim() && styles.dim) declarations.push('opacity:.55');

  // An underline cursor is drawn as an inset shadow rather than a border, so
  // the cell keeps its size and the glyph grid stays aligned.
  if (isCursor && cursor.style === 'underline') {
    declarations.push(`box-shadow:inset 0 -.14em 0 ${cursor.background}`);
  }

  return declarations.join(';');
}

export function snapshot(term: Terminal, config: PrettiConfig): string {
  const buffer = term.buffer.active;
  const parts: string[] = [];
  const showCursor = config.terminal.cursor.style !== 'none';

  for (let y = 0; y < term.rows; y++) {
    // baseY is the top of the viewport: without it, a session that has scrolled
    // renders the top of the scrollback instead of what is on screen
    const line = buffer.getLine(buffer.baseY + y);
    // Coalesce consecutive cells sharing a style into a single span, so a frame
    // costs a handful of elements instead of cols*rows of them.
    let runStyle = '';
    let runText = '';

    for (let x = 0; x < term.cols; x++) {
      const cell = line?.getCell(x);
      const isCursor = showCursor && x === buffer.cursorX && y === buffer.cursorY;
      const style = cellStyle(cell, isCursor, config);

      if (style !== runStyle && runText) {
        parts.push(`<span style="${runStyle}">${runText}</span>`);
        runText = '';
      }
      runStyle = style;
      runText += escapeHtml(cell?.getChars() || ' ');
    }

    if (runText) {
      parts.push(`<span style="${runStyle}">${runText}</span>`);
    }
    parts.push('\n');
  }

  return parts.join('');
}

// term.write() queues data and parses it asynchronously, so the buffer is not
// updated until the callback fires. Snapshotting without waiting photographs
// an empty screen.
export function write(term: Terminal, data: string): Promise<void> {
  return new Promise((resolve) => term.write(data, resolve));
}

// Replay, screenshot and encode in one pass, so the three run together instead
// of end to end. The recorder needs a watermark to know when a frame is safe to
// encode; here there is nothing to wait for - the capture already carries its
// trim event, so every frame is final the moment it is made.
async function renderToGif(
  events: CaptureEvent[],
  outFile: string,
  config: PrettiConfig
): Promise<number> {
  // size the emulator to whatever the capture was recorded at; COLS/ROWS only
  // apply to older captures with no meta line
  const meta = events.find((e): e is MetaEvent => e.type === 'meta');
  const term = new Terminal({
    cols: meta?.cols ?? COLS,
    rows: meta?.rows ?? ROWS,
    allowProposedApi: true
  });
  const hold = holdFrames(config);

  // captures made before this existed have no trim event and render in full
  const trim = events.find((e): e is TrimEvent => e.type === 'trim');
  let outIndex = 0;

  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: VIEWPORT });
  const gif = new GifStream({
    outFile,
    delayMs: frameIntervalMs(config),
    quality: config.animation.quality,
    // Same settings the recorder uses. An offline render could afford the
    // slower octree quantiser, but not alongside diffing - see GifOptions -
    // and diffing is worth an order of magnitude more than octree is.
    diff: true,
    themeColors: themeColors(config)
  });

  let lastFrame: string | undefined;
  let lastShot: Buffer | undefined;

  try {
    for (const event of events) {
      if (event.type !== 'out') continue;
      if (trim && outIndex++ >= trim.index) break;

      await write(term, event.data);
      // snapshot once, then hold it: event.t is deliberately unused
      const frame = snapshot(term, config);

      // held frames repeat verbatim; re-screenshotting them is pure waste
      if (frame !== lastFrame || !lastShot) {
        await page.setContent(wrapInChrome(frame, config));
        lastShot = await page.screenshot({ fullPage: true });
        lastFrame = frame;
      }
      // passing the same Buffer twice sends a back-reference, not the pixels
      gif.add(lastShot, hold);
    }
  } finally {
    await browser.close();
  }

  return gif.finish();
}

/**
 * Every colour the theme can put on a pixel, for choosing a transparent colour
 * that collides with none of them.
 *
 * The terminal's own colours are the ones that matter: they are what changes
 * between frames, and a collision only shows as a ghost where something
 * changed. The window chrome is here for good measure - it is identical in
 * every frame, so it would be transparent regardless.
 */
export function themeColors(config: PrettiConfig): string[] {
  const { terminal, window: win } = config;
  return [
    terminal.background,
    terminal.foreground,
    terminal.cursor.background,
    terminal.cursor.foreground,
    ...terminal.palette,
    win.titleBar.background,
    ...win.titleBar.buttons
  ];
}

export function wrapInChrome(terminalHtml: string, config: PrettiConfig): string {
  const { terminal, font, window: win } = config;
  const bar = win.titleBar;

  // Side padding is a touch wider than the top and bottom, which is what the
  // hardcoded 28px/34px pair used to say; one config number keeps that ratio.
  const padX = Math.round(win.padding * 1.2);

  const buttons = bar.show
    ? `<div style="background:${bar.background};padding:18px 22px;display:flex;gap:10px;">${
        bar.buttons
          .map((color) => `<div style="width:14px;height:14px;border-radius:50%;background:${color};"></div>`)
          .join('')
      }</div>`
    : '';

  // the gradient lives on a content-sized wrapper, not <body>: a body
  // background is painted across the viewport and tiles in fullPage shots
  return `<body style="margin:0;">
    <div style="background:${win.background};padding:${win.margin}px;width:fit-content;">
    <div style="border-radius:${win.radius}px;overflow:hidden;box-shadow:${win.shadow};width:fit-content;">
      ${buttons}
      <div style="background:${terminal.background};color:${terminal.foreground};
                  font-family:${font.family};
                  white-space:pre;padding:${win.padding}px ${padX}px;font-size:${font.size}px;
                  line-height:${font.lineHeight};
                  letter-spacing:${font.letterSpacing};
                  font-variant-ligatures:${font.ligatures ? 'normal' : 'none'};
                  -webkit-font-smoothing:antialiased;">${terminalHtml}</div>
    </div>
    </div>
  </body>`;
}

// Only a floor: screenshots are taken fullPage, so the captured image grows to
// fit the terminal card whatever geometry the recording used.
export const VIEWPORT = { width: 400, height: 300 };

export async function main() {
  const config = loadConfig();
  const source = configSource();
  const inFile = process.argv[2] || 'capture.jsonl';
  const outFile = resolveOutputPath(config, process.argv[3]);

  if (source) console.log(`Using theme from ${source}`);

  console.log('Loading capture...');
  const events = loadEvents(inFile);

  console.log('Replaying, rendering and encoding...');
  const frames = await renderToGif(events, outFile, config);

  if (frames === 0) {
    console.log('Nothing to render, no GIF written.');
    return;
  }

  console.log(`Done: ${outFile} (${frames} frames)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    // A bad config is a user typo, not a crash: show the message, skip the stack
    if (!(error instanceof ConfigError)) throw error;
    console.error(error.message);
    process.exitCode = 1;
  });
}