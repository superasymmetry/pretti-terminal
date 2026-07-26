// gif-worker.ts - the GIF encoder, on a thread of its own.
//
// Encoding is synchronous CPU work: a PNG decode plus a colour quantisation per
// frame. Run in-process it would block the event loop that serves the pty, the
// keystrokes and the browser, so the recorder would stutter every time it fed a
// frame in. Here it runs alongside them instead, and the main thread pays only
// a postMessage.

import * as fs from 'node:fs';
import { parentPort, workerData } from 'node:worker_threads';

// @ts-expect-error - no published types for gif-encoder-2
import GIFEncoder from 'gif-encoder-2';
import { PNG } from 'pngjs';

export interface GifOptions {
  outFile: string;
  delayMs: number;
  quality: number;
  // neuquant is ~2.5x faster per frame, octree makes a ~2.5x smaller file. Which
  // one is right depends on whether anything is waiting: a live recording has to
  // keep pace with the screenshots, an offline render has all the time it wants.
  algorithm?: 'neuquant' | 'octree';
}

// `frame` carries a screenshot; `repeat` re-adds the one before it, which is how
// a held frame costs a single decode instead of one per frame it occupies.
export type GifRequest =
  | { type: 'frame'; png: Uint8Array; repeat: number }
  | { type: 'repeat'; repeat: number }
  | { type: 'finish' };

// `progress` is how the main thread knows whether encoding is keeping up with
// capture, rather than having to assume it.
export type GifResponse =
  | { type: 'progress'; frames: number }
  | { type: 'done'; frames: number }
  | { type: 'error'; message: string };

interface Encoder {
  createReadStream(): NodeJS.ReadableStream;
  start(): void;
  setRepeat(n: number): void;
  setDelay(ms: number): void;
  setQuality(q: number): void;
  addFrame(rgba: Buffer): void;
  finish(): void;
}

if (!parentPort) throw new Error('gif-worker.js must be run as a worker thread');
const port = parentPort;
const { outFile, delayMs, quality, algorithm = 'neuquant' } = workerData as GifOptions;

// Both stay undefined until the first frame arrives: a session that gets
// trimmed away to nothing must not leave an empty .gif behind.
let encoder: Encoder | undefined;
let writeStream: fs.WriteStream | undefined;

let lastPixels: Buffer | undefined;
let frames = 0;

function open(first: PNG): Encoder {
  // GIF dimensions come from the rendered frames, not a fixed constant. They
  // are read once: every frame is the same terminal card, so they cannot drift
  // unless the window is resized, which nothing here supports anyway.
  //
  // The optimizer is what makes encoding fast enough to keep up with capture.
  // Quantising a frame costs ~190ms here; with it on, a frame that is >=90%
  // identical to the one before reuses that frame's colour table instead, which
  // is nearly every frame of a terminal recording - a keystroke changes a cell
  // or two out of half a million pixels. Measured 193ms -> 72ms per frame, at
  // the same file size. Its `totalFrames` argument only drives a progress event
  // we do not use, so leaving it 0 costs nothing.
  const enc = new GIFEncoder(first.width, first.height, algorithm, true) as Encoder;
  writeStream = fs.createWriteStream(outFile);
  enc.createReadStream().pipe(writeStream);

  enc.start();
  enc.setRepeat(0);
  enc.setDelay(delayMs);
  enc.setQuality(quality);
  return enc;
}

function add(pixels: Buffer, repeat: number): void {
  for (let i = 0; i < repeat; i++) {
    encoder!.addFrame(pixels);
    frames++;
  }
}

function finish(): void {
  if (!encoder || !writeStream) {
    port.postMessage({ type: 'done', frames: 0 } satisfies GifResponse);
    return;
  }
  encoder.finish();
  writeStream.on('close', () =>
    port.postMessage({ type: 'done', frames } satisfies GifResponse)
  );
  writeStream.on('error', (err) =>
    port.postMessage({ type: 'error', message: String(err) } satisfies GifResponse)
  );
}

port.on('message', (message: GifRequest) => {
  try {
    switch (message.type) {
      case 'frame': {
        const { png } = message;
        // wrap rather than copy: the structured clone across the thread
        // boundary was already one copy, and one is enough
        const decoded = PNG.sync.read(
          Buffer.from(png.buffer, png.byteOffset, png.byteLength)
        );
        encoder ??= open(decoded);
        lastPixels = decoded.data;
        add(lastPixels, message.repeat);
        break;
      }
      case 'repeat':
        if (!lastPixels) throw new Error('repeat with no frame before it');
        add(lastPixels, message.repeat);
        break;
      case 'finish':
        finish();
        return;
    }
    port.postMessage({ type: 'progress', frames } satisfies GifResponse);
  } catch (err) {
    port.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err)
    } satisfies GifResponse);
  }
});
