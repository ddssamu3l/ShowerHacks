import { WebSocketServer } from 'ws';
import { PartyServer, PARTY } from './party.mjs';

// Mounts co-op rooms on /ws of an existing HTTP server.
export function attachParty(server, { allowedOrigin } = {}) {
  const party = new PartyServer(), wss = new WebSocketServer({ noServer: true, maxPayload: PARTY.maxMessageBytes });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/ws' || (allowedOrigin && req.headers.origin && !allowedOrigin(req.headers.origin, req.headers.host))) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  });
  wss.on('connection', (ws) => {
    ws.alive = true;
    const client = party.connect((msg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); });
    ws.on('pong', () => { ws.alive = true; });
    ws.on('message', (data, binary) => { if (!binary) party.message(client, data.toString()); });
    ws.on('close', () => party.disconnect(client));
    ws.on('error', () => ws.terminate());
  });
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); }
  }, 15000);
  server.on('close', () => clearInterval(heartbeat));
  return party;
}

export const sameHost = (origin, host) => { try { return new URL(origin).host === host; } catch { return false; } };
