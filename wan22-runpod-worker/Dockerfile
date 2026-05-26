FROM runpod/pytorch:2.8.0-py3.11-cuda12.8.1-cudnn-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV HF_HOME=/runpod-volume/.cache/huggingface
ENV TRANSFORMERS_CACHE=/runpod-volume/.cache/huggingface
ENV MODEL_DIR=/runpod-volume/models/Wan2.2-TI2V-5B
ENV OUTPUT_DIR=/runpod-volume/outputs
ENV WAN_REPO_DIR=/app/Wan2.2

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    git-lfs \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    ca-certificates \
    curl \
    && git lfs install \
    && rm -rf /var/lib/apt/lists/*

# Clone WAN 2.2 repo
RUN git clone https://github.com/Wan-Video/Wan2.2.git /app/Wan2.2

# Install Python deps
WORKDIR /app/Wan2.2
RUN python -m pip install --upgrade pip setuptools wheel \
    && pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir \
        runpod \
        huggingface_hub \
        boto3 \
        pydantic

WORKDIR /app

# Copy worker code
COPY rp_handler.py /app/rp_handler.py
COPY storage.py /app/storage.py
COPY scripts/download_model.py /app/scripts/download_model.py

# Health check — verifies handler imports without crashing
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD python -c "import rp_handler" || exit 1

CMD ["python", "-u", "/app/rp_handler.py"]
