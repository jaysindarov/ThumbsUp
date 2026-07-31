/**
 * Stage the MediaPipe runtime into `public/` so the extension ships everything
 * it needs and never fetches code at runtime — a hard requirement of MV3.
 *
 *   public/wasm/    the tasks-vision WebAssembly runtime (copied from npm)
 *   public/models/  the hand landmark model (downloaded once, then cached)
 *
 * Both directories are gitignored: they are build inputs, not source.
 */

import { cp, mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSource = resolve(projectRoot, 'node_modules/@mediapipe/tasks-vision/wasm');
const wasmTarget = resolve(projectRoot, 'public/wasm');
const modelTarget = resolve(projectRoot, 'public/models/hand_landmarker.task');

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function copyWasmRuntime() {
  if (!(await exists(wasmSource))) {
    throw new Error(
      `MediaPipe wasm runtime not found at ${wasmSource}. Run \`npm install\` first.`,
    );
  }
  await mkdir(dirname(wasmTarget), { recursive: true });
  await cp(wasmSource, wasmTarget, { recursive: true });
  console.log('✔ wasm runtime staged → public/wasm');
}

async function downloadModel() {
  if (await exists(modelTarget)) {
    console.log('✔ hand landmark model already present');
    return;
  }
  await mkdir(dirname(modelTarget), { recursive: true });
  console.log('… downloading hand landmark model (~7 MB)');

  const response = await fetch(MODEL_URL);
  if (!response.ok) {
    throw new Error(`model download failed: ${response.status} ${response.statusText}`);
  }
  await writeFile(modelTarget, Buffer.from(await response.arrayBuffer()));
  console.log('✔ hand landmark model staged → public/models');
}

await copyWasmRuntime();
await downloadModel();
