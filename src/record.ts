// record.ts - capture, render and encode in one pass.
//
// capture.ts + render.ts split the work in three: record the session, screenshot
// every frame, then encode them. None of the later stages needs to wait - a frame
// only depends on the output that came before it - so all three run at once here,
// in the idle time while you type. When the shell exits there is usually just the
// tail of the encode left to drain.

import * as fs from 'node:fs';
import * as pty from '@lydell/node-pty';

import {
  VIEWPORT,
  frameIntervalMs,
  holdFrames,
  snapshot,
  themeColors,
  wrapInChrome,
  write
} from './render.js';
import { configSource, loadConfig, resolveOutputPath } from './config.js';
import { defaultShell, geometry } from './terminal.js';

import { ExitTracker } from './exit-trim.js';
import { GifStream } from './gif-stream.js';
import { launchBrowser } from './browser.js';
import xtermHeadless from '@xterm/headless';

// @lydell/node-pty rather than node-pty itself: same API, but it ships its
// binaries as per-platform optional dependencies instead of compiling on
// install, so Linux users do not need Python and a C++ toolchain to install us.











const { Terminal } = xtermHeadless;

// Read before the shell starts, so a broken config fails now rather than after
// a whole session has been recorded against it.
const config = loadConfig();
const configFile = configSource();
if (configFile) console.log(`Using theme from ${configFile}`);

const outFile = resolveOutputPath(config, process.argv[2]);
const captureFile = process.argv[3] ?? 'capture.jsonl';

const { cols, rows } = geometry(config);

// Opened before the shell starts, for the same reason the config is read up
// there: a browser that cannot be opened should stop us now, rather than after
// a whole session has been recorded against it. It costs about 200ms, and it is
// the only place that failure can be reported to someone who is still reading
// the terminal - once recording begins the screen belongs to the session.
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: VIEWPORT });

const term = new Terminal({ cols, rows, allowProposedApi: true });
const hold = holdFrames(config);

const gif = new GifStream({
  outFile,
  delayMs: frameIntervalMs(config),
  quality: config.animation.quality,
  // No octree here - the encoder has to keep pace with the session, and it is
  // the slower of the two. Diffing is worth it either way: it costs one pass
  // over the pixels against the ~72ms the quantiser spends on the same frame.
  diff: true,
  themeColors: themeColors(config)
});

let lastFrame: string | undefined;
let lastShot: Buffer | undefined;

// Screenshots wait here until a late `exit` can no longer trim them away. One
// entry per output event, in order; `index` is that event's place in the session,
// which is the unit the trim point is expressed in.
const pending: { index: number; shot: Buffer }[] = [];

// Hand over every screenshot that is settled - `limit` is the earliest event a
// trim could still cut at, or null if nothing left can be cut. Called after each
// new frame and after each keystroke, since typing is what moves the line.
function drain(limit: number | null): void {
  while (pending.length) {
    const next = pending[0]!;
    if (limit !== null && next.index >= limit) break;
    pending.shift();
    gif.add(next.shot, hold);
  }
}

// Frames must be produced in order, and xterm's parser is async, so the work is
// serialized on a promise chain rather than run concurrently. Output events keep
// arriving while the chain is busy; they queue up behind it and drain during the
// next pause in the session.
let queue: Promise<void> = Promise.resolve();

function enqueue(data: string, index: number): void {
  queue = queue.then(async () => {
    await write(term, data);
    const frame = snapshot(term, config);

    // held frames repeat verbatim; re-screenshotting them is pure waste
    if (frame !== lastFrame || !lastShot) {
      await page.setContent(wrapInChrome(frame, config));
      lastShot = await page.screenshot({ fullPage: true });
      lastFrame = frame;
    }
    pending.push({ index, shot: lastShot });
    drain(exitTracker.cutFloor);
  });
}

const ptyProcess = pty.spawn(defaultShell(), [], {
  name: 'xterm-color',
  cols,
  rows,
  cwd: process.cwd(),
  env: process.env
});

// The .jsonl is still written, so a session can be re-rendered later with
// different settings without re-recording it.
const capture = fs.createWriteStream(captureFile);
const start = Date.now();
const log = (event: object) => capture.write(JSON.stringify(event) + '\n');
log({ t: 0, type: 'meta', cols, rows });

const exitTracker = new ExitTracker();
let outCount = 0;

ptyProcess.onData((data) => {
  process.stdout.write(data);
  log({ t: Date.now() - start, type: 'out', data });
  enqueue(data, outCount++);
});

process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on('data', (data) => {
  const text = data.toString();
  // before the write, so the index is taken ahead of the echo it produces
  exitTracker.onInput(text, outCount);
  ptyProcess.write(text);
  // Finishing a line that was not an exit releases everything it was holding up.
  drain(exitTracker.cutFloor);
});

ptyProcess.onExit(async ({ exitCode }) => {
  process.stdin.setRawMode(false);
  process.stdin.pause();
  // A trailer, not a header: which line ended the session is only known now.
  // Kept in the .jsonl so a re-render trims at the same place.
  if (exitTracker.exitIndex !== null) {
    log({ t: Date.now() - start, type: 'trim', index: exitTracker.exitIndex });
  }
  capture.end();

  // Nothing is printed until here: any log line written mid-session would land
  // in the middle of the terminal we are filming.
  console.log('Finishing frames...');
  await queue;
  await browser.close();

  // The cut point is final now. Whatever is still pending either belongs to the
  // exit and gets dropped, or was held behind it and can go through - the last
  // few frames of the session, and all that was ever kept back.
  //
  // Two different things can leave work for the end, and they need different
  // fixes: frames the encoder has not caught up on (it is too slow), and frames
  // the watermark would not release until now (they never got the chance).
  const streamed = gif.frameCount;
  drain(exitTracker.exitIndex);
  const heldBack = gif.frameCount - streamed;
  const owed = gif.pendingCount;

  if (gif.frameCount === 0) {
    console.log('Nothing captured, no GIF written.');
    await gif.finish();
    process.exit(exitCode);
  }

  // console.log(
  //   `Finishing GIF (${owed} of ${gif.frameCount} frames left; ` +
  //   `${streamed} streamed during the session, ${heldBack} held back to the end)...`
  // );

  const encodeStart = Date.now();
  await gif.finish();
  const waited = ((Date.now() - encodeStart) / 1000).toFixed(1);
  console.log(`Done: ${outFile} (${gif.frameCount} frames, ${waited}s waiting on the encoder)`);
  process.exit(exitCode);
});
