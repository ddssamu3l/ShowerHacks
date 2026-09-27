import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PlayerVoice, LinePicker, PLAYER_LINES, PLAYER_VOICE } from '../src/player-voice.js';
import { BossAudio } from '../src/boss-audio.js';

const ids = Object.keys(PLAYER_LINES);
const seeded = (seed = 7) => () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
function fakeContext() {
  const sources = [];
  return { sources, currentTime: 0,
    createGain: () => ({ gain: { value: 0, setTargetAtTime(value) { this.value = value; } }, connect() {}, disconnect() {} }),
    decodeAudioData: async bytes => ({ bytes }),
    createBufferSource: () => { const s = { connect() {}, disconnect() {}, start() { this.started = true; }, stop() { this.stopped = true; } }; sources.push(s); return s; },
  };
}
const serveAudio = t => t.mock.method(globalThis, 'fetch', async url => new Response(await readFile(new URL(`../public${url}`, import.meta.url))));

test('every line plays once per round and never twice in a row', () => {
  for (let seed = 1; seed < 200; seed++) {
    const picker = new LinePicker(ids, seeded(seed)), drawn = Array.from({ length: 30 }, () => picker.next());
    for (let i = 0; i < drawn.length; i += 3) assert.deepEqual([...drawn.slice(i, i + 3)].sort(), [...ids].sort());
    for (let i = 1; i < drawn.length; i++) assert.notEqual(drawn[i], drawn[i - 1]);
  }
});

test('voice waits for the opening, rolls a chance, then holds a long cooldown', async t => {
  serveAudio(t);
  let rolls = [];
  const context = fakeContext(), speaking = [];
  const voice = new PlayerVoice(context, {}, { random: () => rolls.length ? rolls.shift() : .1, onSpeaking: s => speaking.push(s) });
  await voice.ready; assert.equal(voice.buffers.size, ids.length);
  voice.reset(0);
  assert.equal(voice.attack(PLAYER_VOICE.firstDelay - .1), null, 'quiet at the start of the fight');
  const first = voice.attack(PLAYER_VOICE.firstDelay);
  assert.ok(ids.includes(first)); assert.deepEqual(speaking, [true]); assert.equal(context.sources.at(-1).started, true);
  const cooldown = voice.nextAt - PLAYER_VOICE.firstDelay;
  assert.ok(cooldown >= PLAYER_VOICE.cooldown[0] && cooldown <= PLAYER_VOICE.cooldown[1]);
  context.sources.at(-1).onended(); assert.deepEqual(speaking, [true, false]);
  assert.equal(voice.attack(voice.nextAt - .1), null, 'no line during the cooldown');
  const missAt = voice.nextAt;
  rolls = [.9];
  assert.equal(voice.attack(missAt), null, 'a failed chance roll stays quiet');
  assert.equal(voice.nextAt, missAt + PLAYER_VOICE.retry);
  assert.ok(ids.includes(voice.attack(voice.nextAt)));
});

test('player never talks over the boss, and pause cuts him off', async t => {
  serveAudio(t);
  let bossTalking = true;
  const voice = new PlayerVoice(fakeContext(), {}, { random: () => .1, busy: () => bossTalking });
  await voice.ready; voice.reset(0);
  assert.equal(voice.attack(100), null);
  bossTalking = false; assert.ok(voice.attack(100));
  const source = voice.voice; voice.stop(); assert.equal(source.stopped, true); assert.equal(voice.voice, null);
  source.onended(); assert.equal(voice.voice, null, 'a late end event is ignored');
});

test('boss music ducks and taunts wait while the player speaks', async t => {
  serveAudio(t);
  const boss = new BossAudio(fakeContext(), {}, () => {}); await boss.ready;
  boss.setPlaying(true); assert.equal(boss.musicGain.gain.value, .38);
  boss.setPlayerSpeaking(true); assert.equal(boss.musicGain.gain.value, .18);
  boss.nextTaunt = 0; boss.tick(50, false, false); assert.equal(boss.voice, null);
  boss.setPlayerSpeaking(false); assert.equal(boss.musicGain.gain.value, .38);
  boss.tick(50, false, false); assert.ok(boss.voice);
});
