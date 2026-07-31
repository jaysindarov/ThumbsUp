/**
 * Build the unpacked extension into `dist/`.
 *
 * Two output formats are needed and Rollup can only emit one per build, so this
 * runs Vite three times:
 *
 *   1. ES modules  — extension pages (popup, detector) and the service worker.
 *      These load as real modules under the extension's own origin.
 *   2. IIFE ×2     — the two content scripts. MV3 content scripts are classic
 *      scripts: no `import`, no code splitting, one file each.
 *
 * Finally the manifest is materialised from `src/manifest.json` +
 * `src/sites.json` + the package version.
 */

import { readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = resolve(projectRoot, 'src');
const outDir = resolve(projectRoot, 'dist');
const watch = process.argv.includes('--watch');

/** Chrome 111 is the floor: it introduced `"world": "MAIN"` content scripts. */
const TARGET = 'chrome111';

const shared = {
  configFile: false,
  root: srcRoot,
  resolve: { alias: { '@': srcRoot } },
  logLevel: 'info',
};

async function buildPages() {
  await build({
    ...shared,
    publicDir: resolve(projectRoot, 'public'),
    build: {
      outDir,
      emptyOutDir: true,
      target: TARGET,
      sourcemap: false,
      modulePreload: false,
      watch: watch ? {} : null,
      rollupOptions: {
        input: {
          popup: resolve(srcRoot, 'popup/index.html'),
          detector: resolve(srcRoot, 'detector/index.html'),
          serviceWorker: resolve(srcRoot, 'background/serviceWorker.ts'),
        },
        output: {
          format: 'es',
          entryFileNames: (chunk) =>
            chunk.name === 'serviceWorker' ? 'background/serviceWorker.js' : 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
  });
}

/**
 * Content scripts must be single self-contained classic scripts.
 * `inlineDynamicImports` guarantees no chunk splitting sneaks in.
 */
async function buildContentScript(entry, outFile) {
  await build({
    ...shared,
    publicDir: false,
    build: {
      outDir,
      emptyOutDir: false,
      target: TARGET,
      sourcemap: false,
      watch: watch ? {} : null,
      rollupOptions: {
        input: resolve(srcRoot, entry),
        output: {
          format: 'iife',
          entryFileNames: outFile,
          inlineDynamicImports: true,
          // Content scripts share the page's global object; never leak a name.
          name: undefined,
          extend: false,
        },
      },
    },
  });
}

async function writeManifest() {
  const [manifestTemplate, sites, pkg] = await Promise.all([
    readJson(resolve(srcRoot, 'manifest.json')),
    readJson(resolve(srcRoot, 'sites.json')),
    readJson(resolve(projectRoot, 'package.json')),
  ]);

  const manifest = expand(manifestTemplate, sites.matches);
  manifest.version = pkg.version;
  await writeFile(resolve(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

/** Replace every `"__SITES__"` placeholder with the real match-pattern list. */
function expand(value, sites) {
  if (value === '__SITES__') return [...sites];
  if (Array.isArray(value)) return value.map((item) => expand(item, sites));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, expand(v, sites)]));
  }
  return value;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function main() {
  if (!watch) await rm(outDir, { recursive: true, force: true });

  await buildPages();
  await buildContentScript('content/bridge.ts', 'content/bridge.js');
  await buildContentScript('page/cameraHook.ts', 'page/cameraHook.js');
  await writeManifest();

  console.log(`\n✔ extension built → ${outDir}`);
  if (watch) console.log('  watching for changes…');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
