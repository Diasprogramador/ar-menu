/** Generate dependable local catalog covers with the same models used in AR. */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const candidates = [
  process.env.BLENDER_PATH,
  'C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe',
  'C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe',
  process.platform === 'win32' ? null : 'blender',
].filter(Boolean);
const blender = candidates.find((candidate) => candidate === 'blender' || existsSync(candidate));

if (!blender) throw new Error('Blender not found. Set BLENDER_PATH to the Blender executable.');

const expression = [
  `PROJECT_ROOT=${JSON.stringify(process.cwd())}`,
  `exec(compile(open(PROJECT_ROOT+r'/scripts/render-menu-covers.py', encoding='utf-8').read(), 'render-menu-covers.py', 'exec'))`,
].join(';');

const result = spawnSync(blender, ['--background', '--python-expr', expression], {
  stdio: 'inherit',
  windowsHide: true,
});

if (result.status !== 0) process.exit(result.status ?? 1);
