"""
Audio generation pipelines for the audio worker (bot #3).

  music — text → music via MusicGen (audiocraft)
  tts   — text → voiceover via Bark (transformers)

Heavy imports are lazy so the handler's validation stays importable without a
GPU (test_local.py relies on this). Each function returns (samples, sample_rate)
where samples is a numpy array shaped (frames,) or (frames, channels).
"""

import logging
import os
from typing import Any, Dict, Tuple

log = logging.getLogger("audio-worker.pipelines")

MUSICGEN_MODEL = os.getenv("MUSICGEN_MODEL", "facebook/musicgen-small")
BARK_MODEL = os.getenv("BARK_MODEL", "suno/bark-small")

_musicgen = None
_bark = None
_bark_processor = None


def _device() -> str:
    import torch

    return "cuda" if torch.cuda.is_available() else "cpu"


def run_music(p: Dict[str, Any]) -> Tuple[Any, int]:
    global _musicgen
    from audiocraft.models import MusicGen

    if _musicgen is None:
        log.info("Loading MusicGen %s", MUSICGEN_MODEL)
        _musicgen = MusicGen.get_pretrained(MUSICGEN_MODEL)
    _musicgen.set_generation_params(duration=p["duration"])
    wav = _musicgen.generate([p["prompt"]])  # (1, channels, samples)
    samples = wav[0].cpu().numpy().T  # (samples, channels)
    return samples, int(_musicgen.sample_rate)


def run_tts(p: Dict[str, Any]) -> Tuple[Any, int]:
    global _bark, _bark_processor
    from transformers import AutoProcessor, BarkModel

    if _bark is None:
        log.info("Loading Bark %s", BARK_MODEL)
        _bark_processor = AutoProcessor.from_pretrained(BARK_MODEL)
        _bark = BarkModel.from_pretrained(BARK_MODEL).to(_device())

    inputs = _bark_processor(p["text"], voice_preset=p.get("voice_preset"))
    inputs = {k: v.to(_device()) for k, v in inputs.items()}
    out = _bark.generate(**inputs)
    samples = out.cpu().numpy().squeeze()
    sr = int(_bark.generation_config.sample_rate)
    return samples, sr


DISPATCH = {"music": run_music, "tts": run_tts}
