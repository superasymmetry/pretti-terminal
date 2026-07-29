#!/usr/bin/env node
import { ConfigError, overrideArgs, patchPaths, takeConfigArg, writeConfig } from './config.js';
const HELP = `pretti - record your terminal, get a GIF

Usage
  pretti [record] [out.gif] [capture.jsonl]   record a session and render it (default)
  pretti capture [capture.jsonl]              record only, no GIF
  pretti render [capture.jsonl] [out.gif]     render a GIF from an earlier capture
  pretti config [pretti.config.json] [...]    write or edit a config file
  pretti install                              download the browser used to render

Options
  --config <file>  theme to render with (default: the nearest one found)
  -h, --help       show this message
  -v, --version    show the version

Settings
  Any setting can be given as a flag, named for its path in the config file:

    pretti --terminal.background '#101014' --font.size 24
    pretti render --animation.fps 15 old.jsonl slow.gif

  Short names for the common ones: --out-dir, --out-name, --cols, --rows,
  --bg, --fg, --cursor, --palette, --font-size, --font-family, --window-bg,
  --margin, --padding, --radius, --title-bar, --fps, --hold, --quality. On/off
  settings take a bare flag either way: --no-title-bar, --styles.dim,
  --no-font.ligatures.

Size
  A GIF stores every frame whole, so the file costs roughly the area of one
  frame times the number of them. --cols, --rows and --font-size are the
  levers that matter, in that order; each one shrinks every frame at once.

    pretti --cols 80 --rows 20        a smaller stage, for a smaller file

  Recording is capped at 100x28 cells whatever size your window is, since the
  terminal you happen to have open should not decide how big the GIF comes
  out. A smaller window is filmed at its own size, not padded out to the cap.

Notes
  Recording starts a shell - your own, from $SHELL, so the prompt in the GIF is
  the one you use. Set PRETTI_SHELL to film a different one, which on Windows
  is also how to record anything other than PowerShell. Use it normally, then
  type \`exit\` to stop and write the GIF. The .jsonl capture is always kept, so
  you can re-render the same session later without re-recording it.

  The GIF lands in your Downloads folder, as output.gif, so it does not end up
  among the files of whatever project you were demoing. output.directory and
  output.name set where it goes and what it is called, and the directory is
  created if it does not exist. Naming a file on the command line still wins
  for that one run, and is taken relative to the directory you ran in.

    pretti demo.gif                                   here, just this once
    pretti config --out-dir '~/Videos/demos' --out-name 'latest.gif'

  Colors, fonts, window chrome and timing come from a config file. Without
  --config, pretti looks for ./pretti.config.json, then ~/.pretti.json, then
  ~/.config/pretti/config.json, and falls back to its built-in theme. Flags
  win over the file, and only for that run.

  \`pretti config\` writes a file with every setting at its default. Given
  settings, it saves them instead of applying them once - \`pretti config --bg
  '#101014'\` edits the file the same way opening it in an editor would.

  Frames are rendered in a headless browser, downloaded once when pretti is
  installed. If that did not happen - no network at the time, or you skipped it
  with PRETTI_SKIP_BROWSER_DOWNLOAD - \`pretti install\` fetches it later. To use
  a browser you already have instead, and download nothing, set PRETTI_BROWSER
  to chrome or msedge.
`;
const COMMANDS = ['record', 'capture', 'render', 'config', 'install'];
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
    const command = isCommand(first) ? first : 'record';
    if (isCommand(first))
        process.argv.splice(2, 1);
    if (command === 'config') {
        const file = process.argv[2] ?? 'pretti.config.json';
        const patch = overrideArgs();
        const result = writeConfig(file, patch);
        console.log(result === 'created'
            ? `Wrote ${file}. Edit it, or change it with flags: pretti config ${file} --bg '#101014'`
            : `Updated ${file}: ${patchPaths(patch).join(', ')}`);
    }
    else if (command === 'install') {
        const url = new URL('../scripts/install-browser.js', import.meta.url);
        const { installBrowser, reportMissing } = await import(url.href);
        const result = installBrowser();
        if (!result.ok) {
            if (result.reason !== 'bad-channel')
                reportMissing();
            process.exitCode = 1;
        }
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