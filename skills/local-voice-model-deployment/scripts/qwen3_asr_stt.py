#!/usr/bin/env python3
"""Qwen3-ASR-1.7B STT wrapper for Hermes HERMES_LOCAL_STT_COMMAND.

Usage: qwen3_asr_stt.py <input_audio> <output_dir> [language]
Writes: <output_dir>/<stem>.txt containing the transcript.

Designed for macOS Apple Silicon (MPS + bf16). Forces offline mode so the
model never phones home to huggingface.co. Must run under the Hermes venv:
    ~/.hermes/hermes-agent/venv/bin/python qwen3_asr_stt.py ...
"""

import os
import sys
import time

# Force offline BEFORE importing torch/transformers — model is cached locally,
# and AutoProcessor otherwise tries a Mistral-regex network check that dies on
# SSL reset in China.
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("HF_HUB_OFFLINE", "1")

# ISO 639-1 → Qwen3-ASR full language names (the package rejects ISO codes).
LANG_MAP = {
    "zh": "Chinese", "en": "English", "yue": "Cantonese",
    "ja": "Japanese", "ko": "Korean", "ar": "Arabic",
    "de": "German", "fr": "French", "es": "Spanish",
    "pt": "Portuguese", "id": "Indonesian", "it": "Italian",
    "ru": "Russian", "th": "Thai", "vi": "Vietnamese",
    "tr": "Turkish", "hi": "Hindi", "ms": "Malay",
    "nl": "Dutch", "sv": "Swedish", "da": "Danish",
    "fi": "Finnish", "pl": "Polish", "cs": "Czech",
    "tl": "Filipino", "fa": "Persian", "el": "Greek",
    "ro": "Romanian", "hu": "Hungarian", "mk": "Macedonian",
}


def main() -> None:
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <input_audio> <output_dir> [language]", file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    output_dir = sys.argv[2]
    raw_lang = sys.argv[3] if len(sys.argv) > 3 else "Chinese"
    language = LANG_MAP.get(raw_lang.lower(), raw_lang)

    import torch
    from qwen_asr import Qwen3ASRModel

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"[qwen3-asr] Loading on {device}...", file=sys.stderr, flush=True)

    t0 = time.time()
    model = Qwen3ASRModel.from_pretrained(
        "Qwen/Qwen3-ASR-1.7B",
        dtype=torch.bfloat16,
        device_map=device,
        max_inference_batch_size=1,
        max_new_tokens=512,
    )
    t1 = time.time()
    print(f"[qwen3-asr] Model loaded in {t1 - t0:.1f}s", file=sys.stderr, flush=True)

    results = model.transcribe(input_path, language=language)
    t2 = time.time()
    print(f"[qwen3-asr] Transcription done in {t2 - t1:.1f}s", file=sys.stderr, flush=True)

    # qwen_asr returns ASRTranscription objects with .text, NOT dicts.
    # r.get("text") raises AttributeError — access .text directly.
    if isinstance(results, list):
        transcript = " ".join(
            r.text if hasattr(r, "text") else str(r) for r in results
        ).strip()
    elif hasattr(results, "text"):
        transcript = results.text.strip()
    else:
        transcript = str(results).strip()

    from pathlib import Path
    out_path = Path(output_dir) / f"{Path(input_path).stem}.txt"
    out_path.write_text(transcript, encoding="utf-8")
    print(f"[qwen3-asr] Written: {out_path} ({len(transcript)} chars)", file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()
