import * as fs from 'node:fs';
// see record.ts on why this is the fork and not node-pty itself
import * as pty from '@lydell/node-pty';

import { defaultShell, geometry } from './terminal.js';
import { loadConfig } from './config.js';
import { ExitTracker } from './exit-trim.js';

const shell = defaultShell();
const outFile = process.argv[2] ?? 'capture.jsonl';

// The geometry caps are the only thing a bare capture takes from the config -
// it draws nothing - but they have to be honoured here too. They are baked into
// the `meta` line below, and a later render replays at whatever it finds there.
const { cols, rows } = geometry(loadConfig());

const ptyProcess = pty.spawn(shell, [], {
  name: 'xterm-color',
  cols,
  rows,
  cwd: process.cwd(),
  env: process.env
});

// capture file is line-delimited JSON, one tagged event per line, t in ms
// since start
const out = fs.createWriteStream(outFile);
const start = Date.now();
const record = (event: object) => out.write(JSON.stringify(event) + '\n');

// geometry first: the shell wraps its output to this size, so the replay
// emulator has to use the same one or long lines break in different places
record({ t: 0, type: 'meta', cols, rows });

const exitTracker = new ExitTracker();
let outCount = 0;

// pty output -> screen, and -> capture file
ptyProcess.onData((data) => {
  process.stdout.write(data);
  record({ t: Date.now() - start, type: 'out', data });
  outCount++;
});

// keystrokes -> pty. Raw mode sends each key straight through (arrows, Tab,
// Ctrl+C) instead of letting Node buffer lines and swallow signals.
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on('data', (data) => {
  const text = data.toString();
  // before the write, so the index is taken ahead of the echo it produces
  exitTracker.onInput(text, outCount);
  ptyProcess.write(text);
});

ptyProcess.onExit(({ exitCode }) => {
  process.stdin.setRawMode(false);
  // A trailer, not a header: which line ended the session is only known now.
  if (exitTracker.exitIndex !== null) {
    record({ t: Date.now() - start, type: 'trim', index: exitTracker.exitIndex });
  }
  // flush buffered writes before exiting, or the tail of the capture is lost
  out.end(() => process.exit(exitCode));
});