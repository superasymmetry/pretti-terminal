// Capture and render must agree on terminal geometry: the shell wraps its
// output to these dimensions, and the replay emulator must use the same ones
// or long lines break in different places.
export const COLS = 80;
export const ROWS = 24;
