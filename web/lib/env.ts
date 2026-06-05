// Centralized, server-only environment access. Throws early with a clear
// message instead of failing deep inside an SDK call.

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

// A required env var that must parse as an http(s) URL. Guards against a
// malformed/hostile endpoint silently receiving our S3 credentials.
function requiredUrl(name: string): string {
  const v = required(name);
  let parsed: URL;
  try {
    parsed = new URL(v);
  } catch {
    throw new Error(`Env var ${name} must be a valid URL, got: ${v}`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`Env var ${name} must be an http(s) URL, got: ${v}`);
  }
  return v;
}

// A numeric env var that must be a positive integer when set. A malformed value
// (e.g. an empty/garbage S3_SIGNED_URL_TTL coercing to 0 or NaN) would otherwise
// silently produce immediately-expired URLs / a zero retry cap.
function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Env var ${name} must be a positive integer, got: ${raw}`);
  }
  return n;
}

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),

  runpodApiKey: () => required("RUNPOD_API_KEY"),
  runpodEndpointId: () => required("RUNPOD_ENDPOINT_ID"),

  s3: () => ({
    endpoint: requiredUrl("S3_ENDPOINT_URL"),
    accessKeyId: required("S3_ACCESS_KEY_ID"),
    secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
    bucket: required("S3_BUCKET"),
    region: optional("S3_REGION", "auto"),
    publicBaseUrl: optional("S3_PUBLIC_BASE_URL") || undefined,
    signedUrlTtl: positiveInt("S3_SIGNED_URL_TTL", 604800),
  }),

  maxGenerationAttempts: () => positiveInt("MAX_GENERATION_ATTEMPTS", 3),
};
