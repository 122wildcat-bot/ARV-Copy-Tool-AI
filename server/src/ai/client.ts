/**
 * Anthropic client wrapper (BuildSpec §8). Uses forced tool-use to get reliable
 * structured JSON: define a single tool, force `tool_choice` to it, and read the
 * tool input. Every result is validated with zod; on invalid output we retry,
 * feeding the validation error back to the model (max 2 retries).
 *
 * Direct Anthropic API (not Bedrock) per BuildSpec §3 / §18.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';
import { env } from '../config/env.js';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!env.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  client ??= new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface StructuredCallResult<T> {
  value: T;
  usage: TokenUsage;
}

export interface StructuredCallOptions<T> {
  model: string;
  system: string;
  /** The user-turn content (typically the serialized subject + comps). */
  userContent: string;
  toolName: string;
  toolDescription: string;
  /** JSON Schema for the tool input (what we force the model to produce). */
  inputSchema: Record<string, unknown>;
  /** zod schema used to validate + type the tool input. */
  schema: z.ZodType<T>;
  maxTokens?: number;
  maxRetries?: number;
}

/**
 * Run one forced-tool call and return the validated tool input. Retries on
 * zod-invalid output up to `maxRetries` times, appending the validation error
 * so the model can correct itself.
 */
export async function callStructured<T>(
  opts: StructuredCallOptions<T>,
): Promise<StructuredCallResult<T>> {
  const { model, system, toolName, toolDescription, inputSchema, schema } = opts;
  const maxTokens = opts.maxTokens ?? 4096;
  const maxRetries = opts.maxRetries ?? 2;

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: opts.userContent },
  ];

  let lastError = '';
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await getClient().messages.create({
      model,
      max_tokens: maxTokens,
      system,
      tools: [
        {
          name: toolName,
          description: toolDescription,
          input_schema: inputSchema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: toolName },
      messages,
    });

    usage.inputTokens += response.usage.input_tokens;
    usage.outputTokens += response.usage.output_tokens;

    const toolBlock = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === toolName,
    );

    if (toolBlock) {
      const parsed = schema.safeParse(toolBlock.input);
      if (parsed.success) {
        return { value: parsed.data, usage };
      }
      lastError = parsed.error.message;
      // Feed the assistant turn + a correction request back for the retry.
      messages.push({ role: 'assistant', content: response.content });
      messages.push({
        role: 'user',
        content: `The previous ${toolName} output failed validation: ${lastError}. Call ${toolName} again with corrected values that satisfy the schema.`,
      });
    } else {
      lastError = 'model did not call the required tool';
      messages.push({
        role: 'user',
        content: `You must call the ${toolName} tool. ${lastError}.`,
      });
    }
  }

  throw new Error(`${toolName} failed schema validation after ${maxRetries + 1} attempts: ${lastError}`);
}
