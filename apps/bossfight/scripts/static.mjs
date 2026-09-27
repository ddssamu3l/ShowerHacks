import { readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.glb': 'model/gltf-binary', '.json': 'application/json', '.map': 'application/json', '.png': 'image/png', '.bin': 'application/octet-stream', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.txt': 'text/plain; charset=utf-8' };
const compressible = new Set(['.html', '.js', '.css', '.json', '.map', '.glb', '.bin', '.txt']);
const assetPattern = /^(models|audio)\//;

// Serves the game from `root`, with /models and /audio mapped to public/.
// In production, compressed bodies are cached per file version.
export function createStaticHandler(root, { production = false } = {}) {
  const gzipCache = new Map();
  return async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    try {
      const url = new URL(req.url, 'http://localhost');
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      if (relative === 'healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
      const isAsset = assetPattern.test(relative);
      const base = path.resolve(isAsset ? path.join(root, 'public') : root);
      const file = path.resolve(base, relative);
      if (!file.startsWith(base + path.sep)) throw new Error('Not found');
      if (!isAsset && !/^(index\.html|lab\.html|dist\/|src\/[^/]+\.css$)/.test(relative)) throw new Error('Not found');
      const info = await stat(file);
      if (!info.isFile()) throw new Error('Not found');
      const ext = path.extname(file), etag = `"${info.size.toString(36)}-${Math.floor(info.mtimeMs).toString(36)}"`;
      const headers = {
        'Content-Type': mime[ext] || 'application/octet-stream',
        'Cache-Control': production && isAsset ? 'public, max-age=86400' : 'no-cache',
        ETag: etag, Vary: 'Accept-Encoding',
      };
      if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); res.end(); return; }
      let body = await readFile(file);
      if (production && compressible.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
        let cached = gzipCache.get(file);
        if (!cached || cached.etag !== etag) { cached = { etag, body: gzipSync(body, { level: 6 }) }; gzipCache.set(file, cached); }
        body = cached.body; headers['Content-Encoding'] = 'gzip';
      }
      headers['Content-Length'] = body.length;
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); }
  };
}
