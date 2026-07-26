// gif-stream.ts - feed frames to the encoder while they are still being made.
//
// A GIF is written front to back and cannot be un-written, so a frame can only
// be handed over once it is certain to survive the exit trim. The recorder
// decides that; this just carries the frames across to the worker in order.

import { Worker } from 'node:worker_threads';

import type { GifOptions, GifRequest, GifResponse } from './gif-worker.js';

export class GifStream {
  private readonly worker: Worker;
  private readonly done: Promise<number>;
  private lastShot: Buffer | undefined;
  private frames = 0;
  private encoded = 0;

  constructor(options: GifOptions) {
    this.worker = new Worker(new URL('./gif-worker.js', import.meta.url), {
      workerData: options
    });

    this.done = new Promise<number>((resolve, reject) => {
      this.worker.on('message', (message: GifResponse) => {
        if (message.type === 'progress') this.encoded = message.frames;
        else if (message.type === 'done') resolve(message.frames);
        else reject(new Error(message.message));
      });
      this.worker.on('error', reject);
    });
  }

  // How many frames the GIF holds so far. Counted here rather than asked of the
  // worker, so the recorder can tell an empty recording from a real one without
  // waiting on a round trip.
  get frameCount(): number {
    return this.frames;
  }

  // How many of those the worker has actually encoded. The gap between this and
  // frameCount is the only work an exit still has to wait for.
  get pendingCount(): number {
    return this.frames - this.encoded;
  }

  // `repeat` copies of one screenshot. Handing over the same Buffer as last time
  // sends a back-reference instead of the pixels, so a frame held across several
  // output events crosses the thread boundary once.
  add(shot: Buffer, repeat: number): void {
    if (repeat <= 0) return;

    if (shot === this.lastShot) {
      this.worker.postMessage({ type: 'repeat', repeat } satisfies GifRequest);
    } else {
      this.worker.postMessage({ type: 'frame', png: shot, repeat } satisfies GifRequest);
      this.lastShot = shot;
    }
    this.frames += repeat;
  }

  // Resolves once the .gif is closed on disk. Returns the frame count the
  // encoder actually wrote.
  async finish(): Promise<number> {
    this.worker.postMessage({ type: 'finish' } satisfies GifRequest);
    try {
      return await this.done;
    } finally {
      await this.worker.terminate();
    }
  }
}
