// ============================================
// LLM Module — OpenAI-compatible API (DeepSeek V4 Pro)
// ============================================
// Uses OpenAI SDK to connect to any OpenAI-compatible endpoint.
// Default: DeepSeek V4 Pro via https://api.deepseek.com
//
// Required env vars:
//   OPENAI_API_KEY    — DeepSeek API key (or any OpenAI-compatible key)
//   OPENAI_BASE_URL   — API endpoint (default: https://api.deepseek.com)
//   LLM_MODEL         — Model name (default: deepseek-chat)
// ============================================

import OpenAI from 'openai';

// ─── Configuration ───────────────────────────────────────────────────────────

const LLM_CONFIG = {
  model: process.env.LLM_MODEL || 'deepseek-chat',
  temperature: 0.1,
  maxTokens: 8192,
  topP: 0.9,
  timeout: 120_000,
};

// ─── Singleton OpenAI client ─────────────────────────────────────────────────

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not set. Please set it in .env to your DeepSeek API key.',
      );
    }
    client = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.deepseek.com',
      timeout: LLM_CONFIG.timeout,
    });
    console.log(
      `[LLM] Connected to ${client.baseURL} model=${LLM_CONFIG.model}`,
    );
  }
  return client;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export class QuotaExceededError extends Error {
  constructor(message: string, public readonly statusCode?: number) {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

function isQuotaError(error: unknown): boolean {
  const err = error as Record<string, unknown>;
  const status = err.status as number | undefined;
  const message = (err.message as string)?.toLowerCase() || '';
  // HTTP 402 Payment Required, 429 Too Many Requests
  if (status === 402 || status === 429) return true;
  // DeepSeek/OpenAI quota-specific messages
  if (message.includes('quota') || message.includes('insufficient')) return true;
  if (message.includes('billing') || message.includes('payment')) return true;
  if (message.includes('exceeded') && (message.includes('rate') || message.includes('limit'))) return true;
  return false;
}

/**
 * Basic chat completion.
 */
export async function chatCompletion(
  systemPrompt: string,
  userPrompt: string,
  options: Partial<typeof LLM_CONFIG> = {},
): Promise<string> {
  const config = { ...LLM_CONFIG, ...options };
  const openai = getClient();

  try {
    const completion = await openai.chat.completions.create({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      top_p: config.topP,
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('LLM returned empty response');
    }
    return content;
  } catch (error: unknown) {
    if (isQuotaError(error)) {
      throw new QuotaExceededError(
        `LLM quota exceeded: ${(error as Error).message}`,
        (error as Record<string, unknown>).status as number | undefined,
      );
    }
    throw error;
  }
}

/**
 * Chat completion with exponential backoff retry logic.
 */
export async function chatWithRetry(
  systemPrompt: string,
  userPrompt: string,
  maxRetries: number = 3,
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await chatCompletion(systemPrompt, userPrompt);
    } catch (error: unknown) {
      // Quota/rate-limit errors: do NOT retry, fail immediately
      if (error instanceof QuotaExceededError) {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error('Unknown error');
      console.warn(`[LLM] Attempt ${attempt}/${maxRetries} failed:`, lastError.message);

      if (attempt < maxRetries) {
        const delayMs = 1000 * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError || new Error('LLM call failed after retries');
}

/**
 * Get a structured JSON response from the LLM.
 *
 * Strategy (in order):
 *  1. Parse the raw response directly (DeepSeek often returns clean JSON)
 *  2. Strip markdown code fences (```json ... ```)
 *  3. Find the first { ... } or [ ... ] block via brace/bracket matching
 */
export async function getJSONResponse<T>(
  systemPrompt: string,
  userPrompt: string,
): Promise<T> {
  const response = await chatCompletion(systemPrompt, userPrompt);
  return parseJSONFromLLM<T>(response);
}

/**
 * Parse JSON from an LLM response string, trying multiple strategies.
 * Exported for testing and reuse.
 */
export function parseJSONFromLLM<T>(response: string): T {
  const trimmed = response.trim();

  // Strategy 1: Direct parse (DeepSeek often returns clean JSON)
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // fall through
  }

  // Strategy 2: Strip markdown code fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as T;
    } catch {
      // fall through
    }
  }

  // Strategy 3: Extract first { ... } or [ ... ] via brace matching
  const jsonBlock = extractJsonBlock(trimmed);
  if (jsonBlock) {
    try {
      return JSON.parse(jsonBlock) as T;
    } catch {
      // fall through
    }
  }

  console.error('[LLM] Failed to parse JSON. Raw response (first 500 chars):', trimmed.substring(0, 500));
  throw new Error('LLM did not return valid JSON format');
}

/**
 * Extract the first JSON object or array from text using brace/bracket matching.
 */
function extractJsonBlock(text: string): string | null {
  // Find the first { or [
  const startIdx = text.search(/[\[{]/);
  if (startIdx === -1) return null;

  const opener = text[startIdx];
  const closer = opener === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === opener || (opener === '{' && ch === '{') || (opener === '[' && ch === '[')) {
      if (ch === '{' || ch === '[') depth++;
    }
    if (ch === closer || (closer === '}' && ch === '}') || (closer === ']' && ch === ']')) {
      if (ch === '}' || ch === ']') depth--;
    }

    if (depth === 0 && i > startIdx) {
      return text.substring(startIdx, i + 1);
    }
  }

  return null;
}

// ─── Structured Output (T5) ──────────────────────────────────────────────────

export type StructuredOutputMode = 'tool' | 'json_schema' | 'markdown';

/**
 * Get the structured output mode from env var LLM_OUTPUT_MODE.
 * Default: 'markdown' (always works, uses fence-stripping fallback).
 */
export function getStructuredOutputMode(): StructuredOutputMode {
  const mode = process.env.LLM_OUTPUT_MODE;
  if (mode === 'tool' || mode === 'json_schema' || mode === 'markdown') return mode;
  return 'markdown';
}

/**
 * Get structured JSON from the LLM using the configured mode.
 *
 * Strategy depends on LLM_OUTPUT_MODE:
 *  - 'tool':        Use OpenAI function calling (tools + tool_choice)
 *  - 'json_schema': Use OpenAI response_format json_schema
 *  - 'markdown':    Fall back to getJSONResponse (fence stripping + brace matching)
 *
 * Modes 'tool' and 'json_schema' automatically fall back to 'markdown' on failure.
 */
export async function getStructuredJSONResponse<T>(
  systemPrompt: string,
  userPrompt: string,
  jsonSchema: Record<string, unknown>,
  options: Partial<typeof LLM_CONFIG> = {},
): Promise<T> {
  const mode = getStructuredOutputMode();
  const config = { ...LLM_CONFIG, ...options };

  if (mode === 'tool') {
    try {
      return await getStructuredJSONViaTool<T>(systemPrompt, userPrompt, jsonSchema, config);
    } catch (error) {
      console.warn('[LLM] Structured output via tool failed, falling back to json_schema:', error instanceof Error ? error.message : error);
    }
  }

  if (mode === 'tool' || mode === 'json_schema') {
    try {
      return await getStructuredJSONViaSchema<T>(systemPrompt, userPrompt, jsonSchema, config);
    } catch (error) {
      console.warn('[LLM] Structured output via json_schema failed, falling back to markdown:', error instanceof Error ? error.message : error);
    }
  }

  // Final fallback: markdown mode (always works)
  return getJSONResponse<T>(systemPrompt, userPrompt);
}

/**
 * Structured output via OpenAI function calling (tools + tool_choice).
 */
async function getStructuredJSONViaTool<T>(
  systemPrompt: string,
  userPrompt: string,
  jsonSchema: Record<string, unknown>,
  config: typeof LLM_CONFIG,
): Promise<T> {
  const openai = getClient();

  const completion = await openai.chat.completions.create({
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    top_p: config.topP,
    tools: [
      {
        type: 'function',
        function: {
          name: 'emit',
          description: 'Emit the structured analysis result as JSON',
          parameters: jsonSchema as Record<string, unknown>,
        },
      },
    ],
    tool_choice: { type: 'function', function: { name: 'emit' } },
  });

  const toolCall = completion.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) {
    throw new Error('LLM did not return a tool call');
  }
  const args = 'function' in toolCall ? toolCall.function?.arguments : undefined;
  if (!args) {
    throw new Error('LLM tool call has no function arguments');
  }

  return JSON.parse(args) as T;
}

/**
 * Structured output via OpenAI response_format json_schema.
 */
async function getStructuredJSONViaSchema<T>(
  systemPrompt: string,
  userPrompt: string,
  jsonSchema: Record<string, unknown>,
  config: typeof LLM_CONFIG,
): Promise<T> {
  const openai = getClient();

  const completion = await openai.chat.completions.create({
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    top_p: config.topP,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'result',
        schema: jsonSchema,
        strict: false,
      },
    } as never,
  });

  const content = completion.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('LLM returned empty response with json_schema mode');
  }

  return JSON.parse(content) as T;
}
