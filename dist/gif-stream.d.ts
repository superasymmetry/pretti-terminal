import type { GifOptions } from './gif-worker.js';
export declare class GifStream {
    private readonly worker;
    private readonly done;
    private lastShot;
    private frames;
    private encoded;
    constructor(options: GifOptions);
    get frameCount(): number;
    get pendingCount(): number;
    add(shot: Buffer, repeat: number): void;
    finish(): Promise<number>;
}
//# sourceMappingURL=gif-stream.d.ts.map