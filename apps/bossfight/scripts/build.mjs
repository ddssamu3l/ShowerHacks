import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
export const root = fileURLToPath(new URL('../', import.meta.url));
export const options = {
  absWorkingDir: root, entryPoints: ['src/main.js', 'src/game.js'], bundle: true,
  outdir: 'dist', sourcemap: true, target: 'es2022', format: 'esm',
};
if (process.argv[1] === fileURLToPath(import.meta.url)) await build({ ...options, minify: true });
