export interface CursorConfig {
    /** block paints the cell, underline draws a bar under it, none hides it */
    style: 'block' | 'underline' | 'none';
    /** the painted cell's background; ignored by `underline` and `none` */
    background: string;
    /** the character sitting inside a block cursor */
    foreground: string;
}
export interface TerminalConfig {
    background: string;
    foreground: string;
    cursor: CursorConfig;
    /**
     * The 16 ANSI colors, in order: black, red, green, yellow, blue, magenta,
     * cyan, white, then the same eight again as their bright variants. Colors
     * 16-255 are the standard xterm cube and are not configurable.
     */
    palette: string[];
}
export interface FontConfig {
    family: string;
    size: number;
    lineHeight: number;
    letterSpacing: string;
    /** off by default: ligatures make `->` and `!=` render as glyphs */
    ligatures: boolean;
}
export interface StyleConfig {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    dim: boolean;
    /** map bold + a color from the first eight to its bright twin, as most terminals do */
    brightenBold: boolean;
}
export interface TitleBarConfig {
    show: boolean;
    background: string;
    /** the traffic lights, left to right; any number of them */
    buttons: string[];
}
export interface WindowConfig {
    /** any CSS background value - a flat color, a gradient, whatever */
    background: string;
    /** space between the window and the edge of the image, in px */
    margin: number;
    /** space between the terminal text and the window edge, in px */
    padding: number;
    radius: number;
    shadow: string;
    titleBar: TitleBarConfig;
}
export interface AnimationConfig {
    fps: number;
    /** how long one output event is held on screen, in ms */
    holdMs: number;
    /** gif-encoder-2 quality: 1 is best and slowest, 20 is worst and fastest */
    quality: number;
}
export interface PrettiConfig {
    terminal: TerminalConfig;
    font: FontConfig;
    styles: StyleConfig;
    window: WindowConfig;
    animation: AnimationConfig;
}
export declare const DEFAULT_CONFIG: PrettiConfig;
/** Where a config is looked for, nearest first, when none was named. */
export declare function searchPaths(): string[];
export declare class ConfigError extends Error {
}
/** Validates a parsed config object and fills in every key it left out. */
export declare function resolveConfig(raw: unknown, source?: string): PrettiConfig;
export declare function readConfigFile(file: string): PrettiConfig;
/**
 * Removes `--config <path>` (or `--config=<path>`) from argv, remembering it.
 * Safe to call more than once - only the first call finds anything.
 */
export declare function takeConfigArg(argv?: string[]): void;
/** The config file in force, or undefined when the defaults are being used. */
export declare function configSource(): string | undefined;
/** The resolved config, read once per process. */
export declare function loadConfig(): PrettiConfig;
/** Writes a config file holding every setting at its default value. */
export declare function writeDefaultConfig(file: string): void;
//# sourceMappingURL=config.d.ts.map