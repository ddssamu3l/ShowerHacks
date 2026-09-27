import { context } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { root, options } from './build.mjs';
const build = await context(options);
await build.watch();
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.json': 'application/json', '.map': 'application/json', '.png': 'image/png', '.bin': 'application/octet-stream', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const base = path.resolve(/^(models|audio)\//.test(relative) ? path.join(root, 'public') : root);
    const file = path.resolve(base, relative);
    if (!file.startsWith(base + path.sep) || !(await stat(file)).isFile()) throw new Error('Not found');
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(4173, '127.0.0.1', () => console.log('Shower Souls: http://127.0.0.1:4173'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { server.close(); await build.dispose(); process.exit(); });
