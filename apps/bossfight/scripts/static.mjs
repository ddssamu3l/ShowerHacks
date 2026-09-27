import { readFile, stat } from 'node:fs/promises';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import path from 'node:path';

const gzipAsync = promisify(gzip);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.glb': 'model/gltf-binary', '.json': 'application/json', '.map': 'application/json', '.png': 'image/png', '.bin': 'application/octet-stream', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.txt': 'text/plain; charset=utf-8' };
const compressible = new Set(['.html', '.js', '.css', '.json', '.map', '.glb', '.bin', '.txt']);
const assetPattern = /^(models|audio)\//;

async function fileInfo(file) {
  try { const info = await stat(file); return info.isFile() ? info : null; } catch { return null; }
}

// Serves the game from `root`, with /models and /audio mapped to public/.
// In production, /models prefers the WebP copies in dist/models, and gzip runs
// off the event loop so the co-op tick is never stalled by a large model.
export function createStaticHandler(root, { production = false } = {}) {
  const bodies = new Map();
  const encoded = (file, etag, gzipped) => {
    const key = `${file}|${gzipped}`;
    let cached = bodies.get(key);
    if (!cached || cached.etag !== etag) {
      const body = readFile(file).then((raw) => gzipped ? gzipAsync(raw, { level: 6 }) : raw);
      cached = { etag, body }; bodies.set(key, cached);
      body.catch(() => { if (bodies.get(key) === cached) bodies.delete(key); });
    }
    return cached.body;
  };
  return async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    try {
      const url = new URL(req.url, 'http://localhost');
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      if (relative === 'healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
      const isAsset = assetPattern.test(relative);
      const base = path.resolve(isAsset ? path.join(root, 'public') : root);
      let file = path.resolve(base, relative);
      if (!file.startsWith(base + path.sep)) throw new Error('Not found');
      if (!isAsset && !/^(index\.html|lab\.html|dist\/|src\/[^/]+\.css$)/.test(relative)) throw new Error('Not found');
      let info = null;
      if (production && relative.startsWith('models/')) {
        const web = path.resolve(root, 'dist', relative);
        if (web.startsWith(path.resolve(root, 'dist', 'models') + path.sep) && (info = await fileInfo(web))) file = web;
      }
      info ??= await fileInfo(file);
      if (!info) throw new Error('Not found');
      const ext = path.extname(file), etag = `"${info.size.toString(36)}-${Math.floor(info.mtimeMs).toString(36)}"`;
      const headers = {
        'Content-Type': mime[ext] || 'application/octet-stream',
        'Cache-Control': production && isAsset ? 'public, max-age=86400' : 'no-cache',
        ETag: etag, Vary: 'Accept-Encoding',
      };
      if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return; }
      const gzipped = production && compressible.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
      const body = production ? await encoded(file, etag, gzipped) : await readFile(file);
      if (gzipped) headers['Content-Encoding'] = 'gzip';
      headers['Content-Length'] = body.length;
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { if (!res.headersSent) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); } }
  };
}
