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

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),

  runpodApiKey: () => required("RUNPOD_API_KEY"),
  runpodEndpointId: () => required("RUNPOD_ENDPOINT_ID"),

  anthropicApiKey: () => required("ANTHROPIC_API_KEY"),

  s3: () => ({
    endpoint: required("S3_ENDPOINT_URL"),
    accessKeyId: required("S3_ACCESS_KEY_ID"),
    secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
    bucket: required("S3_BUCKET"),
    region: optional("S3_REGION", "auto"),
    publicBaseUrl: optional("S3_PUBLIC_BASE_URL") || undefined,
    signedUrlTtl: Number(optional("S3_SIGNED_URL_TTL", "604800")),
  }),

  maxGenerationAttempts: () => Number(optional("MAX_GENERATION_ATTEMPTS", "3")),
};
