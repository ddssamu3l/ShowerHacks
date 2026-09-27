import test from 'node:test';
import assert from 'node:assert/strict';
import { SPELLS, spellHitbox } from '../src/boss-spells.js';
import { CombatState, capsulesTouch } from '../src/combat.js';
import { readFile, stat } from 'node:fs/promises';
import { BOSS_LINES, BOSS_MUSIC } from '../src/boss-audio.js';

test('spell windups and recovery cannot hurt the player', () => {
 for (const [id, spell] of Object.entries(SPELLS).filter(([id])=>['yc_beam','claude_drop'].includes(id))) {
  assert.ok(spell.strikeStart > 1); assert.ok(spell.duration > spell.strikeEnd + .8);
  assert.equal(spellHitbox(id, spell.strikeStart - .001, [0,2,0], [0,0,15], [0,0,5]), null);
  assert.ok(spellHitbox(id, spell.strikeStart, [0,2,0], [0,0,15], [0,0,5]));
  assert.equal(spellHitbox(id, spell.strikeEnd + .001, [0,2,0], [0,0,15], [0,0,5]), null);
 }
});
test('a committed beam can be sidestepped and still obeys roll/get-up protection', () => {
 const beam = spellHitbox('yc_beam', 2.9, [0,2,0], [0,.1,15], [0,.9,8]);
 assert.equal(capsulesTouch(beam,{start:[0,.3,8],end:[0,1.53,8],radius:.3}),true);
 assert.equal(capsulesTouch(beam,{start:[2,.3,8],end:[2,1.53,8],radius:.3}),false);
 const fight = new CombatState(); fight.roll([1,0]); assert.equal(fight.hit('beam',34),false);
 fight.tick(.5); assert.equal(fight.hit('beam',34),true); assert.equal(fight.hit('beam',34),false);
 assert.equal(fight.health,66); assert.equal(fight.invulnerable,true);
});
test('Claude impact has finite ground coverage rather than arena-wide damage', () => {
 const impact = spellHitbox('claude_drop',1.75,[0,3,0],[0,0,15],[3,.9,4]);
 assert.equal(capsulesTouch(impact,{start:[3,.3,4],end:[3,1.53,4],radius:.3}),true);
 assert.equal(capsulesTouch(impact,{start:[6,.3,4],end:[6,1.53,4],radius:.3}),false);
});
test('local music and every announced voice line are shipped as playable Ogg assets', async () => {
 const root = new URL('../public/audio/',import.meta.url), manifest = JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
 assert.ok(manifest.music.seconds > 190); assert.match(manifest.voice.source,/male/); assert.equal(manifest.music.loop,true); assert.equal(manifest.music.file,BOSS_MUSIC+'.ogg');
 for (const id of [BOSS_MUSIC,...Object.keys(BOSS_LINES)]) {
  const file = new URL(`${id}.ogg`,root); assert.ok((await stat(file)).size > 1000);
  assert.equal((await readFile(file)).subarray(0,4).toString(),'OggS');
 }
 for(const spell of Object.values(SPELLS)) assert.ok(BOSS_LINES[spell.voice]);
});
