import type Anthropic from "@anthropic-ai/sdk";
import { runManagerTurn } from "@/lib/agent/manager";
import { ok, badRequest, serverError } from "@/lib/http";

export const runtime = "nodejs";
// Tool loops may include a generation kick or an assembly (ffmpeg) — allow room.
export const maxDuration = 300;

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

// Accepts the prior conversation as plain text turns + the new user message,
// runs one Manager turn (which may call many tools), and returns the assistant
// reply plus a log of tool activity. The client keeps only text turns; the DB
// is the source of truth, so each turn re-queries state via tools as needed.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const turns: unknown = body.messages;
    if (!Array.isArray(turns) || turns.length === 0) {
      return badRequest("messages must be a non-empty array of {role, content}");
    }

    const history: Anthropic.MessageParam[] = [];
    for (const t of turns as ChatTurn[]) {
      if (
        (t.role !== "user" && t.role !== "assistant") ||
        typeof t.content !== "string"
      ) {
        return badRequest("each message needs role 'user'|'assistant' and string content");
      }
      history.push({ role: t.role, content: t.content });
    }
    if (history[history.length - 1].role !== "user") {
      return badRequest("the last message must be from the user");
    }

    const result = await runManagerTurn(history);
    return ok({ reply: result.reply, toolEvents: result.toolEvents });
  } catch (e) {
    return serverError(e);
  }
}
