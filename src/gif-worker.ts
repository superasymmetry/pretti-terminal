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

  algorithm?: 'neuquant' | 'octree';

  diff?: boolean;

  themeColors?: string[];
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
  setDispose(code: number): void;
  setTransparent(color: number): void;
  addFrame(rgba: Buffer): void;
  finish(): void;
  /** which palette entries the encoder considers live - see open() */
  usedEntry: boolean[];
}

if (!parentPort) throw new Error('gif-worker.js must be run as a worker thread');
const port = parentPort;
const {
  outFile,
  delayMs,
  quality,
  algorithm = 'neuquant',
  diff = false,
  themeColors = []
} = workerData as GifOptions;

// Both stay undefined until the first frame arrives: a session that gets
// trimmed away to nothing must not leave an empty .gif behind.
let encoder: Encoder | undefined;
let writeStream: fs.WriteStream | undefined;

let lastPixels: Buffer | undefined;
let frames = 0;

// the frame we hold but not written yet
let held: { pixels: Buffer; repeat: number; width: number; height: number } | undefined;

// The previous frame's pixels, as they really were - the mask below is applied
// to a copy, so what is compared against is always the true image rather than
// one full of holes.
let prevPixels: Buffer | undefined;
let transparencyOn = false;

const CUBE = [0, 95, 135, 175, 215, 255];

function transparentColor(colors: string[]): number {
  const points = colors
    .map((hex) => /^#([0-9a-f]{6})$/i.exec(hex.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => parseInt(match[1]!, 16))
    .map((rgb) => [(rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff] as const);

  // magenta is the traditional choice, and the right answer when we were told
  // nothing about the theme
  if (!points.length) return 0xff00ff;

  let best = 0xff00ff;
  let bestDistance = -1;

  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 6; g++) {
      for (let b = 0; b < 6; b++) {
        const candidate = [CUBE[r]!, CUBE[g]!, CUBE[b]!] as const;
        let nearest = Infinity;
        for (const [pr, pg, pb] of points) {
          const distance =
            (candidate[0] - pr) ** 2 + (candidate[1] - pg) ** 2 + (candidate[2] - pb) ** 2;
          if (distance < nearest) nearest = distance;
        }
        if (nearest > bestDistance) {
          bestDistance = nearest;
          best = (candidate[0] << 16) | (candidate[1] << 8) | candidate[2];
        }
      }
    }
  }
  return best;
}

const TRANSPARENT = transparentColor(themeColors);

function mask(pixels: Buffer): Buffer {
  if (!diff || !prevPixels || prevPixels.length !== pixels.length) return pixels;

  const masked = Buffer.from(pixels);
  for (let i = 0; i < masked.length; i += 4) {
    if (
      masked[i] === prevPixels[i] &&
      masked[i + 1] === prevPixels[i + 1] &&
      masked[i + 2] === prevPixels[i + 2]
    ) {
      masked[i + 3] = 0;
    }
  }
  return masked;
}

function open(width: number, height: number): Encoder {
  const enc = new GIFEncoder(width, height, algorithm, true) as Encoder;
  writeStream = fs.createWriteStream(outFile);
  enc.createReadStream().pipe(writeStream);

  enc.start();
  enc.setRepeat(0);
  enc.setDelay(delayMs);
  enc.setQuality(quality);

  if (diff) {
    enc.setDispose(1);
  }
  return enc;
}


function enableTransparency(enc: Encoder): void {
  if (transparencyOn) return;
  transparencyOn = true;

  enc.usedEntry = new Array(256).fill(true);
  enc.setTransparent(TRANSPARENT);
}


function flush(): void {
  if (!held) return;

  const { pixels, repeat, width, height } = held;
  held = undefined;

  encoder ??= open(width, height);
  // second frame onwards - see enableTransparency
  if (diff && prevPixels) enableTransparency(encoder);
  encoder.setDelay(delayMs * repeat);
  encoder.addFrame(mask(pixels));
  prevPixels = pixels;
  // counted in frames of animation, not frames in the file - it is what the
  // recorder reports progress against, and what the session actually looked like
  frames += repeat;
}

function finish(): void {
  // the last frame of the session is still waiting to be written: nothing was
  // ever going to come along and displace it
  flush();

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
        // this frame is what displaces the one before it
        flush();
        lastPixels = decoded.data;
        held = {
          pixels: lastPixels,
          repeat: message.repeat,
          width: decoded.width,
          height: decoded.height
        };
        break;
      }
      case 'repeat':
        // the frame before is still here, waiting: hold it longer rather than
        // writing it out a second time
        if (!held || !lastPixels) throw new Error('repeat with no frame before it');
        held.repeat += message.repeat;
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
