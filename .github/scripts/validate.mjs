#!/usr/bin/env node
/**
 * Lightweight source validation used by CI.
 *
 *   node .github/scripts/validate.mjs js        syntax-check every .js file
 *   node .github/scripts/validate.mjs json      parse every .json file
 *   node .github/scripts/validate.mjs manifest  sanity-check manifest.json
 *   node .github/scripts/validate.mjs html      check every asset an .html file points at
 *   node .github/scripts/validate.mjs i18n      check _locales against the strings in use
 *
 * No dependencies: it runs on a bare actions/setup-node step.
 */

import { readFileSync, readdirSync, lstatSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

const IGNORED_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'out']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (IGNORED_DIRS.has(name)) continue;
    const full = join(dir, name);

    let entry;
    try {
      entry = lstatSync(full);
    } catch {
      continue; // Битая ссылка или гонка с другим процессом — просто пропускаем.
    }

    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk('.');
const byExt = (ext) => files.filter((f) => extname(f).toLowerCase() === ext);
const toPosix = (p) => p.split('\\').join('/').replace(/^\.\//, '');

let failures = 0;
const fail = (file, message) => {
  failures++;
  console.error(`FAIL  ${file}\n      ${String(message).split('\n')[0]}`);
};

/** Syntax-check a file as a classic script, falling back to module syntax. */
function checkJs(file) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    return 'script';
  } catch (scriptError) {
    try {
      execFileSync(process.execPath, ['--input-type=module', '--check'], {
        input: readFileSync(file),
        stdio: 'pipe',
      });
      return 'module';
    } catch {
      throw scriptError;
    }
  }
}

function runJs() {
  const targets = byExt('.js');
  if (!targets.length) return console.log('No .js files to check.');
  for (const file of targets) {
    try {
      console.log(`ok  ${toPosix(file)}  (${checkJs(file)})`);
    } catch (error) {
      fail(file, error.stderr ? error.stderr.toString() : error.message);
    }
  }
}

function runJson() {
  const targets = byExt('.json');
  if (!targets.length) return console.log('No .json files to check.');
  for (const file of targets) {
    try {
      JSON.parse(readFileSync(file, 'utf8'));
      console.log(`ok  ${toPosix(file)}`);
    } catch (error) {
      fail(file, error.message);
    }
  }
}

/** Collect every repo-relative path the manifest points at. */
function referencedPaths(manifest) {
  const paths = [];
  const push = (value) => {
    if (typeof value === 'string' && !value.includes('*')) paths.push(value);
  };

  Object.values(manifest.icons ?? {}).forEach(push);
  Object.values(manifest.action?.default_icon ?? {}).forEach(push);
  push(manifest.action?.default_popup);
  push(manifest.background?.service_worker);
  (manifest.background?.scripts ?? []).forEach(push);
  (manifest.content_scripts ?? []).forEach((entry) => {
    (entry.js ?? []).forEach(push);
    (entry.css ?? []).forEach(push);
  });
  (manifest.web_accessible_resources ?? []).forEach((entry) => {
    if (typeof entry === 'string') push(entry);
    else (entry.resources ?? []).forEach(push);
  });
  (manifest.declarative_net_request?.rule_resources ?? []).forEach((rule) => push(rule.path));

  return [...new Set(paths)];
}

function readManifest() {
  if (!existsSync('manifest.json')) return null;
  return JSON.parse(readFileSync('manifest.json', 'utf8'));
}

function runManifest() {
  const manifest = readManifest();
  if (!manifest) {
    console.log('No manifest.json in this repository — nothing to validate.');
    return;
  }

  for (const key of ['manifest_version', 'name', 'version']) {
    if (manifest[key] === undefined) fail('manifest.json', `missing required key "${key}"`);
  }

  if (![2, 3].includes(manifest.manifest_version)) {
    fail('manifest.json', `manifest_version must be 2 or 3, got ${manifest.manifest_version}`);
  }

  if (manifest.version !== undefined && !/^\d+(\.\d+){0,3}$/.test(String(manifest.version))) {
    fail('manifest.json', `version "${manifest.version}" is not a valid extension version`);
  }

  for (const path of referencedPaths(manifest)) {
    if (existsSync(path)) console.log(`ok  manifest -> ${path}`);
    else fail('manifest.json', `references a file that does not exist: ${path}`);
  }
}

/**
 * Every asset an extension page loads has to ship inside the package: a remote
 * stylesheet or script breaks the popup offline, leaks the user to a third
 * party and is a red flag during Chrome Web Store review.
 */
function runHtml() {
  const targets = byExt('.html');
  if (!targets.length) return console.log('No .html files to check.');

  const reference = /\b(?:src|href)\s*=\s*"([^"]*)"/gi;

  for (const file of targets) {
    const source = readFileSync(file, 'utf8');
    const base = dirname(file);

    for (const [, value] of source.matchAll(reference)) {
      const target = value.trim();
      if (!target || target.startsWith('#') || target.startsWith('data:') || target.startsWith('mailto:')) {
        continue;
      }

      if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(target)) {
        fail(file, `loads a remote asset: ${target} — extension pages must ship their assets`);
        continue;
      }

      const resolved = join(base, target.split(/[?#]/)[0]);
      if (existsSync(resolved)) console.log(`ok  ${toPosix(file)} -> ${toPosix(resolved)}`);
      else fail(file, `references a file that does not exist: ${target}`);
    }
  }
}

/**
 * Keeps the locale files and the code honest about each other. A key used in
 * markup but missing from a locale renders as an empty label, which is the kind
 * of breakage nobody notices until a user reports a blank popup.
 */
function runI18n() {
  if (!existsSync('_locales')) {
    console.log('No _locales directory — nothing to validate.');
    return;
  }

  const manifest = readManifest();
  const defaultLocale = manifest?.default_locale;

  if (!defaultLocale) {
    fail('manifest.json', '_locales exists but manifest has no "default_locale"');
    return;
  }
  if (!existsSync(join('_locales', defaultLocale, 'messages.json'))) {
    fail('manifest.json', `default_locale "${defaultLocale}" has no _locales/${defaultLocale}/messages.json`);
    return;
  }

  const locales = readdirSync('_locales').filter((name) =>
    existsSync(join('_locales', name, 'messages.json'))
  );

  const keysByLocale = new Map();
  for (const locale of locales) {
    const path = join('_locales', locale, 'messages.json');
    try {
      keysByLocale.set(locale, new Set(Object.keys(JSON.parse(readFileSync(path, 'utf8')))));
      console.log(`ok  ${toPosix(path)}  (${keysByLocale.get(locale).size} keys)`);
    } catch (error) {
      fail(path, error.message);
    }
  }

  const baseKeys = keysByLocale.get(defaultLocale) ?? new Set();

  for (const [locale, keys] of keysByLocale) {
    if (locale === defaultLocale) continue;
    for (const key of baseKeys) {
      if (!keys.has(key)) fail(`_locales/${locale}/messages.json`, `missing key "${key}"`);
    }
    for (const key of keys) {
      if (!baseKeys.has(key)) fail(`_locales/${locale}/messages.json`, `key "${key}" is not in ${defaultLocale}`);
    }
  }

  const used = new Map(); // key -> where it was seen

  const note = (key, where) => {
    if (!used.has(key)) used.set(key, where);
  };

  for (const file of byExt('.html')) {
    const source = readFileSync(file, 'utf8');
    for (const [, key] of source.matchAll(/\bdata-i18n(?:-[a-z]+)?\s*=\s*"([^"]+)"/gi)) {
      note(key, toPosix(file));
    }
  }

  for (const file of byExt('.js')) {
    const source = readFileSync(file, 'utf8');
    for (const [, key] of source.matchAll(/\bgetMessage\(\s*'([A-Za-z][\w]*)'/g)) note(key, toPosix(file));
    for (const [, key] of source.matchAll(/\bt\(\s*'([A-Za-z][\w]*)'/g)) note(key, toPosix(file));
  }

  for (const [, key] of JSON.stringify(manifest).matchAll(/__MSG_([A-Za-z][\w]*)__/g)) {
    note(key, 'manifest.json');
  }

  for (const [key, where] of used) {
    if (baseKeys.has(key)) console.log(`ok  ${where} -> ${key}`);
    else fail(where, `uses message "${key}", which is missing from _locales/${defaultLocale}/messages.json`);
  }

  const unused = [...baseKeys].filter((key) => !used.has(key));
  if (unused.length) console.log(`\nnote: ${unused.length} message(s) defined but never used: ${unused.join(', ')}`);
}

const task = process.argv[2];
const tasks = { js: runJs, json: runJson, manifest: runManifest, html: runHtml, i18n: runI18n };

if (!tasks[task]) {
  console.error(`Usage: validate.mjs <${Object.keys(tasks).join('|')}>`);
  process.exit(2);
}

tasks[task]();

if (failures) {
  console.error(`\n${failures} problem(s) found.`);
  process.exit(1);
}
console.log('\nAll checks passed.');
