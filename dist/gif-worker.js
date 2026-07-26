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
if (!parentPort)
    throw new Error('gif-worker.js must be run as a worker thread');
const port = parentPort;
const { outFile, delayMs, quality, algorithm = 'neuquant' } = workerData;
// Both stay undefined until the first frame arrives: a session that gets
// trimmed away to nothing must not leave an empty .gif behind.
let encoder;
let writeStream;
let lastPixels;
let frames = 0;
function open(first) {
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
    const enc = new GIFEncoder(first.width, first.height, algorithm, true);
    writeStream = fs.createWriteStream(outFile);
    enc.createReadStream().pipe(writeStream);
    enc.start();
    enc.setRepeat(0);
    enc.setDelay(delayMs);
    enc.setQuality(quality);
    return enc;
}
function add(pixels, repeat) {
    for (let i = 0; i < repeat; i++) {
        encoder.addFrame(pixels);
        frames++;
    }
}
function finish() {
    if (!encoder || !writeStream) {
        port.postMessage({ type: 'done', frames: 0 });
        return;
    }
    encoder.finish();
    writeStream.on('close', () => port.postMessage({ type: 'done', frames }));
    writeStream.on('error', (err) => port.postMessage({ type: 'error', message: String(err) }));
}
port.on('message', (message) => {
    try {
        switch (message.type) {
            case 'frame': {
                const { png } = message;
                // wrap rather than copy: the structured clone across the thread
                // boundary was already one copy, and one is enough
                const decoded = PNG.sync.read(Buffer.from(png.buffer, png.byteOffset, png.byteLength));
                encoder ??= open(decoded);
                lastPixels = decoded.data;
                add(lastPixels, message.repeat);
                break;
            }
            case 'repeat':
                if (!lastPixels)
                    throw new Error('repeat with no frame before it');
                add(lastPixels, message.repeat);
                break;
            case 'finish':
                finish();
                return;
        }
        port.postMessage({ type: 'progress', frames });
    }
    catch (err) {
        port.postMessage({
            type: 'error',
            message: err instanceof Error ? err.message : String(err)
        });
    }
});
//# sourceMappingURL=gif-worker.js.map