import { env } from "./env";

const BASE = "https://api.runpod.ai/v2";

export interface AudioWorkerOutput {
  status: "completed" | "failed" | "ok";
  task?: string;
  media_type?: string;
  url?: string;
  object_key?: string;
  metadata?: Record<string, unknown>;
  error_code?: string;
  error?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Audio generation is short, so call RunPod synchronously via /runsync and fall
// back to polling /status if it returns before the job finishes.
export async function generateAudio(
  input: Record<string, unknown>
): Promise<AudioWorkerOutput> {
  const ep = env.runpodAudioEndpointId();
  const headers = {
    Authorization: `Bearer ${env.runpodApiKey()}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(`${BASE}/${ep}/runsync`, {
    method: "POST",
    headers,
    body: JSON.stringify({ input }),
  });
  if (!res.ok) {
    throw new Error(`Audio worker submit failed (${res.status}): ${await res.text()}`);
  }
  let data = (await res.json()) as {
    id: string;
    status: string;
    output?: AudioWorkerOutput;
  };

  let tries = 0;
  while (
    (data.status === "IN_QUEUE" || data.status === "IN_PROGRESS") &&
    tries < 60
  ) {
    await sleep(3000);
    const s = await fetch(`${BASE}/${ep}/status/${data.id}`, {
      headers,
      cache: "no-store",
    });
    data = (await s.json()) as typeof data;
    tries++;
  }

  if (data.status !== "COMPLETED" || !data.output) {
    throw new Error(`Audio job did not complete (status: ${data.status})`);
  }
  const out = data.output;
  if (out.status === "failed") {
    throw new Error(`${out.error_code ?? "GENERATION_FAILED"}: ${out.error ?? "audio generation failed"}`);
  }
  return out;
}
