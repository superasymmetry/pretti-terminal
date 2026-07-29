import { Worker } from 'node:worker_threads';
export class GifStream {
    worker;
    done;
    lastShot;
    frames = 0;
    encoded = 0;
    constructor(options) {
        this.worker = new Worker(new URL('./gif-worker.js', import.meta.url), {
            workerData: options
        });
        this.done = new Promise((resolve, reject) => {
            this.worker.on('message', (message) => {
                if (message.type === 'progress')
                    this.encoded = message.frames;
                else if (message.type === 'done')
                    resolve(message.frames);
                else
                    reject(new Error(message.message));
            });
            this.worker.on('error', reject);
        });
    }
    get frameCount() {
        return this.frames;
    }
    get pendingCount() {
        return this.frames - this.encoded;
    }
    add(shot, repeat) {
        if (repeat <= 0)
            return;
        if (shot === this.lastShot) {
            this.worker.postMessage({ type: 'repeat', repeat });
        }
        else {
            this.worker.postMessage({ type: 'frame', png: shot, repeat });
            this.lastShot = shot;
        }
        this.frames += repeat;
    }
    async finish() {
        this.worker.postMessage({ type: 'finish' });
        try {
            return await this.done;
        }
        finally {
            await this.worker.terminate();
        }
    }
}
//# sourceMappingURL=gif-stream.js.map