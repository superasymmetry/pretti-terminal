// browser.ts - one place that opens the browser frames are rendered in.
//
// record.ts and render.ts both need it, and both need the same two things said
// when it is not there. The download is not part of installing pretti any more
// - it can be skipped, and it is allowed to fail - so "no browser" is a state a
// user can really be in, and it has to read as an instruction rather than as a
// stack trace from inside Playwright.

import { chromium, type Browser } from 'playwright';

import { ConfigError } from './config.js';

/**
 * Browsers pretti will use instead of downloading its own, named by
 * PRETTI_BROWSER. Playwright calls these channels: an ordinary Chrome or Edge
 * already installed on the machine.
 */
const CHANNELS = ['chrome', 'msedge'] as const;
type Channel = (typeof CHANNELS)[number];

function isChannel(value: string): value is Channel {
  return (CHANNELS as readonly string[]).includes(value);
}

/**
 * Playwright reports a browser that was never downloaded by pointing at the
 * path it looked in. Matched on the phrasing rather than an error class because
 * it does not export one for this.
 */
function isMissingBrowser(message: string): boolean {
  return /Executable doesn't exist|is not found at|Failed to launch/i.test(message);
}

export async function launchBrowser(): Promise<Browser> {
  const requested = process.env.PRETTI_BROWSER;

  if (requested !== undefined && !isChannel(requested)) {
    throw new ConfigError(
      `PRETTI_BROWSER: expected one of ${CHANNELS.join(', ')}, got "${requested}". ` +
      'Unset it to use the browser pretti downloads.'
    );
  }

  try {
    return await chromium.launch(requested ? { channel: requested } : {});
  } catch (error) {
    const message = (error as Error).message;
    if (!isMissingBrowser(message)) throw error;

    // Their browser, their choice of it: say which one is missing rather than
    // offering a download they deliberately opted out of.
    if (requested) {
      throw new ConfigError(
        `PRETTI_BROWSER is set to "${requested}", but no ${requested} could be started.\n` +
        'Install it, pick the other one, or unset PRETTI_BROWSER and run `pretti install` ' +
        'to use the browser pretti downloads.'
      );
    }

    throw new ConfigError(
      'pretti renders each frame in a headless browser, and has not downloaded one yet.\n' +
      'Run this once:\n\n    pretti install\n\n' +
      'Or use a browser you already have: PRETTI_BROWSER=chrome'
    );
  }
}
