// Shared Claude API client used by classify, dedupe, summarize, extract-tasks
//
// Uses Anthropic's Messages API. Set ANTHROPIC_API_KEY as a secret:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const MODEL = "claude-sonnet-4-5";

export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export async function askClaude(
  systemPrompt: string,
  messages: ClaudeMessage[],
  maxTokens = 2048,
): Promise<string> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Claude API failed (${resp.status}): ${err}`);
  }

  const data = await resp.json();
  return data.content?.[0]?.text ?? "";
}

// Extract JSON from Claude's response, even if wrapped in markdown fences
export function extractJSON<T = unknown>(text: string): T {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

// Generate an embedding using OpenAI's text-embedding-3-small (1536 dims)
// This matches our pgvector(1536) column.
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

export async function getEmbedding(text: string): Promise<number[]> {
  const resp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text.slice(0, 8000),  // truncate to fit context
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Embedding API failed (${resp.status}): ${err}`);
  }

  const data = await resp.json();
  return data.data[0].embedding;
}
