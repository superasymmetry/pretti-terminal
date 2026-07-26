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
export declare function wrapInChrome(terminalHtml: string, config: PrettiConfig): string;
export declare const VIEWPORT: {
    width: number;
    height: number;
};
export declare function main(): Promise<void>;
//# sourceMappingURL=render.d.ts.map