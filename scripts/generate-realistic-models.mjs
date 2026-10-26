/** Run the Blender catalog generator and produce normalized GLB/USDZ assets. */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const render = process.env.MODEL_RENDERS === '1';
const candidates = [
  process.env.BLENDER_PATH,
  'C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe',
  'C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe',
  process.platform === 'win32' ? null : 'blender',
].filter(Boolean);
const blender = candidates.find((candidate) => candidate === 'blender' || existsSync(candidate));

if (!blender) {
  throw new Error('Blender not found. Set BLENDER_PATH to the Blender executable.');
}

const expression = [
  `PROJECT_ROOT=${JSON.stringify(root)}`,
  `RENDER=${render ? 'True' : 'False'}`,
  `exec(compile(open(PROJECT_ROOT+r'/scripts/blender-realistic-catalog.py', encoding='utf-8').read(), 'blender-realistic-catalog.py', 'exec'))`,
].filter(Boolean).join('; ');

const generated = spawnSync(blender, ['--background', '--python-expr', expression], {
  cwd: root,
  stdio: 'inherit',
});
if (generated.status !== 0) process.exit(generated.status ?? 1);

const allSlugs = [
  'bolinho-de-costela', 'aneis-de-cebola', 'batata-crocante', 'smash-bacon',
  'burger-da-casa', 'smash-duplo-cheddar', 'pizza-margherita', 'pizza-pepperoni',
  'pizza-quatro-queijos', 'costela-defumada', 'salada-caesar', 'picanha-na-brasa',
  'brownie', 'petit-gateau', 'pudim-de-leite', 'milkshake', 'refrigerante',
  'suco-natural', 'agua-com-gas',
];

for (const slug of allSlugs) {
  const finalized = spawnSync(process.execPath, ['scripts/finalize-blender-model.mjs', slug], {
    cwd: root,
    stdio: 'inherit',
  });
  if (finalized.status !== 0) process.exit(finalized.status ?? 1);
}
