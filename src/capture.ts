import * as fs from 'node:fs';
import * as pty from '@lydell/node-pty';

import { defaultShell, geometry, requireInteractiveTerminal } from './terminal.js';

import { ExitTracker } from './exit-trim.js';
import { loadConfig } from './config.js';

requireInteractiveTerminal();

const shell = defaultShell();
const outFile = process.argv[2] ?? 'capture.jsonl';

const { cols, rows } = geometry(loadConfig());

const ptyProcess = pty.spawn(shell, [], {
  name: 'xterm-color',
  cols,
  rows,
  cwd: process.cwd(),
  env: process.env
});

const out = fs.createWriteStream(outFile);
const start = Date.now();
const record = (event: object) => out.write(JSON.stringify(event) + '\n');
record({ t: 0, type: 'meta', cols, rows });

const exitTracker = new ExitTracker();
let outCount = 0;

// pty output -> screen, and -> capture file
ptyProcess.onData((data) => {
  process.stdout.write(data);
  record({ t: Date.now() - start, type: 'out', data });
  outCount++;
});

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