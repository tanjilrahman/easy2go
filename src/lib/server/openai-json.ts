import OpenAI from "openai";
import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";

import { getServerOpenAIToken } from "@/lib/server/openai-auth";

export async function generateStructuredObject<TSchema extends z.ZodTypeAny>({
  schema,
  schemaName,
  system,
  prompt,
  model = process.env.OPENAI_ROUTE_MODEL ?? "gpt-5-mini",
}: {
  schema: TSchema;
  schemaName: string;
  system: string;
  prompt: string;
  model?: string;
}) {
  const auth = await getServerOpenAIToken();
  if (!auth) {
    return null;
  }

  const client = new OpenAI({
    apiKey: auth.token,
  });

  const response = await client.responses.create({
    model,
    instructions: system,
    input: prompt,
    max_output_tokens: 2200,
    text: {
      format: {
        type: "json_schema",
        name: schemaName,
        strict: true,
        schema: zodToJsonSchema(
          schema as unknown as Parameters<typeof zodToJsonSchema>[0],
          schemaName,
        ),
      },
    },
  });

  if (!response.output_text) {
    return null;
  }

  return schema.parse(JSON.parse(response.output_text));
}
