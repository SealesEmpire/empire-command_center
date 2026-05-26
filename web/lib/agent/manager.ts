import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { getManagerInstructions } from "@/lib/managerSettings";
import { TOOLS, runTool } from "./tools";

const MODEL = "claude-opus-4-7";
const MAX_TOOL_ITERATIONS = 16;

const BASE_SYSTEM_PROMPT = `You are the Manager bot for Empire Command Center — an AI media generation platform.

You operate the platform on the user's behalf by calling tools.

VIDEO pipeline:
1. A PROJECT contains ordered SCENES (one shot each).
2. Each scene has a text PROMPT. Generating a scene runs it on a GPU worker (WAN 2.2) and produces a clip ("take"). A scene can have multiple takes.
3. The user APPROVES one take per scene.
4. Once every scene has an approved take, the project is ASSEMBLED into a final stitched video.

IMAGES (separate from video): use generate_image for stills, thumbnails, concept art, edits, and face swaps. It runs synchronously and returns image url(s) immediately — there is no approve/assemble step for standalone images.

Rules:
- Video generation is asynchronous and takes minutes. After generate_scene, tell the user it's running; use check_jobs to poll — do not claim a clip exists until check_jobs or get_project shows one.
- Always inspect state with get_project before approving or assembling so you reference real scene/asset ids.
- Only assemble when every scene has an approved take. If some don't, say which are missing.
- When writing prompts, make them cinematic and specific (camera motion, lighting, mood) unless the user gave exact wording.
- Be concise. Confirm what you did and what the next step is. Report ids/urls you get back briefly.
- Never invent ids or urls — only use values returned by tools.`;

// Compose the system prompt from the base + operator knowledge. Knowledge comes
// from two places: the dashboard-editable DB setting and the optional env var.
// Both are appended as authoritative operator instructions.
async function buildSystemPrompt(): Promise<string> {
  const dbInstr = (await getManagerInstructions()).trim();
  const envInstr = env.managerExtraInstructions().trim();
  const operator = [dbInstr, envInstr].filter(Boolean).join("\n\n");
  return operator
    ? `${BASE_SYSTEM_PROMPT}\n\n## Operator instructions (authoritative)\n${operator}`
    : BASE_SYSTEM_PROMPT;
}

export interface ToolEvent {
  name: string;
  input: Record<string, unknown>;
  result: unknown;
  isError: boolean;
}

export interface ManagerResult {
  messages: Anthropic.MessageParam[];
  reply: string;
  toolEvents: ToolEvent[];
}

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: env.anthropicApiKey() });
  return _client;
}

// Run one user turn through the agentic loop: the model may call tools
// repeatedly until it produces a final text answer. Returns the updated message
// history (so the caller can persist it) plus the assistant's reply and a log
// of tool activity for the UI.
export async function runManagerTurn(
  history: Anthropic.MessageParam[]
): Promise<ManagerResult> {
  const messages: Anthropic.MessageParam[] = [...history];
  const toolEvents: ToolEvent[] = [];
  const sys = await buildSystemPrompt();

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await client().messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      system: [
        { type: "text", text: sys, cache_control: { type: "ephemeral" } },
      ],
      tools: TOOLS,
      messages,
    });

    // Preserve the full assistant content (incl. thinking blocks) verbatim.
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      const reply = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { messages, reply, toolEvents };
    }

    // Execute every requested tool and feed results back in one user turn.
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const input = (block.input ?? {}) as Record<string, unknown>;
      let result: unknown;
      let isError = false;
      try {
        result = await runTool(block.name, input);
      } catch (e) {
        result = { error: e instanceof Error ? e.message : String(e) };
        isError = true;
      }
      toolEvents.push({ name: block.name, input, result, isError });
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
        is_error: isError,
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return {
    messages,
    reply:
      "I hit the maximum number of tool steps for one turn. Tell me to continue and I'll keep going.",
    toolEvents,
  };
}
