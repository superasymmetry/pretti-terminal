// config.ts - the look of the GIF, in one editable file.
//
// Everything the renderer draws that is not the text itself lives here: the
// terminal palette, the font, the window chrome around it, and the pace of the
// animation. render.ts and record.ts both read the same resolved config, so a
// live recording and a later re-render of the same capture come out identical.
//
// Nothing is required. A config file may set one key or fifty; whatever it
// leaves out falls back to DEFAULT_CONFIG.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
export const DEFAULT_CONFIG = {
    terminal: {
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
        size: 19,
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
export function searchPaths() {
    const home = os.homedir();
    return [
        path.resolve('pretti.config.json'),
        path.join(home, '.pretti.json'),
        path.join(home, '.config', 'pretti', 'config.json')
    ];
}
export class ConfigError extends Error {
}
// --- validation ------------------------------------------------------------
//
// A config is hand-edited, so a typo is the expected failure, not the strange
// one. Every check names the key it failed on, and an unknown key is an error
// rather than a silent no-op - misspelling `backgruond` should not look like
// the setting simply had no effect.
function fail(where, message) {
    throw new ConfigError(`${where}: ${message}`);
}
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
/** Expands #abc to #aabbcc so downstream code only ever sees one shape. */
function color(where, value) {
    if (typeof value !== 'string' || !HEX.test(value.trim())) {
        fail(where, `expected a hex color like "#1a2b3c", got ${JSON.stringify(value)}`);
    }
    const hex = value.trim().toLowerCase();
    return hex.length === 4
        ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
        : hex;
}
/** For CSS values we hand to the browser verbatim - gradients, shadows, fonts. */
function css(where, value) {
    if (typeof value !== 'string')
        fail(where, `expected a string, got ${JSON.stringify(value)}`);
    return value;
}
function num(where, value, min, max) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        fail(where, `expected a number, got ${JSON.stringify(value)}`);
    }
    const n = value;
    if (n < min || n > max)
        fail(where, `expected a number between ${min} and ${max}, got ${n}`);
    return n;
}
function bool(where, value) {
    if (typeof value !== 'boolean')
        fail(where, `expected true or false, got ${JSON.stringify(value)}`);
    return value;
}
function choice(where, value, allowed) {
    if (typeof value !== 'string' || !allowed.includes(value)) {
        fail(where, `expected one of ${allowed.map((a) => `"${a}"`).join(', ')}, got ${JSON.stringify(value)}`);
    }
    return value;
}
function section(where, value, known) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        fail(where, `expected an object, got ${JSON.stringify(value)}`);
    }
    for (const key of Object.keys(value)) {
        if (!known.includes(key)) {
            fail(`${where}.${key}`, `unknown setting (expected one of ${known.join(', ')})`);
        }
    }
    return value;
}
/** Applies `patch` over `base`, checking each key it actually sets. */
function merge(where, base, patch, readers) {
    if (patch === undefined)
        return base;
    const raw = section(where, patch, Object.keys(readers));
    const out = { ...base };
    for (const key of Object.keys(raw)) {
        out[key] = readers[key](`${where}.${String(key)}`, raw[key]);
    }
    return out;
}
function palette(where, value) {
    if (!Array.isArray(value) || value.length !== 16) {
        fail(where, `expected an array of exactly 16 hex colors, got ${Array.isArray(value) ? `${value.length} of them` : JSON.stringify(value)}`);
    }
    return value.map((entry, i) => color(`${where}[${i}]`, entry));
}
function buttons(where, value) {
    if (!Array.isArray(value))
        fail(where, `expected an array of hex colors, got ${JSON.stringify(value)}`);
    return value.map((entry, i) => color(`${where}[${i}]`, entry));
}
/** Validates a parsed config object and fills in every key it left out. */
export function resolveConfig(raw, source = 'config') {
    const top = section(source, raw ?? {}, ['terminal', 'font', 'styles', 'window', 'animation']);
    const d = DEFAULT_CONFIG;
    return {
        terminal: merge(`${source}.terminal`, d.terminal, top.terminal, {
            background: color,
            foreground: color,
            cursor: (where, value) => merge(where, d.terminal.cursor, value, {
                style: (w, v) => choice(w, v, ['block', 'underline', 'none']),
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
export function readConfigFile(file) {
    let text;
    try {
        text = fs.readFileSync(file, 'utf-8');
    }
    catch (error) {
        throw new ConfigError(`Cannot read config ${file}: ${error.message}`);
    }
    let parsed;
    try {
        // Windows editors save UTF-8 with a byte order mark, which JSON.parse
        // rejects as a stray character before the opening brace.
        parsed = JSON.parse(text.replace(/^﻿/, ''));
    }
    catch (error) {
        throw new ConfigError(`${file} is not valid JSON: ${error.message}`);
    }
    return resolveConfig(parsed, path.basename(file));
}
// --- loading ---------------------------------------------------------------
//
// record/capture/render each read process.argv positionally, so `--config` is
// pulled out of argv before they see it. cli.ts does that up front; the
// fallback in load() covers running a module directly with `node dist/....js`.
let explicitPath;
let cached;
let taken = false;
/**
 * Removes `--config <path>` (or `--config=<path>`) from argv, remembering it.
 * Safe to call more than once - only the first call finds anything.
 */
export function takeConfigArg(argv = process.argv) {
    taken = true;
    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--config') {
            const value = argv[i + 1];
            if (!value || value.startsWith('-'))
                throw new ConfigError('--config needs a file path');
            explicitPath = value;
            argv.splice(i, 2);
            return;
        }
        if (arg.startsWith('--config=')) {
            const value = arg.slice('--config='.length);
            if (!value)
                throw new ConfigError('--config needs a file path');
            explicitPath = value;
            argv.splice(i, 1);
            return;
        }
    }
}
/** The config file in force, or undefined when the defaults are being used. */
export function configSource() {
    if (!taken)
        takeConfigArg();
    if (explicitPath)
        return path.resolve(explicitPath);
    if (process.env.PRETTI_CONFIG)
        return path.resolve(process.env.PRETTI_CONFIG);
    return searchPaths().find((candidate) => fs.existsSync(candidate));
}
/** The resolved config, read once per process. */
export function loadConfig() {
    if (cached)
        return cached;
    const source = configSource();
    cached = source ? readConfigFile(source) : DEFAULT_CONFIG;
    return cached;
}
/** Writes a config file holding every setting at its default value. */
export function writeDefaultConfig(file) {
    if (fs.existsSync(file)) {
        throw new ConfigError(`${file} already exists - delete it first, or pass another path.`);
    }
    fs.writeFileSync(file, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
}
//# sourceMappingURL=config.js.map