// Capture and render must agree on terminal geometry: the shell wraps its
// output to these dimensions, and the replay emulator must use the same ones
// or long lines break in different places.
export const COLS = 80;
export const ROWS = 24;
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
export function geometry(config) {
    return {
        cols: Math.min(process.stdout.columns ?? COLS, config.terminal.cols),
        rows: Math.min(process.stdout.rows ?? ROWS, config.terminal.rows)
    };
}
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
export function defaultShell() {
    const override = process.env.PRETTI_SHELL?.trim();
    if (override)
        return override;
    if (process.platform === 'win32')
        return 'powershell.exe';
    return process.env.SHELL?.trim() || 'bash';
}
//# sourceMappingURL=terminal.js.map