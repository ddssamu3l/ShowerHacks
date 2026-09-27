import test from 'node:test';
import assert from 'node:assert/strict';
import { PartyServer, PARTY, cleanState, cleanName } from '../server/party.mjs';

function harness() {
  let clock = 0; const timers = new Map(); let nextTimer = 1;
  const party = new PartyServer({
    now: () => clock, random: () => .5,
    setTimer: (fn, ms) => { const id = nextTimer++; timers.set(id, { fn, at: clock + ms }); return id; },
    clearTimer: (id) => timers.delete(id),
  });
  const client = () => { const inbox = []; const c = party.connect((m) => inbox.push(m)); c.inbox = inbox; c.last = (type) => inbox.filter((m) => m.type === type).at(-1); c.say = (m) => party.message(c, JSON.stringify(m)); return c; };
  const advance = (ms) => { clock += ms; for (const [id, t] of [...timers]) if (t.at <= clock) { timers.delete(id); t.fn(); } };
  return { party, client, advance };
}
const state = (x = 1) => ({ p: [x, 0, 2], r: 1, c: 'jog_forward', t: .2, h: 100, f: 'ready', w: { m: 'jet', o: [0, 1, 0], v: [0, 0, 40], e: .4 } });

test('host creates a room, friends join by code, the fourth is refused', () => {
  const { client } = harness();
  const a = client(); a.say({ type: 'create', name: 'Ana' });
  const code = a.last('room').room.code;
  assert.match(code, /^[A-Z]{4}$/);
  const b = client(), c = client(), d = client();
  b.say({ type: 'join', code: code.toLowerCase(), name: 'Ben' }); c.say({ type: 'join', code, name: 'Cy' }); d.say({ type: 'join', code, name: 'Dee' });
  const room = a.last('room').room;
  assert.equal(room.players.length, PARTY.maxPlayers);
  assert.deepEqual(room.players.map((p) => p.name), ['Ana', 'Ben', 'Cy']);
  assert.equal(new Set(room.players.map((p) => p.color)).size, 3);
  assert.equal(room.players[0].host, true);
  assert.equal(d.last('error').code, 'room_full');
  client().say({ type: 'join', code: 'ZZZZ', name: 'X' });
});

test('names are required and sanitized; bad codes and messages return errors', () => {
  const { client } = harness();
  assert.equal(cleanName('  <b>Ana</b>\n  '), 'bAna/b');
  assert.equal(cleanName('x'.repeat(40)).length, PARTY.maxNameLength);
  const a = client(); a.say({ type: 'create', name: '   ' });
  assert.equal(a.last('error').code, 'bad_name');
  a.say({ type: 'join', code: 'NOPE', name: 'Ana' });
  assert.equal(a.last('error').code, 'no_room');
  const party = a; party.say({ type: 'teleport' });
  assert.equal(a.last('error').code, 'bad_message');
});

test('only the host starts; nobody can join a fight in progress', () => {
  const { client } = harness();
  const a = client(), b = client(); a.say({ type: 'create', name: 'Ana' });
  const code = a.last('room').room.code; b.say({ type: 'join', code, name: 'Ben' });
  b.say({ type: 'start' });
  assert.equal(b.last('error').code, 'not_host');
  a.say({ type: 'start' });
  assert.equal(a.last('start').count, 2); assert.equal(b.last('start').count, 2);
  assert.equal(a.last('room').room.phase, 'fight');
  const c = client(); c.say({ type: 'join', code, name: 'Cy' });
  assert.equal(c.last('error').code, 'in_fight');
});

test('player state is sanitized and relayed only to the others, with a rate limit', () => {
  const { client, advance } = harness();
  const a = client(), b = client(); a.say({ type: 'create', name: 'Ana' });
  b.say({ type: 'join', code: a.last('room').room.code, name: 'Ben' });
  a.say({ type: 'state', s: state() });
  assert.equal(b.inbox.filter((m) => m.type === 'state').length, 0, 'no relay before the fight');
  a.say({ type: 'start' });
  a.say({ type: 'state', s: { ...state(3), extra: 'x'.repeat(100) } });
  const relayed = b.last('state');
  assert.equal(relayed.id, a.last('joined').you.id);
  assert.deepEqual(relayed.s, state(3));
  assert.equal(a.last('state'), undefined, 'sender does not get an echo');
  a.say({ type: 'state', s: { ...state(), p: [1, NaN, 2] } });
  a.say({ type: 'state', s: { ...state(), c: '<script>' } });
  assert.equal(b.inbox.filter((m) => m.type === 'state').length, 1, 'invalid states are dropped');
  for (let i = 0; i < 200; i++) a.say({ type: 'state', s: state() });
  const burst = b.inbox.filter((m) => m.type === 'state').length;
  assert.ok(burst <= PARTY.statesPerSecond + 1, `burst relayed ${burst}`);
  advance(1000); a.say({ type: 'state', s: state() });
  assert.equal(b.inbox.filter((m) => m.type === 'state').length, burst + 1, 'budget refills over time');
});

test('cleanState keeps water only when well formed', () => {
  assert.equal(cleanState({ ...state(), w: { m: 'laser', o: [0, 0, 0], v: [0, 0, 1], e: .3 } }).w, null);
  assert.equal(cleanState({ ...state(), w: null }).w, null);
  assert.equal(cleanState({ ...state(), h: 150 }), null);
  assert.equal(cleanState(null), null);
});

test('a dropped player can resume within 20 seconds, then is removed; host moves on', () => {
  const { client, advance, party } = harness();
  const a = client(), b = client(); a.say({ type: 'create', name: 'Ana' });
  const code = a.last('room').room.code; b.say({ type: 'join', code, name: 'Ben' });
  const token = a.last('joined').you.token;
  party.disconnect(a);
  let room = b.last('room').room;
  assert.equal(room.players.find((p) => p.name === 'Ana').connected, false);
  assert.equal(room.players.find((p) => p.name === 'Ben').host, true, 'host passes to a connected player');
  advance(PARTY.reconnectMs - 1);
  const a2 = client(); a2.say({ type: 'resume', token });
  assert.equal(a2.last('joined').resumed, true);
  assert.equal(b.last('room').room.players.find((p) => p.name === 'Ana').connected, true);
  advance(5000);
  assert.equal(b.last('room').room.players.length, 2, 'resumed player is not removed later');
  party.disconnect(a2); advance(PARTY.reconnectMs);
  room = b.last('room').room;
  assert.deepEqual(room.players.map((p) => p.name), ['Ben']);
  const late = client(); late.say({ type: 'resume', token });
  assert.equal(late.last('error').code, 'no_session');
});

test('the room returns to the lobby when everyone is back, and empty rooms are deleted', () => {
  const { client, party, advance } = harness();
  const a = client(), b = client(); a.say({ type: 'create', name: 'Ana' });
  const code = a.last('room').room.code; b.say({ type: 'join', code, name: 'Ben' });
  a.say({ type: 'start' });
  a.say({ type: 'back' });
  assert.equal(b.last('gone').id, a.last('joined').you.id);
  assert.equal(b.last('room').room.phase, 'fight');
  party.disconnect(b);
  assert.equal(a.last('room').room.phase, 'lobby', 'a dropped player does not hold the fight open');
  a.say({ type: 'leave' });
  assert.equal(party.rooms.has(code), true, 'Ben still holds a seat while reconnecting');
  advance(PARTY.reconnectMs);
  assert.equal(party.rooms.has(code), false);
  assert.equal(party.tokens.size, 0);
});

test('oversized and malformed messages are rejected', () => {
  const { client, party } = harness();
  const a = client();
  party.message(a, 'x'.repeat(PARTY.maxMessageBytes + 1));
  assert.equal(a.last('error').code, 'too_large');
  party.message(a, '{nope');
  assert.equal(a.last('error').code, 'bad_json');
});
