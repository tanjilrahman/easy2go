import { promises as fs } from "fs";
import os from "os";
import path from "path";

import { z } from "zod";

const authSchema = z.object({
  OPENAI_API_KEY: z.string().optional().default(""),
  tokens: z
    .object({
      access_token: z.string().optional(),
    })
    .optional(),
});

export async function getServerOpenAIToken() {
  if (process.env.OPENAI_API_KEY) {
    return { token: process.env.OPENAI_API_KEY, source: "env-api-key" as const };
  }

  if (process.env.OPENAI_ACCESS_TOKEN) {
    return { token: process.env.OPENAI_ACCESS_TOKEN, source: "env-access-token" as const };
  }

  try {
    const authFile = path.join(os.homedir(), ".codex", "auth.json");
    const file = await fs.readFile(authFile, "utf8");
    const parsed = authSchema.parse(JSON.parse(file));

    if (parsed.OPENAI_API_KEY) {
      return { token: parsed.OPENAI_API_KEY, source: "codex-api-key" as const };
    }

    if (parsed.tokens?.access_token) {
      return {
        token: parsed.tokens.access_token,
        source: "codex-access-token" as const,
      };
    }
  } catch {
    return null;
  }

  return null;
}
