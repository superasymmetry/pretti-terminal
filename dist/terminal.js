import { ConfigError } from './config.js';
// Capture and render must agree on terminal geometry: the shell wraps its
// output to these dimensions, and the replay emulator must use the same ones
// or long lines break in different places.
export const COLS = 80;
export const ROWS = 24;
export function geometry(config) {
    return {
        cols: Math.min(process.stdout.columns ?? COLS, config.terminal.cols),
        rows: Math.min(process.stdout.rows ?? ROWS, config.terminal.rows)
    };
}
export function requireInteractiveTerminal() {
    if (process.stdin.isTTY)
        return;
    throw new ConfigError('pretti records a live terminal session, and its input is not coming from a terminal.\n' +
        'Run pretti straight from your shell, rather than with its input piped or redirected.\n\n' +
        'To make a GIF without recording anything, render one from a capture you already have:\n\n' +
        '    pretti render capture.jsonl out.gif');
}
export function defaultShell() {
    const override = process.env.PRETTI_SHELL?.trim();
    if (override)
        return override;
    if (process.platform === 'win32')
        return 'powershell.exe';
    return process.env.SHELL?.trim() || 'bash';
}
//# sourceMappingURL=terminal.js.map