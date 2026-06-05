import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { env } from "./env";

const KEYS = [
  "S3_ENDPOINT_URL",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_BUCKET",
  "S3_REGION",
  "S3_PUBLIC_BASE_URL",
  "S3_SIGNED_URL_TTL",
  "MAX_GENERATION_ATTEMPTS",
];

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function setS3Required() {
  process.env.S3_ENDPOINT_URL = "https://acc.r2.cloudflarestorage.com";
  process.env.S3_ACCESS_KEY_ID = "key";
  process.env.S3_SECRET_ACCESS_KEY = "secret";
  process.env.S3_BUCKET = "bucket";
}

describe("env.s3 endpoint validation", () => {
  it("rejects a non-URL endpoint", () => {
    setS3Required();
    process.env.S3_ENDPOINT_URL = "not a url";
    expect(() => env.s3()).toThrow(/must be a valid URL/);
  });

  it("rejects a non-http(s) endpoint scheme", () => {
    setS3Required();
    process.env.S3_ENDPOINT_URL = "ftp://host/path";
    expect(() => env.s3()).toThrow(/http\(s\) URL/);
  });

  it("accepts a valid https endpoint", () => {
    setS3Required();
    expect(env.s3().endpoint).toBe("https://acc.r2.cloudflarestorage.com");
  });
});

describe("env.s3 signed url ttl", () => {
  it("defaults to 7 days when unset", () => {
    setS3Required();
    expect(env.s3().signedUrlTtl).toBe(604800);
  });

  it("rejects zero / non-numeric / negative values instead of coercing to 0", () => {
    setS3Required();
    for (const bad of ["0", "abc", "-5", "1.5"]) {
      process.env.S3_SIGNED_URL_TTL = bad;
      expect(() => env.s3()).toThrow(/positive integer/);
    }
  });
});

describe("env.maxGenerationAttempts", () => {
  it("defaults to 3", () => {
    expect(env.maxGenerationAttempts()).toBe(3);
  });

  it("rejects garbage values", () => {
    process.env.MAX_GENERATION_ATTEMPTS = "-1";
    expect(() => env.maxGenerationAttempts()).toThrow(/positive integer/);
  });
});
