export interface CursorConfig {
    /** block paints the cell, underline draws a bar under it, none hides it */
    style: 'block' | 'underline' | 'none';
    /** the painted cell's background; ignored by `underline` and `none` */
    background: string;
    /** the character sitting inside a block cursor */
    foreground: string;
}
export interface TerminalConfig {
    cols: number;
    rows: number;
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
export interface OutputConfig {
    directory: string;
    /** the file's name. A name with no extension gets `.gif` */
    name: string;
}
export interface PrettiConfig {
    output: OutputConfig;
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
/** The file's JSON, unvalidated - only the keys it actually sets. */
export declare function readRawConfig(file: string): Record<string, unknown>;
export declare function readConfigFile(file: string): PrettiConfig;
export declare function takeOverrideArgs(argv?: string[]): Record<string, unknown>;
/** The dotted paths a patch actually sets, for reporting back what changed. */
export declare function patchPaths(patch: Record<string, unknown>, prefix?: string): string[];
export declare function takeConfigArg(argv?: string[]): void;
/** The config file in force, or undefined when the defaults are being used. */
export declare function configSource(): string | undefined;
/** The flags given this run, as a config patch. */
export declare function overrideArgs(): Record<string, unknown>;
/** The resolved config - file first, then flags on top - read once per process. */
export declare function loadConfig(): PrettiConfig;
export declare function resolveOutputPath(config: PrettiConfig, explicit?: string): string;
export declare function writeConfig(file: string, patch: Record<string, unknown>): 'created' | 'updated';
//# sourceMappingURL=config.d.ts.map