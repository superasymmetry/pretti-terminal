import xtermHeadless from '@xterm/headless';
import { COLS, ROWS } from './terminal.js';
import { type PrettiConfig } from './config.js';
declare const Terminal: typeof xtermHeadless.Terminal;
type Terminal = InstanceType<typeof Terminal>;
export { COLS, ROWS };
export declare function frameIntervalMs(config: PrettiConfig): number;
/** How many frames one output event occupies - at least one, however brief. */
export declare function holdFrames(config: PrettiConfig): number;
export declare function snapshot(term: Terminal, config: PrettiConfig): string;
export declare function write(term: Terminal, data: string): Promise<void>;
/**
 * Every colour the theme can put on a pixel, for choosing a transparent colour
 * that collides with none of them.
 *
 * The terminal's own colours are the ones that matter: they are what changes
 * between frames, and a collision only shows as a ghost where something
 * changed. The window chrome is here for good measure - it is identical in
 * every frame, so it would be transparent regardless.
 */
export declare function themeColors(config: PrettiConfig): string[];
export declare function wrapInChrome(terminalHtml: string, config: PrettiConfig): string;
export declare const VIEWPORT: {
    width: number;
    height: number;
};
export declare function main(): Promise<void>;
//# sourceMappingURL=render.d.ts.map