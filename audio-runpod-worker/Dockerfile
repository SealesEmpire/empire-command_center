FROM runpod/pytorch:2.8.0-py3.11-cuda12.8.1-cudnn-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV HF_HOME=/runpod-volume/.cache/huggingface
ENV TRANSFORMERS_CACHE=/runpod-volume/.cache/huggingface
ENV OUTPUT_DIR=/runpod-volume/outputs/audio

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    git ffmpeg libsndfile1 ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

RUN python -m pip install --upgrade pip setuptools wheel \
    && pip install --no-cache-dir \
        audiocraft \
        transformers \
        accelerate \
        soundfile \
        scipy \
        runpod \
        huggingface_hub \
        boto3

COPY rp_handler.py /app/rp_handler.py
COPY pipelines.py /app/pipelines.py
COPY storage.py /app/storage.py
COPY scripts/download_model.py /app/scripts/download_model.py

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD python -c "import rp_handler" || exit 1

CMD ["python", "-u", "/app/rp_handler.py"]
