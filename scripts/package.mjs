/**
 * Package `dist/` into the zip the Chrome Web Store expects.
 *
 * The store wants a zip whose *root* is the manifest — not a folder containing
 * it — which is the single most common upload rejection.
 */

import { execFile } from 'node:child_process';
import { access, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { readFile } from 'node:fs/promises';

const run = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = resolve(projectRoot, 'dist');
const releaseDir = resolve(projectRoot, 'release');

const pkg = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8'));
const zipPath = resolve(releaseDir, `thumbsup-${pkg.version}.zip`);

try {
  await access(resolve(distDir, 'manifest.json'));
} catch {
  throw new Error('dist/manifest.json not found — run `npm run build` first.');
}

await mkdir(releaseDir, { recursive: true });
await rm(zipPath, { force: true });

// -r recurse, -q quiet, -X drop macOS resource forks the store flags as junk.
await run('zip', ['-r', '-q', '-X', zipPath, '.', '-x', '.*', '__MACOSX/*'], { cwd: distDir });

const { size } = await (await import('node:fs/promises')).stat(zipPath);
console.log(`✔ ${zipPath} (${(size / 1024 / 1024).toFixed(1)} MB)`);
console.log('  upload at https://chrome.google.com/webstore/devconsole');
