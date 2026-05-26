"""
Diffusers pipeline loader + task functions for the image worker.

Loads the base model once per process and shares its weights across the
text2img / img2img / inpaint pipelines to save VRAM. Optional face swap via
InsightFace. All heavy imports (torch, diffusers, insightface) happen lazily
inside the functions so the handler's validation logic stays importable without
a GPU runtime — that's what test_local.py relies on.
"""

import base64
import io
import logging
import os
from typing import Any, Dict, List

log = logging.getLogger("image-worker.pipelines")

MODEL_DIR = os.getenv("MODEL_DIR", "/runpod-volume/models/sdxl")
MODEL_ID = os.getenv("MODEL_ID", "stabilityai/stable-diffusion-xl-base-1.0")
FACESWAP_MODEL = os.getenv(
    "FACESWAP_MODEL", "/runpod-volume/models/insightface/inswapper_128.onnx"
)

# Process-wide caches
_pipes: Dict[str, Any] = {}
_face_app = None
_face_swapper = None


def _model_source() -> str:
    """Prefer a preloaded local dir on the network volume; fall back to Hub id."""
    return MODEL_DIR if os.path.isdir(MODEL_DIR) else MODEL_ID


def _device_dtype():
    import torch

    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32
    return device, dtype


def get_pipe(kind: str):
    """kind: 'text2img' | 'img2img' | 'inpaint'. Shares one set of weights."""
    if kind in _pipes:
        return _pipes[kind]

    import torch  # noqa: F401
    from diffusers import (
        AutoPipelineForImage2Image,
        AutoPipelineForInpainting,
        AutoPipelineForText2Image,
    )

    device, dtype = _device_dtype()

    if "text2img" not in _pipes:
        src = _model_source()
        log.info("Loading base text2img pipeline from %s", src)
        base = AutoPipelineForText2Image.from_pretrained(
            src, torch_dtype=dtype, use_safetensors=True
        ).to(device)
        base.enable_attention_slicing()
        _pipes["text2img"] = base

    base = _pipes["text2img"]
    if kind == "text2img":
        return base
    if kind == "img2img":
        _pipes["img2img"] = AutoPipelineForImage2Image.from_pipe(base).to(device)
        return _pipes["img2img"]
    if kind == "inpaint":
        _pipes["inpaint"] = AutoPipelineForInpainting.from_pipe(base).to(device)
        return _pipes["inpaint"]
    raise ValueError(f"unknown pipe kind: {kind}")


def load_image(src: str):
    """Accept an http(s) URL, a data: URI, or a local path → RGB PIL image."""
    from PIL import Image

    if src.startswith("data:"):
        _, b64 = src.split(",", 1)
        return Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
    if src.startswith("http://") or src.startswith("https://"):
        import requests

        resp = requests.get(src, timeout=60)
        resp.raise_for_status()
        return Image.open(io.BytesIO(resp.content)).convert("RGB")
    return Image.open(src).convert("RGB")


def _generator(seed):
    import torch

    if seed is None:
        return None
    device, _ = _device_dtype()
    return torch.Generator(device=device).manual_seed(int(seed))


def run_text2img(p: Dict[str, Any]) -> List[Any]:
    pipe = get_pipe("text2img")
    return pipe(
        prompt=p["prompt"],
        negative_prompt=p.get("negative_prompt") or None,
        width=p["width"],
        height=p["height"],
        num_inference_steps=p["steps"],
        guidance_scale=p["guidance_scale"],
        num_images_per_prompt=p["num_images"],
        generator=_generator(p.get("seed")),
    ).images


def run_img2img(p: Dict[str, Any]) -> List[Any]:
    pipe = get_pipe("img2img")
    return pipe(
        prompt=p["prompt"],
        negative_prompt=p.get("negative_prompt") or None,
        image=load_image(p["image"]),
        strength=p["strength"],
        num_inference_steps=p["steps"],
        guidance_scale=p["guidance_scale"],
        num_images_per_prompt=p["num_images"],
        generator=_generator(p.get("seed")),
    ).images


def run_inpaint(p: Dict[str, Any]) -> List[Any]:
    pipe = get_pipe("inpaint")
    return pipe(
        prompt=p["prompt"],
        negative_prompt=p.get("negative_prompt") or None,
        image=load_image(p["image"]),
        mask_image=load_image(p["mask"]),
        strength=p["strength"],
        num_inference_steps=p["steps"],
        guidance_scale=p["guidance_scale"],
        num_images_per_prompt=p["num_images"],
        generator=_generator(p.get("seed")),
    ).images


def _face_models():
    global _face_app, _face_swapper
    if _face_app is None:
        import insightface
        from insightface.app import FaceAnalysis

        _face_app = FaceAnalysis(name="buffalo_l")
        _face_app.prepare(ctx_id=0, det_size=(640, 640))
        _face_swapper = insightface.model_zoo.get_model(FACESWAP_MODEL)
    return _face_app, _face_swapper


def run_faceswap(p: Dict[str, Any]) -> List[Any]:
    import cv2
    import numpy as np
    from PIL import Image

    app, swapper = _face_models()
    source = cv2.cvtColor(np.array(load_image(p["source_image"])), cv2.COLOR_RGB2BGR)
    target = cv2.cvtColor(np.array(load_image(p["target_image"])), cv2.COLOR_RGB2BGR)

    src_faces = app.get(source)
    tgt_faces = app.get(target)
    if not src_faces:
        raise ValueError("No face detected in source_image.")
    if not tgt_faces:
        raise ValueError("No face detected in target_image.")

    src_face = src_faces[0]
    result = target.copy()
    for face in tgt_faces:
        result = swapper.get(result, face, src_face, paste_back=True)

    return [Image.fromarray(cv2.cvtColor(result, cv2.COLOR_BGR2RGB))]


DISPATCH = {
    "txt2img": run_text2img,
    "img2img": run_img2img,
    "inpaint": run_inpaint,
    "faceswap": run_faceswap,
}
