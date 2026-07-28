import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface CursorConfig {
  /** block paints the cell, underline draws a bar under it, none hides it */
  style: 'block' | 'underline' | 'none';
  /** the painted cell's background; ignored by `underline` and `none` */
  background: string;
  /** the character sitting inside a block cursor */
  foreground: string;
}

export interface TerminalConfig {
  cols: number;
  rows: number;
  background: string;
  foreground: string;
  cursor: CursorConfig;
  /**
   * The 16 ANSI colors, in order: black, red, green, yellow, blue, magenta,
   * cyan, white, then the same eight again as their bright variants. Colors
   * 16-255 are the standard xterm cube and are not configurable.
   */
  palette: string[];
}

export interface FontConfig {
  family: string;
  size: number;
  lineHeight: number;
  letterSpacing: string;
  /** off by default: ligatures make `->` and `!=` render as glyphs */
  ligatures: boolean;
}

export interface StyleConfig {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  dim: boolean;
  /** map bold + a color from the first eight to its bright twin, as most terminals do */
  brightenBold: boolean;
}

export interface TitleBarConfig {
  show: boolean;
  background: string;
  /** the traffic lights, left to right; any number of them */
  buttons: string[];
}

export interface WindowConfig {
  /** any CSS background value - a flat color, a gradient, whatever */
  background: string;
  /** space between the window and the edge of the image, in px */
  margin: number;
  /** space between the terminal text and the window edge, in px */
  padding: number;
  radius: number;
  shadow: string;
  titleBar: TitleBarConfig;
}

export interface AnimationConfig {
  fps: number;
  /** how long one output event is held on screen, in ms */
  holdMs: number;
  /** gif-encoder-2 quality: 1 is best and slowest, 20 is worst and fastest */
  quality: number;
}

export interface OutputConfig {
  directory: string;
  /** the file's name. A name with no extension gets `.gif` */
  name: string;
}

export interface PrettiConfig {
  output: OutputConfig;
  terminal: TerminalConfig;
  font: FontConfig;
  styles: StyleConfig;
  window: WindowConfig;
  animation: AnimationConfig;
}

export const DEFAULT_CONFIG: PrettiConfig = {
  output: {
    directory: '~/Downloads',
    name: 'output.gif'
  },
  terminal: {
    cols: 100,
    rows: 28,
    background: '#2b2d3a',
    foreground: '#f8f8f2',
    cursor: {
      style: 'block',
      background: '#f8f8f2',
      foreground: '#2b2d3a'
    },
    palette: [
      '#3b3d4a', '#ff6b7f', '#7ee787', '#ffd479',
      '#79b8ff', '#d2a8ff', '#76e4e4', '#d8d8e0',
      '#5c5f70', '#ff9aa8', '#a9f4ae', '#ffe6ab',
      '#a6d2ff', '#e3c9ff', '#a8f0f0', '#f8f8f2'
    ]
  },
  font: {
    family: "'Cascadia Code','JetBrains Mono',Consolas,ui-monospace,monospace",
    size: 15,
    lineHeight: 1.55,
    letterSpacing: '.02em',
    ligatures: false
  },
  styles: {
    bold: true,
    italic: true,
    underline: true,
    dim: true,
    brightenBold: false
  },
  window: {
    background: 'linear-gradient(150deg,#6f76e0,#8d6ec9)',
    margin: 56,
    padding: 28,
    radius: 16,
    shadow: '0 30px 80px rgba(0,0,0,.45)',
    titleBar: {
      show: true,
      background: '#23252f',
      buttons: ['#ff5f56', '#ffbd2e', '#27c93f']
    }
  },
  animation: {
    fps: 10,
    holdMs: 100,
    quality: 10
  }
};

/** Where a config is looked for, nearest first, when none was named. */
export function searchPaths(): string[] {
  const home = os.homedir();
  return [
    path.resolve('pretti.config.json'),
    path.join(home, '.pretti.json'),
    path.join(home, '.config', 'pretti', 'config.json')
  ];
}

export class ConfigError extends Error {}

// --- validation ------------------------------------------------------------

function fail(where: string, message: string): never {
  throw new ConfigError(`${where}: ${message}`);
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function color(where: string, value: unknown): string {
  if (typeof value !== 'string' || !HEX.test(value.trim())) {
    fail(where, `expected a hex color like "#1a2b3c", got ${JSON.stringify(value)}`);
  }
  const hex = (value as string).trim().toLowerCase();
  return hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;
}

function css(where: string, value: unknown): string {
  if (typeof value !== 'string') fail(where, `expected a string, got ${JSON.stringify(value)}`);
  return value as string;
}

function filePath(where: string, value: unknown): string {
  if (typeof value !== 'string') fail(where, `expected a string, got ${JSON.stringify(value)}`);
  const text = (value as string).trim();
  if (!text) fail(where, 'expected a path, got an empty string');
  return text;
}

function num(where: string, value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(where, `expected a number, got ${JSON.stringify(value)}`);
  }
  const n = value as number;
  if (n < min || n > max) fail(where, `expected a number between ${min} and ${max}, got ${n}`);
  return n;
}

function bool(where: string, value: unknown): boolean {
  if (typeof value !== 'boolean') fail(where, `expected true or false, got ${JSON.stringify(value)}`);
  return value as boolean;
}

function choice<T extends string>(where: string, value: unknown, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    fail(where, `expected one of ${allowed.map((a) => `"${a}"`).join(', ')}, got ${JSON.stringify(value)}`);
  }
  return value as T;
}

function section(where: string, value: unknown, known: string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(where, `expected an object, got ${JSON.stringify(value)}`);
  }
  for (const key of Object.keys(value as object)) {
    if (!known.includes(key)) {
      fail(`${where}.${key}`, `unknown setting (expected one of ${known.join(', ')})`);
    }
  }
  return value as Record<string, unknown>;
}

/** Applies `patch` over `base`, checking each key it actually sets. */
function merge<T extends object>(
  where: string,
  base: T,
  patch: unknown,
  readers: { [K in keyof T]: (where: string, value: unknown) => T[K] }
): T {
  if (patch === undefined) return base;
  const raw = section(where, patch, Object.keys(readers));
  const out = { ...base };
  for (const key of Object.keys(raw) as (keyof T)[]) {
    out[key] = readers[key](`${where}.${String(key)}`, raw[key as string]);
  }
  return out;
}

function palette(where: string, value: unknown): string[] {
  if (!Array.isArray(value) || value.length !== 16) {
    fail(where, `expected an array of exactly 16 hex colors, got ${
      Array.isArray(value) ? `${value.length} of them` : JSON.stringify(value)
    }`);
  }
  return (value as unknown[]).map((entry, i) => color(`${where}[${i}]`, entry));
}

function buttons(where: string, value: unknown): string[] {
  if (!Array.isArray(value)) fail(where, `expected an array of hex colors, got ${JSON.stringify(value)}`);
  return (value as unknown[]).map((entry, i) => color(`${where}[${i}]`, entry));
}

/** Validates a parsed config object and fills in every key it left out. */
export function resolveConfig(raw: unknown, source = 'config'): PrettiConfig {
  const top = section(source, raw ?? {}, ['output', 'terminal', 'font', 'styles', 'window', 'animation']);
  const d = DEFAULT_CONFIG;

  return {
    output: merge(`${source}.output`, d.output, top.output, {
      directory: filePath,
      name: filePath
    }),
    terminal: merge(`${source}.terminal`, d.terminal, top.terminal, {
      cols: (w, v) => num(w, v, 20, 500),
      rows: (w, v) => num(w, v, 5, 200),
      background: color,
      foreground: color,
      cursor: (where, value) => merge(where, d.terminal.cursor, value, {
        style: (w, v) => choice(w, v, ['block', 'underline', 'none'] as const),
        background: color,
        foreground: color
      }),
      palette
    }),
    font: merge(`${source}.font`, d.font, top.font, {
      family: css,
      size: (w, v) => num(w, v, 1, 400),
      lineHeight: (w, v) => num(w, v, 0.5, 10),
      letterSpacing: css,
      ligatures: bool
    }),
    styles: merge(`${source}.styles`, d.styles, top.styles, {
      bold: bool,
      italic: bool,
      underline: bool,
      dim: bool,
      brightenBold: bool
    }),
    window: merge(`${source}.window`, d.window, top.window, {
      background: css,
      margin: (w, v) => num(w, v, 0, 2000),
      padding: (w, v) => num(w, v, 0, 2000),
      radius: (w, v) => num(w, v, 0, 2000),
      shadow: css,
      titleBar: (where, value) => merge(where, d.window.titleBar, value, {
        show: bool,
        background: color,
        buttons
      })
    }),
    animation: merge(`${source}.animation`, d.animation, top.animation, {
      fps: (w, v) => num(w, v, 1, 50),
      holdMs: (w, v) => num(w, v, 1, 10_000),
      quality: (w, v) => num(w, v, 1, 20)
    })
  };
}

/** The file's JSON, unvalidated - only the keys it actually sets. */
export function readRawConfig(file: string): Record<string, unknown> {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf-8');
  } catch (error) {
    throw new ConfigError(`Cannot read config ${file}: ${(error as Error).message}`);
  }

  let parsed: unknown;
  try {
    // Windows editors save UTF-8 with a byte order mark, which JSON.parse
    // rejects as a stray character before the opening brace.
    parsed = JSON.parse(text.replace(/^﻿/, ''));
  } catch (error) {
    throw new ConfigError(`${file} is not valid JSON: ${(error as Error).message}`);
  }

  if (!isPlainObject(parsed)) {
    throw new ConfigError(`${path.basename(file)}: expected an object, got ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

export function readConfigFile(file: string): PrettiConfig {
  return resolveConfig(readRawConfig(file), path.basename(file));
}

// --- command-line overrides ------------------------------------------------
//
// Every setting can also be given as a flag, so a one-off tweak needs no file
// at all: `pretti --terminal.background '#111' --font.size 24`. The flag name
// is the path to the setting, which keeps the flags and the file describing
// the same thing - there is no second vocabulary to learn or keep in sync.

/** Short names for the settings people reach for most. */
const ALIASES: Record<string, string> = {
  'out-dir': 'output.directory',
  'out-name': 'output.name',
  cols: 'terminal.cols',
  rows: 'terminal.rows',
  bg: 'terminal.background',
  fg: 'terminal.foreground',
  cursor: 'terminal.cursor.style',
  palette: 'terminal.palette',
  'font-size': 'font.size',
  'font-family': 'font.family',
  'window-bg': 'window.background',
  margin: 'window.margin',
  padding: 'window.padding',
  radius: 'window.radius',
  'title-bar': 'window.titleBar.show',
  fps: 'animation.fps',
  hold: 'animation.holdMs',
  quality: 'animation.quality'
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function defaultAt(flag: string, keys: string[]): unknown {
  let node: unknown = DEFAULT_CONFIG;
  const walked: string[] = [];

  for (const key of keys) {
    if (!isPlainObject(node) || !(key in node)) {
      const known = isPlainObject(node) ? Object.keys(node).join(', ') : 'nothing';
      const where = walked.length ? `${walked.join('.')} has` : 'settings are';
      throw new ConfigError(`${flag}: unknown setting (${where} ${known})`);
    }
    node = node[key];
    walked.push(key);
  }

  if (isPlainObject(node)) {
    throw new ConfigError(
      `${flag}: needs a specific setting, one of ${Object.keys(node).map((k) => `${keys.join('.')}.${k}`).join(', ')}`
    );
  }
  return node;
}

function coerce(flag: string, text: string, fallback: unknown): unknown {
  if (typeof fallback === 'number') {
    const value = Number(text);
    if (!Number.isFinite(value)) throw new ConfigError(`${flag}: expected a number, got "${text}"`);
    return value;
  }

  if (typeof fallback === 'boolean') {
    if (['true', 'yes', 'on', '1'].includes(text)) return true;
    if (['false', 'no', 'off', '0'].includes(text)) return false;
    throw new ConfigError(`${flag}: expected true or false, got "${text}"`);
  }

  if (Array.isArray(fallback)) {
    if (text.trim().startsWith('[')) {
      try {
        return JSON.parse(text);
      } catch {
        throw new ConfigError(`${flag}: not a valid JSON array: ${text}`);
      }
    }
    return text.split(',').map((entry) => entry.trim());
  }

  return text;
}

function setPath(target: Record<string, unknown>, keys: string[], value: unknown): void {
  let node = target;
  for (const key of keys.slice(0, -1)) {
    if (!isPlainObject(node[key])) node[key] = {};
    node = node[key] as Record<string, unknown>;
  }
  node[keys.at(-1)!] = value;
}

function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    out[key] = isPlainObject(value) && isPlainObject(out[key])
      ? deepMerge(out[key] as Record<string, unknown>, value)
      : value;
  }
  return out;
}


export function takeOverrideArgs(argv: string[] = process.argv): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  for (let i = 2; i < argv.length; ) {
    const arg = argv[i]!;
    // --help and --version are the CLI's own, and are left where they are
    if (!arg.startsWith('--') || arg === '--' || arg === '--help' || arg === '--version') {
      i++;
      continue;
    }

    const equals = arg.indexOf('=');
    let name = (equals === -1 ? arg.slice(2) : arg.slice(2, equals));
    let text = equals === -1 ? undefined : arg.slice(equals + 1);

    const negated = !ALIASES[name] && name.startsWith('no-');
    if (negated) name = name.slice(3);

    const keys = (ALIASES[name] ?? name).split('.');
    const fallback = defaultAt(arg, keys);

    if (typeof fallback === 'boolean' && text === undefined) {
      // bare flag: --title-bar means on, --no-title-bar means off
      setPath(patch, keys, !negated);
      argv.splice(i, 1);
      continue;
    }

    if (negated) throw new ConfigError(`${arg}: only on/off settings can be negated`);

    let consumed = 1;
    if (text === undefined) {
      text = argv[i + 1];
      // a value may legitimately look like a flag (a negative number, say), so
      // only a missing one is an error
      if (text === undefined) throw new ConfigError(`${arg}: needs a value`);
      consumed = 2;
    }

    setPath(patch, keys, coerce(arg, text, fallback));
    argv.splice(i, consumed);
  }

  return patch;
}

/** The dotted paths a patch actually sets, for reporting back what changed. */
export function patchPaths(patch: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(patch).flatMap(([key, value]) =>
    isPlainObject(value)
      ? patchPaths(value, `${prefix}${key}.`)
      : [`${prefix}${key}`]
  );
}

/**
 * Checks a patch on its own, so a bad flag is reported as the flag the user
 * typed rather than as a line in a file they never edited.
 */
function validateOverrides(patch: Record<string, unknown>): void {
  try {
    resolveConfig(patch, '');
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    throw new ConfigError(`--${error.message.replace(/^\./, '')}`);
  }
}

// --- loading ---------------------------------------------------------------

let explicitPath: string | undefined;
let overrides: Record<string, unknown> | undefined;
let cached: PrettiConfig | undefined;
let taken = false;


export function takeConfigArg(argv: string[] = process.argv): void {
  taken = true;
  takeConfigPath(argv);
  const patch = takeOverrideArgs(argv);
  validateOverrides(patch);
  overrides = patch;
}

function takeConfigPath(argv: string[]): void {
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--config') {
      const value = argv[i + 1];
      if (!value || value.startsWith('-')) throw new ConfigError('--config needs a file path');
      explicitPath = value;
      argv.splice(i, 2);
      return;
    }
    if (arg.startsWith('--config=')) {
      const value = arg.slice('--config='.length);
      if (!value) throw new ConfigError('--config needs a file path');
      explicitPath = value;
      argv.splice(i, 1);
      return;
    }
  }
}

/** The config file in force, or undefined when the defaults are being used. */
export function configSource(): string | undefined {
  if (!taken) takeConfigArg();
  if (explicitPath) return path.resolve(explicitPath);
  if (process.env.PRETTI_CONFIG) return path.resolve(process.env.PRETTI_CONFIG);
  return searchPaths().find((candidate) => fs.existsSync(candidate));
}

/** The flags given this run, as a config patch. */
export function overrideArgs(): Record<string, unknown> {
  if (!taken) takeConfigArg();
  return overrides ?? {};
}

/** The resolved config - file first, then flags on top - read once per process. */
export function loadConfig(): PrettiConfig {
  if (cached) return cached;
  const source = configSource();
  const raw = source ? readRawConfig(source) : {};
  cached = resolveConfig(
    deepMerge(raw, overrideArgs()),
    source ? path.basename(source) : 'config'
  );
  return cached;
}

// --- output path -----------------------------------------------------------

/** Expands a leading ~ , which a hand-edited config is likely to contain. */
function expandHome(target: string): string {
  if (target === '~') return os.homedir();
  if (target.startsWith('~/') || target.startsWith('~\\')) {
    return path.join(os.homedir(), target.slice(2));
  }
  return target;
}


export function resolveOutputPath(config: PrettiConfig, explicit?: string): string {
  const { directory, name } = config.output;
  const filename = path.extname(name) ? name : `${name}.gif`;

  const target = explicit
    ? path.resolve(expandHome(explicit))
    : path.resolve(expandHome(directory), filename);

  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
  } catch (error) {
    throw new ConfigError(`Cannot create ${path.dirname(target)}: ${(error as Error).message}`);
  }
  return target;
}


export function writeConfig(file: string, patch: Record<string, unknown>): 'created' | 'updated' {
  const exists = fs.existsSync(file);

  if (exists && Object.keys(patch).length === 0) {
    throw new ConfigError(
      `${file} already exists. Name the settings to change (e.g. pretti config ${file} --bg '#101014'), ` +
      'or delete it to start over.'
    );
  }

  const base = exists ? readRawConfig(file) : (DEFAULT_CONFIG as unknown as Record<string, unknown>);
  const merged = deepMerge(base, patch);
  // never write a file that would not load
  resolveConfig(merged, path.basename(file));

  fs.writeFileSync(file, JSON.stringify(merged, null, 2) + '\n');
  return exists ? 'updated' : 'created';
}
