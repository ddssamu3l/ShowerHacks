import { context } from 'esbuild';
import { createServer } from 'node:http';
import { root, options } from './build.mjs';
import { createStaticHandler } from './static.mjs';
const build = await context(options);
await build.watch();
const server = createServer(createStaticHandler(root));
server.listen(4173, '127.0.0.1', () => console.log('Shower Souls: http://127.0.0.1:4173'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { server.close(); await build.dispose(); process.exit(); });
