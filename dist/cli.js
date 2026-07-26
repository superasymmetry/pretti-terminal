#!/usr/bin/env node
// cli.ts - the single entry point users actually type.
//
// record/capture/render are each standalone programs that read process.argv
// directly. Rather than rewrite them, this dispatches to one of them and
// removes the subcommand token from argv first, so each module sees exactly
// the argv shape it saw when it was run as `node dist/record.js ...`.
import { ConfigError, takeConfigArg, writeDefaultConfig } from './config.js';
const HELP = `pretti - record your terminal, get a GIF

Usage
  pretti [record] [out.gif] [capture.jsonl]   record a session and render it (default)
  pretti capture [capture.jsonl]              record only, no GIF
  pretti render [capture.jsonl] [out.gif]     render a GIF from an earlier capture
  pretti config [pretti.config.json]          write a config file you can edit

Options
  --config <file>  theme to render with (default: the nearest one found)
  -h, --help       show this message
  -v, --version    show the version

Notes
  Recording starts a shell. Use it normally, then type \`exit\` to stop and
  write the GIF. The .jsonl capture is always kept, so you can re-render the
  same session later without re-recording it.

  Colors, fonts, window chrome and timing come from a config file. Without
  --config, pretti looks for ./pretti.config.json, then ~/.pretti.json, then
  ~/.config/pretti/config.json, and falls back to its built-in theme. Run
  \`pretti config\` to write one out with every setting at its default, then
  edit it and re-render - \`pretti render\` restyles an old capture without
  recording it again.
`;
const COMMANDS = ['record', 'capture', 'render', 'config'];
function isCommand(value) {
    return COMMANDS.includes(value);
}
async function main() {
    // Pull --config out of argv before anything else looks at it: the three
    // programs below read their arguments positionally and would mistake it for
    // a filename.
    takeConfigArg();
    const first = process.argv[2];
    if (first === '-h' || first === '--help') {
        console.log(HELP);
        return;
    }
    if (first === '-v' || first === '--version') {
        // read lazily: only this path needs the manifest
        const { readFileSync } = await import('node:fs');
        const url = new URL('../package.json', import.meta.url);
        const pkg = JSON.parse(readFileSync(url, 'utf-8'));
        console.log(pkg.version);
        return;
    }
    if (first?.startsWith('-')) {
        console.error(`Unknown option: ${first}\n`);
        console.error(HELP);
        process.exitCode = 1;
        return;
    }
    // Bare `pretti` means record - the common case gets no ceremony. Anything
    // that is not a known subcommand is treated as record's first argument, so
    // `pretti demo.gif` works too.
    const command = isCommand(first) ? first : 'record';
    if (isCommand(first))
        process.argv.splice(2, 1);
    // These modules do their work on import, except render, which exports main.
    if (command === 'config') {
        const file = process.argv[2] ?? 'pretti.config.json';
        writeDefaultConfig(file);
        console.log(`Wrote ${file}. Edit it, then run pretti again to use it.`);
    }
    else if (command === 'render') {
        const { main: render } = await import('./render.js');
        await render();
    }
    else {
        await import(command === 'record' ? './record.js' : './capture.js');
    }
}
main().catch((error) => {
    // A bad config is a user typo, not a crash: show the message, skip the stack
    if (!(error instanceof ConfigError))
        throw error;
    console.error(error.message);
    process.exitCode = 1;
});
//# sourceMappingURL=cli.js.map