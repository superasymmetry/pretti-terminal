export interface GifOptions {
    outFile: string;
    delayMs: number;
    quality: number;
    /**
     * neuquant is ~2.5x faster per frame; octree makes a ~2.5x smaller file.
     *
     * Nothing asks for octree any more. It cannot be combined with `diff`, which
     * is worth far more: gif-encoder-2 declares `nPix` with `const` inside its
     * octree branch, so the transparency loop that follows reads the `var nPix`
     * belonging to the neuquant branch, finds it undefined, and quietly does
     * nothing at all. Diffing under neuquant measured ~10x against octree's 2.5x,
     * and is the faster of the two into the bargain.
     */
    algorithm?: 'neuquant' | 'octree';
    /**
     * Store only what changed since the previous frame. See `mask` below - this
     * is where most of the file size goes, because typing changes a couple of
     * cells out of a screen the encoder would otherwise write out whole.
     */
    diff?: boolean;
    /**
     * Every colour the theme can put on screen, as `#rrggbb`. Only used to choose
     * a transparent colour that collides with as little as possible; without it,
     * diffing falls back to a fixed guess.
     */
    themeColors?: string[];
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