# Rebuilds public/audio/player-*.ogg from the source phone video.
# Needs ffmpeg, the DeepFilterNet CLI (github.com/Rikorose/DeepFilterNet releases, `deep-filter`),
# and `pip install numpy soundfile`.
#   python3 scripts/make-player-voice.py <video.MOV> <path/to/deep-filter>
import subprocess, sys, tempfile
from pathlib import Path
import numpy as np, soundfile as sf

SR = 44100
OUT = Path(__file__).resolve().parent.parent / 'public' / 'audio'
LINES = {  # seconds in the source clip, cut in the pauses between lines
    'trash': (0.00, 1.22),      # "Man, this code is some trash"
    'apologise': (1.18, 2.36),  # "Apologise to the codebase"
    'china': (2.62, 3.75),      # "Man, no one in China has that shit"
}
CHAIN = ','.join([
    'highpass=f=85', 'lowpass=f=11000',
    'equalizer=f=250:t=q:w=1.2:g=-2', 'equalizer=f=3000:t=q:w=1:g=3',
    'acompressor=threshold=0.2:ratio=2.5:attack=5:release=90:makeup=1.5',
    'afade=t=in:d=0.008', 'areverse', 'afade=t=in:d=0.03', 'areverse',
    'loudnorm=I=-15:TP=-1.5:LRA=11', 'aresample=44100',
])

video, deep_filter = sys.argv[1], sys.argv[2]
with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', video, '-vn', '-ac', '1', '-ar', '48000', tmp / 'voice.wav'], check=True)
    subprocess.run([deep_filter, '-D', '-a', '30', '-o', tmp / 'clean', tmp / 'voice.wav'], check=True, capture_output=True)
    audio = np.frombuffer(subprocess.run(['ffmpeg', '-v', 'error', '-i', tmp / 'clean' / 'voice.wav', '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True, check=True).stdout, dtype=np.float32)
    for name, (start, end) in LINES.items():
        sf.write(tmp / f'{name}.wav', audio[int(start * SR):int(end * SR)], SR)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp / f'{name}.wav', '-af', CHAIN, '-ac', '1', '-c:a', 'pcm_f32le', tmp / f'{name}-out.wav'], check=True)
        data, _ = sf.read(tmp / f'{name}-out.wav', dtype='float32')
        sf.write(OUT / f'player-{name}.ogg', data, SR, format='OGG', subtype='VORBIS')
        print(f'player-{name}.ogg {end - start:.2f}s')
