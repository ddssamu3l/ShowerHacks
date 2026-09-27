import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BossAudio, BOSS_MUSIC } from '../src/boss-audio.js';

test('selected soundtrack loops, ducks for speech, and obeys encounter pause/resume',async t=>{
  const sources=[],captions=[];
  const context={currentTime:0,
    createGain:()=>({gain:{value:0,setTargetAtTime(value){this.value=value;}},connect(){},disconnect(){}}),
    decodeAudioData:async bytes=>({bytes}),
    createBufferSource:()=>{const source={loop:false,connect(){},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;}};sources.push(source);return source;},
  };
  t.mock.method(globalThis,'fetch',async url=>new Response(await readFile(new URL(`../public${url}`,import.meta.url))));
  const audio=new BossAudio(context,{},line=>captions.push(line));await audio.ready;
  assert.equal(audio.music.buffer,audio.buffers.get(BOSS_MUSIC));assert.equal(audio.music.loop,true);assert.equal(audio.music.started,true);
  assert.equal(audio.musicGain.gain.value,0);
  audio.setPlaying(true);assert.equal(audio.musicGain.gain.value,.38);
  assert.equal(audio.say('agents',0,true),true);assert.equal(captions.at(-1),'AGENT SWARM!');assert.equal(audio.musicGain.gain.value,.11);
  const voice=audio.voice;audio.setPlaying(false);assert.equal(voice.stopped,true);assert.equal(audio.musicGain.gain.value,0);assert.equal(captions.at(-1),'');
  audio.setPlaying(true);assert.equal(audio.musicGain.gain.value,.38);
  // A stopped voice finishing late must not unmute a paused encounter.
  audio.setPlaying(false);voice.onended();assert.equal(audio.musicGain.gain.value,0);
});
