const EXIT_LINE = /^\s*(exit|logout)\b/;
const EXIT_WORDS = ['exit', 'logout'];

const WIN32_KEY = /^\x1b\[([0-9;]*)_/;

// Arrow keys, focus notifications and the rest: real key events, but not text.
const CSI = /^\x1b\[[0-9;?]*[ -/]*[@-~]/;
const SS3 = /^\x1bO./;

// As much of a sequence as can arrive without its terminator yet. Anything that
// is not a prefix of a real sequence is a bare Escape keypress instead.
const PARTIAL = /^\x1b(\[[0-9;?]*|O)?$/;

function win32Char(params: string): string | null {
  const [, , uc, kd] = params.split(';');
  // Both default to "yes, a press" when omitted, which is what a bare `ESC [ _`
  // would mean.
  if (kd === '0') return null;
  const code = Number(uc ?? 0);
  return code > 0 ? String.fromCharCode(code) : null;
}

export class ExitTracker {
  private typed = '';
  private lineStart: number | null = null;
  private armed = false;

  exitIndex: number | null = null;

  private couldBecomeExit(): boolean {
    if (EXIT_LINE.test(this.typed)) return true;
    const line = this.typed.replace(/^\s+/, '');
    return EXIT_WORDS.some((word) => word.startsWith(line));
  }

  get cutFloor(): number | null {
    if (this.exitIndex !== null) return this.exitIndex;
    return this.couldBecomeExit() ? this.lineStart : null;
  }

  // A sequence split across two reads waits here for its other half.
  private carry = '';

  private *decode(data: string): Generator<string> {
    let rest = this.carry + data;
    this.carry = '';

    while (rest) {
      if (rest[0] !== '\x1b') {
        yield rest[0]!;
        rest = rest.slice(1);
        continue;
      }

      const key = WIN32_KEY.exec(rest);
      if (key) {
        const ch = win32Char(key[1]!);
        if (ch) yield ch;
        rest = rest.slice(key[0].length);
        continue;
      }

      const other = CSI.exec(rest) ?? SS3.exec(rest);
      if (other) {
        rest = rest.slice(other[0].length);
        continue;
      }

      // Still unterminated, but only worth waiting on if more of it could
      // finish the job. Testing for that rather than just buffering is what
      // keeps a lone Escape from swallowing the line typed after it.
      if (PARTIAL.test(rest)) {
        this.carry = rest;
        return;
      }
      rest = rest.slice(1);
    }
  }

  // `outIndex` is how many output events have been logged so far.
  onInput(data: string, outIndex: number): void {
    for (const ch of this.decode(data)) {
      if (this.armed) {
        this.armed = false;
        this.exitIndex = null;
      }

      if (ch === '\r' || ch === '\n') {
        this.armed = EXIT_LINE.test(this.typed);
        this.exitIndex = this.armed ? this.lineStart : null;
        this.typed = '';
        this.lineStart = null;
        continue;
      }

      if (ch === '\x7f' || ch === '\b') {
        this.typed = this.typed.slice(0, -1);
        if (!this.typed) this.lineStart = null;
        continue;
      }

      if (!this.typed) this.lineStart = outIndex;
      this.typed += ch;
    }
  }
}
