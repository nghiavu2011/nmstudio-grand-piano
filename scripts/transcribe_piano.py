import os
import sys
from pathlib import Path
import time
import torch

# Force UTF-8 stdout
sys.stdout.reconfigure(encoding='utf-8')

import librosa
from piano_transcription_inference import PianoTranscription, sample_rate

PROJECT_ROOT = Path(__file__).resolve().parent.parent
AUDIO_DIR = PROJECT_ROOT / 'public' / 'audio_demo'
MIDI_DIR = PROJECT_ROOT / 'public' / 'midi'

FILES = [
    ('50-nam-ve-sau.mp3', '50-nam-ve-sau.mid'),
    ('bai-thanh-ca-buon.mp3', 'bai-thanh-ca-buon.mid'),
    ('close-to-you.mp3', 'close-to-you.mid'),
    ('dandelions-promise.mp3', 'dandelions-promise.mid'),
    ('golden-hour.mp3', 'golden-hour.mid'),
    ('haru-haru.mp3', 'haru-haru.mid'),
    ('ill-never-love-again.mp3', 'ill-never-love-again.mid'),
    ('imagine.mp3', 'imagine.mid'),
    ('interstellar.mp3', 'interstellar.mid'),
    ('last-christmas.mp3', 'last-christmas.mid'),
    ('merry-go-round-of-life.mp3', 'merry-go-round-of-life.mid'),
    ('proud-of-you.mp3', 'proud-of-you.mid'),
    ('su-thanh-hoa.mp3', 'su-thanh-hoa.mid'),
    ('vet-mua.mp3', 'vet-mua.mid'),
]

def main():
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"Initializing ByteDance Piano Transcription Model on {device}...", flush=True)
    transcriptor = PianoTranscription(device=device)
    print("Model initialized successfully!\n", flush=True)

    total_files = len(FILES)
    for idx, (audio_file, midi_file) in enumerate(FILES, 1):
        audio_path = AUDIO_DIR / audio_file
        midi_path = MIDI_DIR / midi_file

        if not audio_path.exists():
            print(f"[{idx}/{total_files}] SKIP: Audio file not found: {audio_path}", flush=True)
            continue

        print(f"[{idx}/{total_files}] Loading {audio_file}...", flush=True)
        start_time = time.time()

        # Load audio (mono, 16000Hz)
        audio, _ = librosa.load(str(audio_path), sr=sample_rate, mono=True)
        duration_sec = len(audio) / sample_rate
        print(f"   Loaded ({duration_sec:.1f}s), transcribing to {midi_file}...", flush=True)

        # Transcribe audio to MIDI events with 1:1 onsets, offsets, pitch and pedal
        transcribed_dict = transcriptor.transcribe(audio, str(midi_path))
        notes = transcribed_dict.get('est_note_events', [])
        pedals = transcribed_dict.get('est_pedal_events', [])

        elapsed = time.time() - start_time
        print(f"   ✓ Done in {elapsed:.1f}s | Notes: {len(notes)} | Pedals: {len(pedals)}\n", flush=True)

    print("\nAll 14 master tracks transcribed to 1:1 synchronized MIDI successfully!", flush=True)

if __name__ == '__main__':
    main()
