/**
 * Package `dist/` into the zip the Chrome Web Store expects, after checking the
 * things the store rejects uploads for.
 *
 * The checks are here rather than in a doc because a rejected upload costs a
 * full review cycle — days, not minutes.
 */

import { execFile } from 'node:child_process';
import { access, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = resolve(projectRoot, 'dist');
const releaseDir = resolve(projectRoot, 'release');

/** Store-enforced listing limits. */
const LIMITS = { name: 45, short_name: 12, description: 132 };

const problems = [];
const notes = [];

function require_(condition, message) {
  if (!condition) problems.push(message);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir, base = '') {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = join(base, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(join(dir, entry.name), rel)));
    else out.push(rel);
  }
  return out;
}

/* ------------------------------- checks ------------------------------- */

if (!(await exists(join(distDir, 'manifest.json')))) {
  throw new Error('dist/manifest.json not found — run `npm run build` first.');
}

const manifest = JSON.parse(await readFile(join(distDir, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8'));
const files = await walk(distDir);

require_(manifest.manifest_version === 3, 'manifest_version must be 3; MV2 uploads are rejected.');
require_(
  manifest.version === pkg.version,
  `dist manifest version (${manifest.version}) does not match package.json (${pkg.version}) — rebuild.`,
);
require_(
  /^\d+(\.\d+){0,3}$/.test(manifest.version ?? ''),
  `version "${manifest.version}" must be 1–4 dot-separated integers.`,
);

for (const [field, max] of Object.entries(LIMITS)) {
  const value = manifest[field];
  require_(typeof value === 'string' && value.length > 0, `manifest.${field} is missing.`);
  require_(
    typeof value !== 'string' || value.length <= max,
    `manifest.${field} is ${value?.length} chars; the store allows ${max}.`,
  );
}

// The store shows the 128px icon on the listing; without it the upload is
// accepted but the listing cannot be published.
require_(files.includes(join('icons', 'icon-128.png')), 'icons/icon-128.png is missing.');

require_(
  !manifest.host_permissions?.includes('<all_urls>'),
  '<all_urls> triggers the slowest review tier — narrow it in src/sites.json.',
);
require_(
  !('key' in manifest),
  'manifest contains a "key" field; remove it before uploading a public build.',
);

const sourceMaps = files.filter((f) => f.endsWith('.map'));
require_(sourceMaps.length === 0, `source maps would ship to users: ${sourceMaps.join(', ')}`);

const junk = files.filter((f) => f.includes('.DS_Store') || f.startsWith('__MACOSX'));
require_(junk.length === 0, `remove junk files: ${junk.join(', ')}`);

// Every script the manifest names must actually exist in the build output.
const declared = [
  manifest.background?.service_worker,
  ...(manifest.content_scripts ?? []).flatMap((entry) => entry.js ?? []),
  manifest.action?.default_popup,
  ...(manifest.web_accessible_resources ?? []).flatMap((entry) => entry.resources ?? []),
].filter(Boolean);

for (const relative of declared) {
  require_(await exists(join(distDir, relative)), `manifest references missing file: ${relative}`);
}

// Reviewers flag extensions that fetch code at runtime. Ours must not.
const modelPresent = files.some((f) => f.endsWith('.task'));
const wasmPresent = files.some((f) => f.endsWith('.wasm'));
require_(modelPresent, 'the hand landmark model is missing — run `npm run assets`.');
require_(wasmPresent, 'the MediaPipe wasm runtime is missing — run `npm run assets`.');

if (!(await exists(resolve(projectRoot, 'PRIVACY.md')))) {
  notes.push('PRIVACY.md is missing; the listing needs a hosted privacy policy URL.');
}

if (problems.length > 0) {
  console.error('\n✖ not ready to upload:\n');
  for (const problem of problems) console.error(`  · ${problem}`);
  console.error('');
  process.exit(1);
}

/* ------------------------------ packaging ----------------------------- */

const zipPath = resolve(releaseDir, `thumbsup-${manifest.version}.zip`);
await mkdir(releaseDir, { recursive: true });
await rm(zipPath, { force: true });

// The store requires the manifest at the *root* of the zip, so zip the contents
// of dist/ rather than the folder itself. -X drops macOS resource forks.
await run('zip', ['-r', '-q', '-X', zipPath, '.', '-x', '.*', '__MACOSX/*'], { cwd: distDir });

const { size } = await stat(zipPath);
console.log(`\n✔ ${zipPath}`);
console.log(`  ${files.length} files, ${(size / 1024 / 1024).toFixed(1)} MB`);
console.log(`  version ${manifest.version}, ${manifest.host_permissions?.length ?? 0} host permissions`);
for (const note of notes) console.log(`  ! ${note}`);
console.log('\n  Upload: https://chrome.google.com/webstore/devconsole');
console.log('  Checklist and reviewer answers: docs/STORE.md\n');
