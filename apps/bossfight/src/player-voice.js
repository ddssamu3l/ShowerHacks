export const PLAYER_LINES = Object.freeze({
  'player-trash': 'Man, this code is some trash.',
  'player-apologise': 'Apologise to the codebase.',
  'player-china': 'Man, no one in China has that shit.',
});
// Seconds of fight time. Lines are flavour: rare enough that three clips never feel spammy.
export const PLAYER_VOICE = Object.freeze({ firstDelay: 6, cooldown: [25, 40], chance: .6, retry: 5 });

// Deals every line once per round in random order, and never repeats a line back to back.
export class LinePicker {
  constructor(ids, random = Math.random) { this.ids = [...ids]; this.random = random; this.deck = []; this.last = null; }
  next() {
    if (!this.deck.length) {
      this.deck = [...this.ids];
      for (let i = this.deck.length - 1; i > 0; i--) { const j = Math.floor(this.random() * (i + 1)); [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]]; }
      const end = this.deck.length - 1;
      if (end > 0 && this.deck[end] === this.last) [this.deck[0], this.deck[end]] = [this.deck[end], this.deck[0]];
    }
    return this.last = this.deck.pop();
  }
}

export class PlayerVoice {
  constructor(context, output, { random = Math.random, busy = () => false, onSpeaking = () => {} } = {}) {
    this.context = context; this.random = random; this.busy = busy; this.onSpeaking = onSpeaking;
    this.gain = context.createGain(); this.gain.gain.value = .95; this.gain.connect(output);
    this.buffers = new Map(); this.picker = new LinePicker(Object.keys(PLAYER_LINES), random);
    this.voice = null; this.nextAt = PLAYER_VOICE.firstDelay;
    this.ready = this.load();
  }
  async load() {
    await Promise.all(Object.keys(PLAYER_LINES).map(async id => {
      try {
        const response = await fetch(`/audio/${id}.ogg`); if (!response.ok) throw new Error(`${id}: ${response.status}`);
        this.buffers.set(id, await this.context.decodeAudioData(await response.arrayBuffer()));
      } catch (error) { console.warn('Unable to load player voice', error); }
    }));
  }
  reset(now = 0) { this.stop(); this.nextAt = now + PLAYER_VOICE.firstDelay; }
  // Called when the player opens the hose. Returns the line id when he speaks.
  attack(now) {
    if (now < this.nextAt || this.voice || this.busy() || this.buffers.size < Object.keys(PLAYER_LINES).length) return null;
    if (this.random() >= PLAYER_VOICE.chance) { this.nextAt = now + PLAYER_VOICE.retry; return null; }
    const [min, max] = PLAYER_VOICE.cooldown, id = this.picker.next();
    this.nextAt = now + min + this.random() * (max - min);
    const voice = this.context.createBufferSource(); voice.buffer = this.buffers.get(id); voice.connect(this.gain); this.voice = voice;
    voice.onended = () => { if (this.voice !== voice) return; this.voice = null; voice.disconnect(); this.onSpeaking(false, id, true); };
    this.onSpeaking(true, id); voice.start();
    return id;
  }
  // Reports onSpeaking(false, null, false): cut off by a pause or boss callout, not a natural end.
  stop() {
    const voice = this.voice; if (!voice) return;
    this.voice = null; try { voice.stop(); } catch {} voice.disconnect(); this.onSpeaking(false, null, false);
  }
}
