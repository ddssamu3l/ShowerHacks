export const BOSS_LINES = Object.freeze({
  yc: 'YOU WILL NOT GET INTO YC!', shower: 'STOP SHOWERING ME!', claude: 'CLAUDE DROP!',
  agents: 'AGENT SWARM!', deadline: 'DEADLINE!',
  runway: 'MY RUNWAY IS INFINITE!', pitch: 'YOU CALL THAT A PITCH?', intro: 'THIS SHOWER HAS NO PRODUCT–MARKET FIT.',
});
export const BOSS_MUSIC = 'godfrey';

export class BossAudio {
  constructor(context, output, onLine) {
    this.context = context; this.output = output; this.onLine = onLine;
    this.buffers = new Map(); this.playing = false; this.voice = null; this.nextTaunt = 8; this.lastLine = null; this.serial = 0;
    this.musicGain = context.createGain(); this.musicGain.gain.value = 0; this.musicGain.connect(output);
    this.voiceGain = context.createGain(); this.voiceGain.gain.value = .88; this.voiceGain.connect(output);
    this.ready = this.load();
  }
  async load() {
    await Promise.all([BOSS_MUSIC, ...Object.keys(BOSS_LINES)].map(async id => {
      try {
        const response = await fetch(`/audio/${id}.ogg`); if (!response.ok) throw new Error(`${id}: ${response.status}`);
        this.buffers.set(id, await this.context.decodeAudioData(await response.arrayBuffer()));
      } catch (error) { console.warn('Unable to load encounter audio', error); }
    }));
    const theme = this.buffers.get(BOSS_MUSIC);
    if (theme) { this.music = this.context.createBufferSource(); this.music.buffer = theme; this.music.loop = true; this.music.connect(this.musicGain); this.music.start(); }
    this.setPlaying(this.playing);
  }
  setPlaying(playing) {
    this.playing = playing;
    this.musicGain.gain.setTargetAtTime(playing ? this.voice ? .12 : .38 : 0, this.context.currentTime, .2);
    if (!playing) this.stopVoice();
  }
  reset() { this.stopVoice(); this.nextTaunt = 8; this.lastLine = null; }
  stopVoice() {
    this.serial++;
    if (this.voice) { try { this.voice.stop(); } catch {} this.voice.disconnect(); this.voice = null; }
    this.onLine('');
  }
  say(id, now, interrupt = false) {
    if (!this.playing || !this.buffers.has(id) || (this.voice && !interrupt)) return false;
    this.stopVoice(); const token = this.serial;
    const voice = this.context.createBufferSource(); voice.buffer = this.buffers.get(id); voice.connect(this.voiceGain); this.voice = voice;
    this.lastLine = id; this.nextTaunt = now + 11 + Math.random() * 4;
    this.onLine(BOSS_LINES[id]); this.musicGain.gain.setTargetAtTime(.11, this.context.currentTime, .07);
    voice.onended = () => {
      if (token !== this.serial) return;
      this.voice = null; voice.disconnect(); this.onLine(''); this.musicGain.gain.setTargetAtTime(this.playing ? .38 : 0, this.context.currentTime, .35);
    };
    voice.start(); return true;
  }
  tick(now, washing, passive) {
    if (!this.playing || passive || this.voice || now < this.nextTaunt) return;
    let choices = washing ? ['shower', 'pitch'] : ['runway', 'pitch', 'intro']; choices = choices.filter(id => id !== this.lastLine);
    this.say(choices[Math.floor(Math.random() * choices.length)], now);
  }
}
