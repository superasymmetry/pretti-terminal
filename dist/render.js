// render.ts
import * as fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import xtermHeadless from '@xterm/headless';
import { COLS, ROWS } from './terminal.js';
import { launchBrowser } from './browser.js';
import { GifStream } from './gif-stream.js';
import { ConfigError, configSource, loadConfig, resolveOutputPath } from './config.js';
const { Terminal } = xtermHeadless;
export { COLS, ROWS };
// How long one GIF frame lasts. Recorded timestamps are ignored: each output
// event is held for animation.holdMs instead, so idle gaps in the original
// session vanish and the pace stays even however long you sat thinking.
export function frameIntervalMs(config) {
    return 1000 / config.animation.fps;
}
/** How many frames one output event occupies - at least one, however brief. */
export function holdFrames(config) {
    return Math.max(1, Math.round(config.animation.holdMs / frameIntervalMs(config)));
}
/**
 * Reads a .jsonl capture. Both failures here are things a user does rather than
 * bugs - naming a file that is not there, or pointing at one that is not a
 * capture - so they are reported the way a bad config is, with a message
 * instead of a stack.
 */
function loadEvents(file) {
    let text;
    try {
        text = fs.readFileSync(file, 'utf-8');
    }
    catch (error) {
        // A missing file is the common case by a distance, and the useful thing to
        // say is where captures come from - not to repeat the errno back.
        if (error.code === 'ENOENT') {
            throw new ConfigError(`No capture at ${file}.\n` +
                'Record one with `pretti capture`, or name an existing .jsonl: pretti render mine.jsonl');
        }
        throw new ConfigError(`Cannot read capture ${file}: ${error.message}`);
    }
    const lines = text.trim().split('\n');
    if (lines.length === 1 && lines[0] === '') {
        throw new ConfigError(`${file} is empty - there is nothing in it to render.`);
    }
    return lines.map((line, i) => {
        let event;
        try {
            event = JSON.parse(line);
        }
        catch {
            // Named by line, since the whole point of .jsonl is that one bad line is
            // findable. Usually this is not a capture at all - a .json config, say.
            throw new ConfigError(`${file} is not a capture: line ${i + 1} is not valid JSON.\n` +
                'A capture is the .jsonl file pretti writes while recording.');
        }
        // captures predating tagged events had no `type` and were all output
        return (event.type ? event : { ...event, type: 'out' });
    });
}
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
// The 6x6x6 color cube's channel levels, as xterm defines them.
const CUBE_LEVELS = [0, 95, 135, 175, 215, 255];
function paletteColor(index, config) {
    if (index < 16)
        return config.terminal.palette[index];
    if (index < 232) {
        const n = index - 16;
        const channels = [
            CUBE_LEVELS[Math.floor(n / 36) % 6],
            CUBE_LEVELS[Math.floor(n / 6) % 6],
            CUBE_LEVELS[n % 6]
        ];
        return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    }
    const grey = 8 + (index - 232) * 10;
    return `#${grey.toString(16).padStart(2, '0').repeat(3)}`;
}
function cellColor(cell, ground, config) {
    const isDefault = ground === 'fg' ? cell.isFgDefault() : cell.isBgDefault();
    if (isDefault)
        return undefined;
    const value = ground === 'fg' ? cell.getFgColor() : cell.getBgColor();
    const isRgb = ground === 'fg' ? cell.isFgRGB() : cell.isBgRGB();
    if (isRgb)
        return `#${(value >>> 0).toString(16).padStart(6, '0')}`;
    const bright = ground === 'fg' && config.styles.brightenBold && cell.isBold() && value < 8;
    return paletteColor(bright ? value + 8 : value, config);
}
/** The CSS for one cell: its colors, its attributes, and the cursor on top. */
function cellStyle(cell, isCursor, config) {
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
    if (bg)
        declarations.push(`background:${bg}`);
    if (cell?.isBold() && styles.bold)
        declarations.push('font-weight:700');
    if (cell?.isItalic() && styles.italic)
        declarations.push('font-style:italic');
    if (cell?.isUnderline() && styles.underline)
        declarations.push('text-decoration:underline');
    if (cell?.isDim() && styles.dim)
        declarations.push('opacity:.55');
    // An underline cursor is drawn as an inset shadow rather than a border, so
    // the cell keeps its size and the glyph grid stays aligned.
    if (isCursor && cursor.style === 'underline') {
        declarations.push(`box-shadow:inset 0 -.14em 0 ${cursor.background}`);
    }
    return declarations.join(';');
}
export function snapshot(term, config) {
    const buffer = term.buffer.active;
    const parts = [];
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
export function write(term, data) {
    return new Promise((resolve) => term.write(data, resolve));
}
// Replay, screenshot and encode in one pass, so the three run together instead
// of end to end. The recorder needs a watermark to know when a frame is safe to
// encode; here there is nothing to wait for - the capture already carries its
// trim event, so every frame is final the moment it is made.
async function renderToGif(events, outFile, config) {
    // size the emulator to whatever the capture was recorded at; COLS/ROWS only
    // apply to older captures with no meta line
    const meta = events.find((e) => e.type === 'meta');
    const term = new Terminal({
        cols: meta?.cols ?? COLS,
        rows: meta?.rows ?? ROWS,
        allowProposedApi: true
    });
    const hold = holdFrames(config);
    // captures made before this existed have no trim event and render in full
    const trim = events.find((e) => e.type === 'trim');
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
    let lastFrame;
    let lastShot;
    try {
        for (const event of events) {
            if (event.type !== 'out')
                continue;
            if (trim && outIndex++ >= trim.index)
                break;
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
    }
    finally {
        await browser.close();
    }
    return gif.finish();
}
export function themeColors(config) {
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
export function wrapInChrome(terminalHtml, config) {
    const { terminal, font, window: win } = config;
    const bar = win.titleBar;
    // Side padding is a touch wider than the top and bottom, which is what the
    // hardcoded 28px/34px pair used to say; one config number keeps that ratio.
    const padX = Math.round(win.padding * 1.2);
    const buttons = bar.show
        ? `<div style="background:${bar.background};padding:18px 22px;display:flex;gap:10px;">${bar.buttons
            .map((color) => `<div style="width:14px;height:14px;border-radius:50%;background:${color};"></div>`)
            .join('')}</div>`
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
    if (source)
        console.log(`Using theme from ${source}`);
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
        if (!(error instanceof ConfigError))
            throw error;
        console.error(error.message);
        process.exitCode = 1;
    });
}
//# sourceMappingURL=render.js.map