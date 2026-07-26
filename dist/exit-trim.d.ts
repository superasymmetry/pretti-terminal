export declare class ExitTracker {
    private typed;
    private lineStart;
    private armed;
    exitIndex: number | null;
    private couldBecomeExit;
    get cutFloor(): number | null;
    private carry;
    /**
     * The characters a chunk of stdin actually typed. Encoded key events become
     * the character they carry, sequences that are not text are dropped, and
     * everything else passes through as itself - which is the whole of it on a
     * terminal that sends plain keystrokes.
     */
    private decode;
    onInput(data: string, outIndex: number): void;
}
//# sourceMappingURL=exit-trim.d.ts.map