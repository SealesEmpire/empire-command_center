"""
S3-compatible storage uploader.

Works with:
- Cloudflare R2 (recommended — no egress fees)
- AWS S3
- RunPod S3-compatible storage
- Supabase Storage (via S3 endpoint)

Configure via environment variables — never hardcode credentials.
"""

import os
import logging
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import boto3
from botocore.client import Config
from botocore.exceptions import BotoCoreError, ClientError

log = logging.getLogger(__name__)


class StorageConfig:
    """Read storage config from env. All optional — if endpoint missing, upload is skipped."""

    def __init__(self) -> None:
        self.endpoint_url: Optional[str] = os.getenv("S3_ENDPOINT_URL")
        self.access_key: Optional[str] = os.getenv("S3_ACCESS_KEY_ID")
        self.secret_key: Optional[str] = os.getenv("S3_SECRET_ACCESS_KEY")
        self.bucket: Optional[str] = os.getenv("S3_BUCKET")
        self.region: str = os.getenv("S3_REGION", "auto")
        # Public CDN base — for R2 with public bucket, e.g. https://pub-xxx.r2.dev
        # If set, returns public URL instead of signed URL
        self.public_base_url: Optional[str] = os.getenv("S3_PUBLIC_BASE_URL")
        # Signed URL TTL in seconds (default 7 days, R2 max)
        self.signed_url_ttl: int = int(os.getenv("S3_SIGNED_URL_TTL", "604800"))

    @property
    def is_configured(self) -> bool:
        return all([self.endpoint_url, self.access_key, self.secret_key, self.bucket])


class StorageUploader:
    """Uploads files to S3-compatible storage and returns a URL."""

    def __init__(self, config: Optional[StorageConfig] = None) -> None:
        self.config = config or StorageConfig()
        self._client = None

    @property
    def client(self):
        if self._client is None:
            if not self.config.is_configured:
                raise RuntimeError(
                    "Storage not configured. Set S3_ENDPOINT_URL, S3_ACCESS_KEY_ID, "
                    "S3_SECRET_ACCESS_KEY, and S3_BUCKET environment variables."
                )
            self._client = boto3.client(
                "s3",
                endpoint_url=self.config.endpoint_url,
                aws_access_key_id=self.config.access_key,
                aws_secret_access_key=self.config.secret_key,
                region_name=self.config.region,
                config=Config(signature_version="s3v4"),
            )
        return self._client

    def upload(self, local_path: Path, object_key: str, content_type: str = "video/mp4") -> dict:
        """
        Upload a file and return URL info.

        Returns:
            {
                "object_key": str,
                "url": str,          # signed or public URL
                "url_type": "signed" | "public",
                "size_bytes": int,
            }
        """
        if not local_path.exists():
            raise FileNotFoundError(f"Local file not found: {local_path}")

        size_bytes = local_path.stat().st_size

        try:
            self.client.upload_file(
                Filename=str(local_path),
                Bucket=self.config.bucket,
                Key=object_key,
                ExtraArgs={"ContentType": content_type},
            )
        except (BotoCoreError, ClientError) as e:
            log.exception("S3 upload failed")
            raise RuntimeError(f"Storage upload failed: {e}") from e

        # Prefer public URL if configured (faster, no signing overhead)
        if self.config.public_base_url:
            base = self.config.public_base_url.rstrip("/")
            url = f"{base}/{object_key}"
            url_type = "public"
        else:
            url = self.client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.config.bucket, "Key": object_key},
                ExpiresIn=self.config.signed_url_ttl,
            )
            url_type = "signed"

        return {
            "object_key": object_key,
            "url": url,
            "url_type": url_type,
            "size_bytes": size_bytes,
        }
