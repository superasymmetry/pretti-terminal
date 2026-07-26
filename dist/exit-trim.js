// exit-trim.ts - find where the `exit` that ends the session starts.
//
// Typing `exit` is how you stop recording, but it is stage machinery, not part
// of the demo: the GIF should end on the last real command's output. The shell
// echoes those keystrokes like any other output, so they cannot be told apart
// after the fact - by the time we know the line said `exit`, its echo is
// already several output events deep.
//
// So the recorders watch stdin instead. Every keystroke is seen before the echo
// it causes, which makes "how many output events had we logged when this line
// began?" an exact answer. On Enter, if the line was an exit, that index is the
// cut point; the recorder writes it into the capture as a trailer and the
// renderer stops there.
// `logout` ends a login shell the same way. \b matches `exit 0` too, but not a
// command that merely starts with those letters.
const EXIT_LINE = /^\s*(exit|logout)\b/;
const EXIT_WORDS = ['exit', 'logout'];
// Keystrokes do not always arrive as the characters they stand for.
//
// ConPTY asks for win32-input-mode, and because the recorder forwards every
// byte the shell emits, that request reaches the real terminal too - so on
// Windows the keys come back encoded, one sequence per key event:
//
//   ESC [ Vk ; Sc ; Uc ; Kd ; Cs ; Rc _      `e` -> ESC [ 69;18;101;1;0;1 _
//
// Uc is the character, Kd is 1 for press and 0 for release. The shell speaks
// this fluently, so a session records fine; only this tracker was reading the
// wire as plain text and seeing gibberish where `exit` should have been.
const WIN32_KEY = /^\x1b\[([0-9;]*)_/;
// Arrow keys, focus notifications and the rest: real key events, but not text.
const CSI = /^\x1b\[[0-9;?]*[ -/]*[@-~]/;
const SS3 = /^\x1bO./;
// As much of a sequence as can arrive without its terminator yet. Anything that
// is not a prefix of a real sequence is a bare Escape keypress instead.
const PARTIAL = /^\x1b(\[[0-9;?]*|O)?$/;
/**
 * The character a win32-input-mode key event stands for, or null when it does
 * not stand for one: key releases (which would otherwise count as a second
 * keystroke for every key) and keys with no character at all, like Shift.
 */
function win32Char(params) {
    const [, , uc, kd] = params.split(';');
    // Both default to "yes, a press" when omitted, which is what a bare `ESC [ _`
    // would mean.
    if (kd === '0')
        return null;
    const code = Number(uc ?? 0);
    return code > 0 ? String.fromCharCode(code) : null;
}
export class ExitTracker {
    typed = '';
    lineStart = null;
    // Was the last line finished an exit, with nothing typed since? Only that line
    // can be the one that ended the session - see onInput.
    armed = false;
    // Index of the first output event belonging to the exit command, or null if
    // the session did not end with one (Ctrl+D, a crash, a kill).
    exitIndex = null;
    // Can the line being typed still turn into an exit? An exit line starts with
    // `exit` or `logout`, so while it is being typed it has to be a prefix of one
    // of them - `ec` never becomes either. Waiting for Enter to find that out is
    // what used to hold a whole command's frames hostage.
    couldBecomeExit() {
        if (EXIT_LINE.test(this.typed))
            return true;
        const line = this.typed.replace(/^\s+/, '');
        return EXIT_WORDS.some((word) => word.startsWith(line));
    }
    // The earliest output event a trim could still cut at, or null if nothing
    // recorded so far can be cut. A cut always lands on the start of a line, so
    // once the line being typed cannot become an exit, everything is settled and
    // safe to encode immediately.
    //
    // Backspacing an already-doomed line back into an exit (`echo` -> `e` ->
    // `exit`, without passing through empty) can therefore leave a few frames of
    // the abandoned typing in the GIF. It costs a couple of stray frames at the
    // very end of a recording, which is worth not stalling every other session.
    get cutFloor() {
        if (this.exitIndex !== null)
            return this.exitIndex;
        return this.couldBecomeExit() ? this.lineStart : null;
    }
    // A sequence split across two reads waits here for its other half.
    carry = '';
    /**
     * The characters a chunk of stdin actually typed. Encoded key events become
     * the character they carry, sequences that are not text are dropped, and
     * everything else passes through as itself - which is the whole of it on a
     * terminal that sends plain keystrokes.
     */
    *decode(data) {
        let rest = this.carry + data;
        this.carry = '';
        while (rest) {
            if (rest[0] !== '\x1b') {
                yield rest[0];
                rest = rest.slice(1);
                continue;
            }
            const key = WIN32_KEY.exec(rest);
            if (key) {
                const ch = win32Char(key[1]);
                if (ch)
                    yield ch;
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
    onInput(data, outIndex) {
        for (const ch of this.decode(data)) {
            // The exit that ends the recording is the last thing typed in the session:
            // the shell is gone, so there is nothing left to type into. An exit still
            // followed by keystrokes was therefore part of the demo - it closed a
            // nested shell or a REPL, and the session ended some other way (Ctrl+D,
            // Ctrl+C, a kill). Disarming here rather than waiting for the next Enter
            // matters because those endings send no Enter at all: without this, a
            // demo's `exit` stays armed to the end and the trim eats every frame after
            // it. Any key counts, so re-arming needs a fresh exit line of its own.
            if (this.armed) {
                this.armed = false;
                this.exitIndex = null;
            }
            if (ch === '\r' || ch === '\n') {
                // Set on every Enter, not just matching ones: typing `exit` somewhere
                // that does not exit (a nested shell, a REPL) must not leave a stale
                // cut point behind for the rest of the session.
                this.armed = EXIT_LINE.test(this.typed);
                this.exitIndex = this.armed ? this.lineStart : null;
                this.typed = '';
                this.lineStart = null;
                continue;
            }
            if (ch === '\x7f' || ch === '\b') {
                this.typed = this.typed.slice(0, -1);
                // Backspacing to an empty line restarts it. The erased keystrokes stay
                // in the GIF, which is right - they happened on screen.
                if (!this.typed)
                    this.lineStart = null;
                continue;
            }
            if (!this.typed)
                this.lineStart = outIndex;
            this.typed += ch;
        }
    }
}
//# sourceMappingURL=exit-trim.js.map