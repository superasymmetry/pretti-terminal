import { type PrettiConfig } from './config.js';
export declare const COLS = 80;
export declare const ROWS = 24;
/**
 * The size to film at: your own window, capped at terminal.cols/rows.
 *
 * Capping rather than fixing keeps a small window looking like itself - filming
 * an 80x24 terminal inside a 100x28 frame would pad the GIF with blank cells
 * nobody asked for. It is a cap and not a preference because the cost is
 * area: a frame is stored whole, every frame, so the widest session anyone
 * happens to have open should not decide how big the file is.
 *
 * COLS/ROWS remain the fallback for when stdout is not a terminal and has no
 * size to report - piped output, CI.
 */
export declare function geometry(config: PrettiConfig): {
    cols: number;
    rows: number;
};
/**
 * Stops before anything is started when there is no terminal to record from.
 *
 * Recording puts stdin in raw mode, so every keystroke reaches the shell being
 * filmed instead of being buffered into lines - and raw mode only exists on a
 * TTY. Piped or redirected input has no setRawMode at all, so without this the
 * session dies on a TypeError from inside node, several steps after the point
 * where the real answer ("run this in a terminal") was still obvious.
 *
 * Called before the browser is opened and before the shell is spawned: this is
 * not a recoverable condition, and there is no reason to leave either of them
 * running while we work that out.
 */
export declare function requireInteractiveTerminal(): void;
/**
 * The shell to film. A recording is meant to look like the user's own terminal,
 * so their login shell is what runs - a zsh or fish user recording a bash
 * prompt is filming someone else's setup.
 *
 * PRETTI_SHELL overrides everywhere, which is also the only way to change it on
 * Windows: COMSPEC is set to cmd.exe on every install and is not a statement of
 * preference, so honouring it would quietly hand everyone cmd instead of the
 * PowerShell they were getting before.
 */
export declare function defaultShell(): string;
//# sourceMappingURL=terminal.d.ts.map