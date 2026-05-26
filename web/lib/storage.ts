import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";
import { env } from "./env";

let _client: S3Client | null = null;

function client(): S3Client {
  if (_client) return _client;
  const cfg = env.s3();
  _client = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    forcePathStyle: true, // required for R2 / most S3-compatible providers
  });
  return _client;
}

export async function downloadObject(objectKey: string): Promise<Buffer> {
  const cfg = env.s3();
  const res = await client().send(
    new GetObjectCommand({ Bucket: cfg.bucket, Key: objectKey })
  );
  const body = res.Body as Readable;
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export interface UploadResult {
  objectKey: string;
  url: string;
  urlType: "public" | "signed";
  sizeBytes: number;
}

export async function uploadObject(
  objectKey: string,
  body: Buffer,
  contentType = "video/mp4"
): Promise<UploadResult> {
  const cfg = env.s3();
  await client().send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: objectKey,
      Body: body,
      ContentType: contentType,
    })
  );

  if (cfg.publicBaseUrl) {
    return {
      objectKey,
      url: `${cfg.publicBaseUrl.replace(/\/$/, "")}/${objectKey}`,
      urlType: "public",
      sizeBytes: body.length,
    };
  }

  const url = await getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: cfg.bucket, Key: objectKey }),
    { expiresIn: cfg.signedUrlTtl }
  );
  return { objectKey, url, urlType: "signed", sizeBytes: body.length };
}

// Re-sign a stored object key (clip URLs from the worker may have expired).
export async function freshSignedUrl(objectKey: string): Promise<string> {
  const cfg = env.s3();
  if (cfg.publicBaseUrl) {
    return `${cfg.publicBaseUrl.replace(/\/$/, "")}/${objectKey}`;
  }
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: cfg.bucket, Key: objectKey }),
    { expiresIn: cfg.signedUrlTtl }
  );
}
