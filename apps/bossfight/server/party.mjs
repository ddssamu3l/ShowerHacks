import { randomUUID } from 'node:crypto';
import { Fight, seededRandom } from './fight.mjs';

export const PARTY = Object.freeze({
  maxPlayers: 3, reconnectMs: 20000, maxRooms: 500, maxNameLength: 16, maxMessageBytes: 4096,
  statesPerSecond: 40, paintsPerSecond: 30, colors: ['#e2c47e', '#7fc4e2', '#e28a7f'],
});
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const CLIP = /^[a-z_]{1,24}$/, FIGHT_STATE = /^[a-zA-Z]{1,16}$/;

const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const vector = (value, limit) => Array.isArray(value) && value.length === 3 && value.every((v) => finite(v, -limit, limit)) ? value.slice() : null;
export function cleanName(value) {
  const name = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, PARTY.maxNameLength) : '';
  return name || null;
}
// Only relay the fields remote avatars need, in known ranges.
export function cleanState(s) {
  if (!s || typeof s !== 'object') return null;
  const p = vector(s.p, 50);
  if (!p || !finite(s.r, -1e4, 1e4) || typeof s.c !== 'string' || !CLIP.test(s.c) || !finite(s.t, 0, 60) || !finite(s.h, 0, 100)) return null;
  const state = { p, r: s.r, c: s.c, t: s.t, h: s.h, f: typeof s.f === 'string' && FIGHT_STATE.test(s.f) ? s.f : 'ready', w: null };
  if (s.w && typeof s.w === 'object') {
    const o = vector(s.w.o, 50), v = vector(s.w.v, 200);
    if (o && v && (s.w.m === 'shower' || s.w.m === 'jet') && finite(s.w.e, 0, 5)) state.w = { m: s.w.m, o, v, e: s.w.e };
  }
  return state;
}

// Room and lobby state for co-op fights. Transport-agnostic: the WebSocket layer
// calls connect/message/disconnect and supplies a send(object) function per client.
export class PartyServer {
  constructor({ now = () => Date.now(), random = Math.random, setTimer = setTimeout, clearTimer = clearTimeout, surface = null } = {}) {
    Object.assign(this, { now, random, setTimer, clearTimer, surface });
    this.rooms = new Map(); this.tokens = new Map();
  }
  connect(send) { const now = this.now(); return { send, player: null, room: null, budget: PARTY.statesPerSecond, budgetAt: now, paintBudget: PARTY.paintsPerSecond, paintAt: now }; }

  message(client, raw) {
    if (typeof raw !== 'string' || raw.length > PARTY.maxMessageBytes) return this.error(client, 'too_large', 'Message too large.');
    let msg; try { msg = JSON.parse(raw); } catch { return this.error(client, 'bad_json', 'Invalid message.'); }
    if (!msg || typeof msg.type !== 'string') return this.error(client, 'bad_message', 'Invalid message.');
    switch (msg.type) {
      case 'create': return this.create(client, msg);
      case 'join': return this.join(client, msg);
      case 'resume': return this.resume(client, msg);
      case 'start': return this.start(client);
      case 'state': return this.state(client, msg);
      case 'paint': return this.paint(client, msg);
      case 'pickup': return this.pickup(client, msg);
      case 'back': return this.back(client);
      case 'leave': return this.leave(client);
      default: return this.error(client, 'bad_message', 'Unknown message.');
    }
  }

  create(client, msg) {
    if (client.player) return this.error(client, 'already_in_room', 'Leave your current room first.');
    const name = cleanName(msg.name);
    if (!name) return this.error(client, 'bad_name', 'Enter a name.');
    if (this.rooms.size >= PARTY.maxRooms) return this.error(client, 'server_full', 'Too many rooms right now. Try again soon.');
    let code; do code = Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(this.random() * CODE_LETTERS.length)]).join(''); while (this.rooms.has(code));
    const room = { code, hostId: null, phase: 'lobby', fight: 0, sim: null, players: new Map() };
    this.rooms.set(code, room);
    this.addPlayer(client, room, name);
  }
  join(client, msg) {
    if (client.player) return this.error(client, 'already_in_room', 'Leave your current room first.');
    const name = cleanName(msg.name), code = typeof msg.code === 'string' ? msg.code.trim().toUpperCase() : '';
    if (!name) return this.error(client, 'bad_name', 'Enter a name.');
    const room = this.rooms.get(code);
    if (!room) return this.error(client, 'no_room', `No room called ${code || '····'}.`);
    if (room.phase !== 'lobby') return this.error(client, 'in_fight', 'That fight already started.');
    if (room.players.size >= PARTY.maxPlayers) return this.error(client, 'room_full', 'That room is full (3 players).');
    this.addPlayer(client, room, name);
  }
  addPlayer(client, room, name) {
    const used = new Set([...room.players.values()].map((p) => p.color));
    const player = { id: randomUUID(), token: randomUUID(), name, color: PARTY.colors.find((c) => !used.has(c)), client, inFight: false, dropTimer: null };
    room.players.set(player.id, player); this.tokens.set(player.token, { room, player });
    room.hostId ??= player.id;
    client.player = player; client.room = room;
    client.send({ type: 'joined', you: { id: player.id, token: player.token } });
    this.broadcastRoom(room);
  }
  resume(client, msg) {
    const entry = typeof msg.token === 'string' && this.tokens.get(msg.token);
    if (!entry || client.player) return this.error(client, 'no_session', 'Your seat expired. Join again.');
    const { room, player } = entry;
    if (player.client) player.client.player = player.client.room = null;
    if (player.dropTimer) this.clearTimer(player.dropTimer);
    player.dropTimer = null; player.client = client; client.player = player; client.room = room;
    if (player.inFight) room.sim?.rejoin(player.id);
    client.send({ type: 'joined', you: { id: player.id, token: player.token }, resumed: true });
    this.broadcastRoom(room);
  }
  start(client) {
    const { room, player } = client;
    if (!room) return this.error(client, 'no_room', 'Join a room first.');
    if (room.hostId !== player.id) return this.error(client, 'not_host', 'Only the host can start.');
    if (room.phase !== 'lobby') return;
    room.phase = 'fight'; room.fight++;
    const connected = [...room.players.values()].filter((p) => p.client);
    for (const p of connected) p.inFight = true;
    room.sim = this.surface ? new Fight({ players: connected, surface: this.surface, now: this.now(), random: seededRandom(Math.floor(this.random() * 2 ** 32)), send: (msg) => this.broadcast(room, msg) }) : null;
    this.broadcast(room, { type: 'start', fight: room.fight, count: connected.length, groups: room.sim?.clean.groups.length ?? 0, players: connected.map((p) => this.publicPlayer(p, room)) });
    this.broadcastRoom(room);
  }
  state(client, msg) {
    const { room, player } = client;
    if (!room || room.phase !== 'fight' || !player.inFight) return;
    const now = this.now();
    client.budget = Math.min(PARTY.statesPerSecond, client.budget + (now - client.budgetAt) * PARTY.statesPerSecond / 1000); client.budgetAt = now;
    if (client.budget < 1) return;
    client.budget--;
    const state = cleanState(msg.s);
    if (!state) return;
    this.broadcast(room, { type: 'state', id: player.id, s: state }, player.id);
    room.sim?.state(player.id, state);
  }
  paint(client, msg) {
    const { room, player } = client;
    if (!room?.sim || !player.inFight) return;
    const now = this.now();
    client.paintBudget = Math.min(PARTY.paintsPerSecond, client.paintBudget + (now - client.paintAt) * PARTY.paintsPerSecond / 1000); client.paintAt = now;
    if (client.paintBudget < 1) return;
    client.paintBudget--;
    room.sim.paint(player.id, msg, now);
  }
  pickup(client, msg) {
    const { room, player } = client;
    if (room?.sim && player.inFight && Number.isInteger(msg.id)) room.sim.pickup(player.id, msg.id, this.now());
  }
  tick(now = this.now()) { for (const room of this.rooms.values()) room.sim?.tick(now); }
  back(client) {
    const { room, player } = client;
    if (!room || !player.inFight) return;
    player.inFight = false; room.sim?.remove(player.id);
    this.broadcast(room, { type: 'gone', id: player.id }, player.id);
    this.settle(room);
  }
  leave(client) {
    const { room, player } = client;
    if (!room) return;
    client.player = client.room = null;
    this.removePlayer(room, player);
  }
  disconnect(client) {
    const { room, player } = client;
    if (!room || player.client !== client) return;
    player.client = null; client.player = client.room = null; room.sim?.remove(player.id);
    if (room.hostId === player.id) { const next = [...room.players.values()].find((p) => p.client); if (next) room.hostId = next.id; }
    player.dropTimer = this.setTimer(() => this.removePlayer(room, player), PARTY.reconnectMs);
    this.settle(room); this.broadcastRoom(room);
  }
  removePlayer(room, player) {
    if (!room.players.has(player.id)) return;
    if (player.dropTimer) this.clearTimer(player.dropTimer);
    room.players.delete(player.id); this.tokens.delete(player.token); room.sim?.remove(player.id);
    if (!room.players.size) { this.rooms.delete(room.code); return; }
    if (room.hostId === player.id) room.hostId = ([...room.players.values()].find((p) => p.client) ?? room.players.values().next().value).id;
    this.broadcast(room, { type: 'gone', id: player.id });
    this.settle(room); this.broadcastRoom(room);
  }
  // A fight ends for the room once nobody connected is still in it.
  settle(room) {
    if (room.phase === 'fight' && ![...room.players.values()].some((p) => p.inFight && p.client)) {
      room.phase = 'lobby'; room.sim = null; for (const p of room.players.values()) p.inFight = false;
      this.broadcastRoom(room);
    }
  }

  publicPlayer(p, room) { return { id: p.id, name: p.name, color: p.color, host: room.hostId === p.id, connected: !!p.client, inFight: p.inFight }; }
  broadcastRoom(room) { this.broadcast(room, { type: 'room', room: { code: room.code, phase: room.phase, max: PARTY.maxPlayers, players: [...room.players.values()].map((p) => this.publicPlayer(p, room)) } }); }
  broadcast(room, msg, exceptId) { for (const p of room.players.values()) if (p.client && p.id !== exceptId) p.client.send(msg); }
  error(client, code, message) { client.send({ type: 'error', code, message }); }
}
