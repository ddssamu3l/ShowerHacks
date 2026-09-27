import { createServer } from 'node:http';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { root } from './build.mjs';
import { createStaticHandler } from './static.mjs';
import { attachParty, sameHost } from '../server/attach.mjs';

try { await access(path.join(root, 'dist', 'game.js')); }
catch { console.error('Missing dist/game.js. Run `npm run build` first.'); process.exit(1); }

const port = Number(process.env.PORT) || 4173, host = process.env.HOST || '0.0.0.0';
const server = createServer(createStaticHandler(root, { production: true }));
await attachParty(server, { allowedOrigin: sameHost });
server.listen(port, host, () => console.log(`Shower Souls listening on http://${host}:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
