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
const { outFile, delayMs, quality, algorithm = 'neuquant', diff = false, themeColors = [] } = workerData;
// Both stay undefined until the first frame arrives: a session that gets
// trimmed away to nothing must not leave an empty .gif behind.
let encoder;
let writeStream;
let lastPixels;
let frames = 0;
// The frame we have been given but not yet written, and how long it is to be
// held for. A frame cannot go out the moment it arrives: the `repeat` messages
// that extend it arrive afterwards, and its delay has to be known before it is
// encoded. So each frame waits here until the next distinct one displaces it.
let held;
// The previous frame's pixels, as they really were - the mask below is applied
// to a copy, so what is compared against is always the true image rather than
// one full of holes.
let prevPixels;
let transparencyOn = false;
/**
 * A colour to spend on "transparent", as far from everything the theme draws as
 * it can be.
 *
 * The encoder does not reserve a palette slot for transparency: it maps the
 * colour we name here to the *nearest entry in the frame's own table*, and every
 * pixel that quantises to that entry then reads as transparent too. Since a
 * transparent pixel shows the previous frame through, a collision with a colour
 * actually on screen is a ghost - text that will not erase. Picking the emptiest
 * corner of the colour space leaves that nearest entry as far from any real
 * pixel as the theme allows.
 */
// The 6x6x6 colour cube the GIF palette is built around: a grid fine enough to
// find an empty corner in, and small enough to brute force.
const CUBE = [0, 95, 135, 175, 215, 255];
function transparentColor(colors) {
    const points = colors
        .map((hex) => /^#([0-9a-f]{6})$/i.exec(hex.trim()))
        .filter((match) => match !== null)
        .map((match) => parseInt(match[1], 16))
        .map((rgb) => [(rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff]);
    // magenta is the traditional choice, and the right answer when we were told
    // nothing about the theme
    if (!points.length)
        return 0xff00ff;
    let best = 0xff00ff;
    let bestDistance = -1;
    for (let r = 0; r < 6; r++) {
        for (let g = 0; g < 6; g++) {
            for (let b = 0; b < 6; b++) {
                const candidate = [CUBE[r], CUBE[g], CUBE[b]];
                let nearest = Infinity;
                for (const [pr, pg, pb] of points) {
                    const distance = (candidate[0] - pr) ** 2 + (candidate[1] - pg) ** 2 + (candidate[2] - pb) ** 2;
                    if (distance < nearest)
                        nearest = distance;
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
/**
 * The frame to actually encode: a copy with every pixel unchanged since the
 * previous frame marked transparent, so it compresses to a run rather than
 * being spelled out again.
 *
 * Only the alpha byte is touched. The encoder decides transparency on alpha,
 * but quantises on RGB, and the optimiser measures frame similarity on RGB too -
 * blanking the colour as well would corrupt the palette and defeat the table
 * reuse that keeps encoding fast enough to record with.
 */
function mask(pixels) {
    if (!diff || !prevPixels || prevPixels.length !== pixels.length)
        return pixels;
    const masked = Buffer.from(pixels);
    for (let i = 0; i < masked.length; i += 4) {
        if (masked[i] === prevPixels[i] &&
            masked[i + 1] === prevPixels[i + 1] &&
            masked[i + 2] === prevPixels[i + 2]) {
            masked[i + 3] = 0;
        }
    }
    return masked;
}
function open(width, height) {
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
    const enc = new GIFEncoder(width, height, algorithm, true);
    writeStream = fs.createWriteStream(outFile);
    enc.createReadStream().pipe(writeStream);
    enc.start();
    enc.setRepeat(0);
    enc.setDelay(delayMs);
    enc.setQuality(quality);
    if (diff) {
        // Mandatory, and not the default: naming a transparent colour otherwise
        // sets disposal to "restore to background", which clears the canvas between
        // frames and leaves the transparent pixels showing nothing rather than the
        // frame before. 1 is "leave it there", which is the whole point.
        enc.setDispose(1);
    }
    return enc;
}
/**
 * Turn transparency on, once the first frame is safely behind us.
 *
 * It has to wait: a transparent pixel means "whatever was here before", and on
 * the opening frame there is no before. The encoder maps our colour to the
 * nearest entry in the palette rather than reserving one, so a handful of real
 * pixels share that entry and would be punched out - on frame one that leaves a
 * hole nothing ever fills, since every later frame is transparent there too.
 * Written whole, frame one costs a few KB once and everything after it diffs.
 */
function enableTransparency(enc) {
    if (transparencyOn)
        return;
    transparencyOn = true;
    // The encoder only considers palette entries flagged in `usedEntry` when it
    // looks for the colour nearest ours - and only its neuquant path fills that
    // in. Flagging them all keeps the search honest whichever quantiser ran.
    enc.usedEntry = new Array(256).fill(true);
    enc.setTransparent(TRANSPARENT);
}
/**
 * Write the frame that has been waiting, for however long it ended up being
 * held. One frame with a long delay rather than N identical frames: they look
 * the same, but the GIF pays for each of the N in full.
 */
function flush() {
    if (!held)
        return;
    const { pixels, repeat, width, height } = held;
    held = undefined;
    encoder ??= open(width, height);
    // second frame onwards - see enableTransparency
    if (diff && prevPixels)
        enableTransparency(encoder);
    encoder.setDelay(delayMs * repeat);
    encoder.addFrame(mask(pixels));
    prevPixels = pixels;
    // counted in frames of animation, not frames in the file - it is what the
    // recorder reports progress against, and what the session actually looked like
    frames += repeat;
}
function finish() {
    // the last frame of the session is still waiting to be written: nothing was
    // ever going to come along and displace it
    flush();
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
                if (!held || !lastPixels)
                    throw new Error('repeat with no frame before it');
                held.repeat += message.repeat;
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