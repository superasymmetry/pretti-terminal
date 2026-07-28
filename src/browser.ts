import { chromium, type Browser } from 'playwright';

import { ConfigError } from './config.js';


const CHANNELS = ['chrome', 'msedge'] as const;
type Channel = (typeof CHANNELS)[number];

function isChannel(value: string): value is Channel {
  return (CHANNELS as readonly string[]).includes(value);
}

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
