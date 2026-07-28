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
  get frameCount(): number {
    return this.frames;
  }

  get pendingCount(): number {
    return this.frames - this.encoded;
  }

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

  async finish(): Promise<number> {
    this.worker.postMessage({ type: 'finish' } satisfies GifRequest);
    try {
      return await this.done;
    } finally {
      await this.worker.terminate();
    }
  }
}
