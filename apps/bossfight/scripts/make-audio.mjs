// Local character dialogue. --original-score also regenerates the optional original score.
// The active user-selected music file, godfrey.ogg, is kept intact.
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../public/audio/', import.meta.url)); await mkdir(root, { recursive: true });
if (process.argv.includes('--original-score')) {
const sr = 22050, beat = 60 / 112, bars = 32, seconds = bars * 4 * beat, count = Math.floor(seconds * sr);
const left = new Float32Array(count), right = new Float32Array(count);
const frequency = note => 440 * 2 ** ((note - 69) / 12);
let seed = 481; const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
function note(start, duration, midi, volume, type, pan = 0) {
  const f = frequency(midi), from = Math.floor(start * sr), length = Math.floor(duration * sr);
  for (let k = 0; k < length; k++) {
    const t = k / sr, x = k / length, idx = (from + k) % count;
    let sample = 0, envelope;
    if (type === 'strings') {
      envelope = Math.min(1, t / .018) * Math.exp(-x * 2.5) * Math.min(1, (duration - t) / .055);
      for (let h = 1; h <= 6; h++) sample += (Math.sin(2 * Math.PI * f * h * t) + .35 * Math.sin(2 * Math.PI * f * 1.004 * h * t)) / (h * 2.5);
    } else if (type === 'choir') {
      envelope = Math.min(1, t / .35) * Math.min(1, (duration - t) / .6);
      for (let h = 1; h <= 10; h++) { const formant = .18 + Math.exp(-(((f * h - 750) / 400) ** 2)) + .35 * Math.exp(-(((f * h - 1700) / 500) ** 2)); sample += Math.sin(2 * Math.PI * f * h * t + .035 * Math.sin(t * 31)) * formant / (h * 2); }
      sample *= .92 + .08 * Math.sin(t * 8);
    } else if (type === 'horn') {
      envelope = Math.min(1, t / .11) * Math.min(1, (duration - t) / .2);
      for (let h = 1; h <= 5; h++) sample += Math.sin(2 * Math.PI * f * h * t) / h / 2;
    } else {
      envelope = Math.exp(-t * 6) * Math.min(1, t * 170);
      sample = Math.sin(2 * Math.PI * (midi + 90 * Math.exp(-t * 25)) * t) * .85 + (random() - .5) * Math.exp(-t * 30) * .5;
    }
    sample *= envelope * volume; left[idx] += sample * (1 - pan * .45); right[idx] += sample * (1 + pan * .45);
  }
}
const chords = [[38, 45, 50, 53], [38, 45, 50, 53], [34, 41, 46, 50], [36, 43, 48, 52], [31, 38, 43, 46], [34, 41, 46, 50], [33, 40, 45, 49], [33, 40, 45, 49]];
for (let bar = 0; bar < bars; bar++) {
  const chord = chords[bar % chords.length], at = bar * 4 * beat, rising = bar >= 16 ? 1.2 : 1;
  for (let i = 0; i < chord.length; i++) note(at, 4.5 * beat, chord[i] + 12, .045 * rising, 'choir', (i - 1.5) / 2);
  note(at, 4 * beat, chord[0], .12, 'horn', -.12);
  for (let step = 0; step < 8; step++) note(at + step * beat / 2, beat * .43, chord[[0, 2, 3, 2, 1, 2, 3, 1][step]] + 12, .063 * rising, 'strings', step % 2 ? -.5 : .5);
  if (bar >= 8) for (let step = 0; step < 4; step++) note(at + step * beat, beat * .8, chord[(step + bar) % 4] + (bar >= 24 ? 24 : 12), .032, 'horn', .3);
  note(at, .8, 55, .20, 'drum'); note(at + 2 * beat, .75, 48, .15, 'drum');
  if (bar % 2) { note(at + 3 * beat, .5, 72, .11, 'drum', -.25); note(at + 3.5 * beat, .5, 66, .09, 'drum', .25); }
}
// Circular early reflections make the end/start join seamless.
for (const [delay, gain] of [[.093, .17], [.171, .13], [.293, .10], [.431, .075], [.677, .05]]) {
  const offset = Math.floor(delay * sr), l = left.slice(), r = right.slice();
  for (let i = 0; i < count; i++) { const j = (i + offset) % count; left[j] += r[i] * gain; right[j] += l[i] * gain; }
}
let peak = 0; for (let i = 0; i < count; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
const data = Buffer.alloc(44 + count * 4); data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22); data.writeUInt32LE(sr, 24); data.writeUInt32LE(sr * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(count * 4, 40);
for (let i = 0; i < count; i++) { data.writeInt16LE(Math.round(left[i] / peak * 24000), 44 + i * 4); data.writeInt16LE(Math.round(right[i] / peak * 24000), 46 + i * 4); }
const wav = root + 'boss-theme.wav'; await writeFile(wav, data);
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-c:a', 'libvorbis', '-q:a', '5', root + 'boss-theme.ogg']); await unlink(wav);
}
const lines = {
  yc: 'You will NOT get into Y C!',
  shower: 'STOP! Showering me!',
  claude: 'CLAUDE! DROP!',
  agents: 'AGENT! SWARM!',
  deadline: 'DEADLINE!',
  runway: 'My runway is infinite!',
  pitch: 'You call that a pitch?',
  intro: 'This shower has no product market fit.',
};
for (const [id, line] of Object.entries(lines)) {
  const source = root + id + '.aiff';
  execFileSync('/usr/bin/say', ['-v', 'Reed (English (US))', '-r', '205', '-o', source, line]);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', source, '-af', 'aresample=44100,highpass=f=160,equalizer=f=2400:t=q:w=1:g=4,lowpass=f=8500,volume=2.0,acompressor=threshold=0.14:ratio=4:attack=2:release=65,asoftclip=type=tanh:threshold=0.85:output=0.95,aecho=0.8:0.7:38:0.08,alimiter=limit=0.9', '-c:a', 'libvorbis', '-q:a', '5', root + id + '.ogg']);
  await unlink(source);
}
const manifest = JSON.parse(await readFile(root + 'manifest.json', 'utf8'));
manifest.music = { title: 'Godfrey, First Elden Lord', file: 'godfrey.ogg', source: 'https://www.youtube.com/watch?v=lHqZZkDvW-o', seconds: Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', root + 'godfrey.ogg'], { encoding: 'utf8' }).trim()), loop: true, note: 'User-selected soundtrack recording. Separate from the optional original procedural score.' };
manifest.voice = { source: 'macOS Reed (English (US)) male speech synthesis; natural pitch, brisk angry delivery, midrange bite and light compression; no ogre pitch drop', lines };
await writeFile(root + 'manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(`Created ${Object.keys(lines).length} voiced lines; active soundtrack preserved.`);
