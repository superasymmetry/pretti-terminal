export interface GifOptions {
    outFile: string;
    delayMs: number;
    quality: number;
    algorithm?: 'neuquant' | 'octree';
}
export type GifRequest = {
    type: 'frame';
    png: Uint8Array;
    repeat: number;
} | {
    type: 'repeat';
    repeat: number;
} | {
    type: 'finish';
};
export type GifResponse = {
    type: 'progress';
    frames: number;
} | {
    type: 'done';
    frames: number;
} | {
    type: 'error';
    message: string;
};
//# sourceMappingURL=gif-worker.d.ts.map