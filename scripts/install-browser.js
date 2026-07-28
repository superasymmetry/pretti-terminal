// install-browser.js - fetch the headless browser pretti renders frames in.
//
// Runs from npm's postinstall hook, and again from `pretti install` when that
// hook was skipped or failed. Plain JavaScript on purpose: postinstall runs
// before prepare, so dist/ may not have been built yet and nothing here can
// depend on the compiled output.
//
// Two things this is careful about:
//
//   - It only fetches the headless shell. pretti always launches headless, and
//     headless Chromium is a separate, smaller binary from the full browser -
//     `playwright install chromium` would download both and leave the larger
//     half sitting on disk unused.
//
//   - Run from postinstall it never fails the install. A download that cannot
//     finish - offline, a proxy, a locked-down CI box - should leave pretti
//     installed and tell the user how to finish, not unwind the whole thing.

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

// Kept in step with the channels src/browser.ts accepts. Duplicated rather
// than imported: this file has to run before src/ is compiled.
const CHANNELS = ['chrome', 'msedge'];

/** Where Playwright will put the browser, for the message before the wait. */
function cacheDir() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return process.env.PLAYWRIGHT_BROWSERS_PATH;

  const home = os.homedir();
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'), 'ms-playwright');
  }
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Caches', 'ms-playwright');
  return path.join(home, '.cache', 'ms-playwright');
}

/**
 * Playwright's own CLI, which owns the download. Resolved through its
 * package.json: the package's `exports` map does not publish cli.js, so
 * resolving it directly fails with ERR_PACKAGE_PATH_NOT_EXPORTED.
 */
function playwrightCli() {
  const require = createRequire(import.meta.url);
  return path.join(path.dirname(require.resolve('playwright/package.json')), 'cli.js');
}

/**
 * Downloads the browser unless something says not to.
 *
 * Returns `{ ok }` - true when pretti has a browser to use afterwards, counting
 * one that was already there and one the user pointed us at. A false comes with
 * a `reason`, because the two failures need opposite advice: a download that did
 * not finish should be retried, while a misspelled PRETTI_BROWSER would fail the
 * same way however many times it is retried.
 */
export function installBrowser() {
  const channel = process.env.PRETTI_BROWSER;
  if (channel) {
    if (!CHANNELS.includes(channel)) {
      console.error(
        `PRETTI_BROWSER is set to "${channel}", which is not one of ${CHANNELS.join(', ')}. ` +
        'Unset it to use the browser pretti downloads.'
      );
      return { ok: false, reason: 'bad-channel' };
    }
    console.log(`Using your installed ${channel}, as PRETTI_BROWSER asks. Nothing to download.`);
    return { ok: true };
  }

  if (process.env.PRETTI_SKIP_BROWSER_DOWNLOAD) {
    console.log('Skipping the browser download (PRETTI_SKIP_BROWSER_DOWNLOAD). Run `pretti install` when you want it.');
    return { ok: true };
  }

  // Said before the wait, not after: a silent minute of nothing is the thing
  // being fixed here. Phrased for both outcomes, because Playwright prints
  // nothing at all when the browser is already there - promising a download
  // that then visibly does not happen is its own small confusion.
  console.log('pretti renders each frame in a headless browser.');
  console.log('Checking for it now - about 270MB to download, one time only.');
  console.log(`  -> ${cacheDir()}`);
  console.log('');

  // --only-shell is the whole saving: the headless shell, not the full browser.
  const result = spawnSync(
    process.execPath,
    [playwrightCli(), 'install', 'chromium', '--only-shell'],
    { stdio: 'inherit' }
  );

  return result.status === 0 ? { ok: true } : { ok: false, reason: 'download-failed' };
}

/** What to say when the download did not happen and pretti still needs one. */
export function reportMissing() {
  console.log('');
  console.log('pretti is installed, but it could not download its browser.');
  console.log('Finish that whenever you are ready:');
  console.log('');
  console.log('    pretti install');
  console.log('');
  console.log('Or point pretti at a browser you already have: PRETTI_BROWSER=chrome');
}

// Run as npm's postinstall hook. Nothing here is allowed to fail the install,
// so a failed download reports itself and still exits 0.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let result;
  try {
    result = installBrowser();
  } catch (error) {
    console.error(`Could not download the browser: ${error.message}`);
    result = { ok: false, reason: 'download-failed' };
  }
  // A misspelled PRETTI_BROWSER has already said what is wrong with it, and
  // pointing that user at `pretti install` would only send them round again.
  if (!result.ok && result.reason !== 'bad-channel') reportMissing();
  process.exit(0);
}
