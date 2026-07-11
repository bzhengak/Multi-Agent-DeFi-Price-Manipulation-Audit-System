// ============================================
// LLM Module — OpenAI-compatible API (Dual Provider)
// ============================================
// Uses OpenAI SDK to connect to any OpenAI-compatible endpoint.
// Supports three providers:
//   - Primary: GLM 5.2 via ZhipuAI (deep reasoning: vulnerability analysis, protocol detection)
//   - Medium: DeepSeek V4 Pro via DeepSeek (moderate reasoning: PoC generation, context fallback)
//   - Fast: DeepSeek V4 Flash via DeepSeek (simple tasks: report gen, summary)
//
// Required env vars (primary):
//   OPENAI_API_KEY    — Primary API key (GLM 5.2)
//   OPENAI_BASE_URL   — Primary API endpoint
//   LLM_MODEL         — Primary model name (default: deepseek-chat)
//
// Optional env vars (medium provider):
//   OPENAI_API_KEY_MEDIUM   — Medium API key (DeepSeek V4 Pro)
//   OPENAI_BASE_URL_MEDIUM  — Medium API endpoint (default: https://api.deepseek.com)
//   LLM_MODEL_MEDIUM        — Medium model name (default: deepseek-v4-pro)
//
// Optional env vars (fast provider):
//   OPENAI_API_KEY_FAST   — Fast API key (DeepSeek V4 Flash)
//   OPENAI_BASE_URL_FAST  — Fast API endpoint (default: https://api.deepseek.com)
//   LLM_MODEL_FAST        — Fast model name (default: deepseek-v4-flash)
// ============================================

import OpenAI from 'openai';

// ─── Configuration ───────────────────────────────────────────────────────────

const LLM_CONFIG = {
  model: process.env.LLM_MODEL || 'deepseek-chat',
  temperature: 0.1,
  maxTokens: 65536,
  topP: 0.9,
  // Raised from 180s: GLM-5.2 (Coding Plan) is a slow reasoning model and
  // frequently exceeds the previous 3-minute ceiling, causing spurious timeouts.
  timeout: 600_000,
};

// ─── Provider type ───────────────────────────────────────────────────────────

export type LLMProvider = 'primary' | 'medium' | 'fast';

// ─── Singleton OpenAI clients ────────────────────────────────────────────────

let primaryClient: OpenAI | null = null;
let mediumClient: OpenAI | null = null;
let fastClient: OpenAI | null = null;

function getPrimaryClient(): OpenAI {
  if (!primaryClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not set. Please set it in .env to your API key.',
      );
    }
    primaryClient = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.deepseek.com',
      timeout: LLM_CONFIG.timeout,
    });
    console.log(
      `[LLM] Primary provider: ${primaryClient.baseURL} model=${LLM_CONFIG.model}`,
    );
  }
  return primaryClient;
}

function getMediumClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY_MEDIUM;
  if (!apiKey) return null;
  if (!mediumClient) {
    mediumClient = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL_MEDIUM || 'https://api.deepseek.com',
      timeout: LLM_CONFIG.timeout,
    });
    console.log(
      `[LLM] Medium provider: ${mediumClient.baseURL} model=${process.env.LLM_MODEL_MEDIUM || 'deepseek-v4-pro'}`,
    );
  }
  return mediumClient;
}

function getFastClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY_FAST;
  if (!apiKey) return null;
  if (!fastClient) {
    fastClient = new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL_FAST || 'https://api.deepseek.com',
      timeout: LLM_CONFIG.timeout,
    });
    console.log(
      `[LLM] Fast provider: ${fastClient.baseURL} model=${process.env.LLM_MODEL_FAST || 'deepseek-chat'}`,
    );
  }
  return fastClient;
}

function getClient(provider?: LLMProvider): OpenAI {
  if (provider === 'medium') {
    const medium = getMediumClient();
    if (medium) return medium;
    console.warn('[LLM] Medium provider not configured, falling back to primary');
  }
  if (provider === 'fast') {
    const fast = getFastClient();
    if (fast) return fast;
    console.warn('[LLM] Fast provider not configured, falling back to primary');
  }
  return getPrimaryClient();
}

function getModelForProvider(provider?: LLMProvider): string {
  if (provider === 'medium') {
    return process.env.LLM_MODEL_MEDIUM || 'deepseek-v4-pro';
  }
  if (provider === 'fast') {
    return process.env.LLM_MODEL_FAST || 'deepseek-chat';
  }
  return LLM_CONFIG.model;
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

function isTimeoutError(error: unknown): boolean {
  const err = error as Record<string, unknown>;
  const name = (err.name as string) || '';
  const message = ((err.message as string) || '').toLowerCase();
  // OpenAI SDK throws APIConnectionTimeoutError (or APIConnectionError) on timeouts.
  if (name === 'APIConnectionTimeoutError' || name === 'APITimeoutError') return true;
  if (message.includes('timeout') || message.includes('timed out')) return true;
  return false;
}

/**
 * Basic chat completion.
 */
export async function chatCompletion(
  systemPrompt: string,
  userPrompt: string,
  options: Partial<typeof LLM_CONFIG> = {},
  provider?: LLMProvider,
): Promise<string> {
  const config = { ...LLM_CONFIG, ...options };
  const openai = getClient(provider);
  const model = provider ? getModelForProvider(provider) : config.model;

  try {
    const params: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      top_p: config.topP,
    };
    if (model?.includes('deepseek')) {
      (params as any).thinking = { type: 'disabled' };
    }
    const completion = await openai.chat.completions.create(params as any);

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('LLM returned empty response');
    }
    return content;
  } catch (error: unknown) {
    const err = error as Record<string, unknown>;
    const status = err.status ?? err.statusCode ?? 'unknown';
    const msg = err.message ?? String(error);
    console.error(`[LLM] chatCompletion error (status=${status}): ${typeof msg === 'string' ? msg.substring(0, 500) : String(error).substring(0, 500)}`);
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
  provider?: LLMProvider,
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await chatCompletion(systemPrompt, userPrompt, {}, provider);
    } catch (error: unknown) {
      // Quota/rate-limit errors: do NOT retry, fail immediately
      if (error instanceof QuotaExceededError) {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error('Unknown error');
      // Timeout errors (slow model such as GLM-5.2): retry ONLY ONCE.
      // Retrying a hung call just wastes the per-5h/per-week Coding Plan quota
      // and prolongs the failure; a single retry guards against transient blips.
      if (isTimeoutError(error)) {
        console.warn(`[LLM] Timeout on attempt ${attempt}/${maxRetries}, retrying once (slow model):`, lastError.message);
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        }
        throw error;
      }
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
  provider?: LLMProvider,
): Promise<T> {
  const response = await chatCompletion(systemPrompt, userPrompt, {}, provider);
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
    // Try sanitizing (fix literal newlines/tabs inside JSON strings)
    try {
      return JSON.parse(sanitizeJsonLiterals(trimmed)) as T;
    } catch {
      // fall through
    }
  }

  // Strategy 2: Strip markdown code fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as T;
    } catch {
      try {
        return JSON.parse(sanitizeJsonLiterals(fenceMatch[1].trim())) as T;
      } catch {
        // fall through
      }
    }
  }

  // Strategy 3: Extract first { ... } or [ ... ] via brace matching
  const jsonBlock = extractJsonBlock(trimmed);
  if (jsonBlock) {
    try {
      return JSON.parse(jsonBlock) as T;
    } catch {
      try {
        return JSON.parse(sanitizeJsonLiterals(jsonBlock)) as T;
      } catch {
        // fall through
      }
    }
  }

  // Strategy 4: Extract from first { to end, fix truncated JSON
  const jsonBlockLenient = extractJsonBlockLenient(trimmed);
  if (jsonBlockLenient) {
    try {
      return JSON.parse(jsonBlockLenient) as T;
    } catch {
      // fall through
    }
  }

  console.error('[LLM] Failed to parse JSON. Length:', trimmed.length, 'chars. Last 200 chars:', trimmed.slice(-200));
  console.error('[LLM] Raw response (first 800 chars):', trimmed.substring(0, 800));
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

/**
 * Extract a JSON object from truncated text by finding the first { and attempting to
 * repair common truncation issues: unterminated strings, unescaped newlines in strings,
 * and missing closing braces.
 */
function extractJsonBlockLenient(text: string): string | null {
  const startIdx = text.search(/[\[{]/);
  if (startIdx === -1) return null;

  // Extract from the first bracket/brace to end of text
  const raw = text.substring(startIdx);
  const opener = raw[0];
  const closer = opener === '{' ? '}' : ']';

  // Try to fix common LLM JSON truncation issues:
  let fixed = raw;

  // Fix 1: Remove trailing incomplete string (handles \" inside)
  // Match from last '"'key":' through '"' that may contain escaped quotes
  const lastQuotePattern = /:\s*"((?:[^"\\]|\\.)*)"/g;
  let lastCompleteIdx = -1;
  let m: RegExpExecArray | null;
  while ((m = lastQuotePattern.exec(fixed)) !== null) {
    lastCompleteIdx = m.index + m[0].length;
  }
  // If there's an unclosed string after the last complete key:value, truncate it
  const afterLast = fixed.substring(lastCompleteIdx > 0 ? lastCompleteIdx : 0);
  const unclosedMatch = afterLast.match(/:\s*"/);
  if (unclosedMatch) {
    fixed = fixed.substring(0, lastCompleteIdx > 0 ? lastCompleteIdx : 0) + afterLast.substring(0, unclosedMatch.index) + ': ""';
  }

  // Fix 2: Escape unescaped newlines inside strings
  let inStr = false;
  let escaped = false;
  const chars: string[] = [];
  for (let i = 0; i < fixed.length; i++) {
    const ch = fixed[i];
    if (escaped) { escaped = false; chars.push(ch); continue; }
    if (ch === '\\' && inStr) { escaped = true; chars.push(ch); continue; }
    if (ch === '"' && !escaped) { inStr = !inStr; chars.push(ch); continue; }
    if (inStr && (ch === '\n' || ch === '\r')) {
      chars.push('\\n');
      continue;
    }
    chars.push(ch);
  }
  fixed = chars.join('');

  // Fix 3: Count depth and add missing closing braces/brackets
  let depth = 0;
  inStr = false;
  escaped = false;
  for (let i = 0; i < fixed.length; i++) {
    const ch = fixed[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inStr) { escaped = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{' || ch === '[') depth++;
    if (ch === '}' || ch === ']') depth--;
  }

  // Only attempt to fix if we have unclosed braces (truncated)
  if (depth > 0) {
    for (let i = 0; i < depth; i++) {
      fixed += closer;
    }
  }

  // Fix 4: Ensure proper JSON ending (no trailing comma before last brace)
  fixed = fixed.replace(/,(\s*[}\]])/g, '$1');

  try {
    JSON.parse(fixed);
    return fixed;
  } catch {
    return null;
  }
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
  provider?: LLMProvider,
): Promise<T> {
  const mode = getStructuredOutputMode();
  const config = { ...LLM_CONFIG, ...options };
  const model = provider ? getModelForProvider(provider) : config.model;
  const configWithModel = { ...config, model };

  if (mode === 'tool') {
    try {
      return await getStructuredJSONViaTool<T>(systemPrompt, userPrompt, jsonSchema, configWithModel);
    } catch (error) {
      console.warn('[LLM] Structured output via tool failed, falling back to json_schema:', error instanceof Error ? error.message : error);
    }
  }

  if (mode === 'tool' || mode === 'json_schema') {
    try {
      return await getStructuredJSONViaSchema<T>(systemPrompt, userPrompt, jsonSchema, configWithModel);
    } catch (error) {
      console.warn('[LLM] Structured output via json_schema failed, falling back to markdown:', error instanceof Error ? error.message : error);
    }
  }

  // Final fallback: markdown mode (always works)
  return getJSONResponse<T>(systemPrompt, userPrompt, provider);
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

  const toolParams: Record<string, unknown> = {
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
  };
  // DeepSeek API: thinking is a top-level body parameter (not via extra_body)
  if (config.model?.includes('deepseek')) {
    (toolParams as any).thinking = { type: 'disabled' };
  }
  const completion = await openai.chat.completions.create(toolParams as any);

  const toolCall = completion.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) {
    throw new Error('LLM did not return a tool call');
  }
  const args = 'function' in toolCall ? toolCall.function?.arguments : undefined;
  if (!args) {
    throw new Error('LLM tool call has no function arguments');
  }

  try {
    return JSON.parse(args) as T;
  } catch {
    // GLM 5.2 may return literal newlines in function arguments
    try {
      return JSON.parse(sanitizeJsonLiterals(args)) as T;
    } catch {
      throw new Error('LLM tool call arguments contain unparseable JSON');
    }
  }
}

/**
 * Escape literal control characters inside JSON string values.
 * GLM 5.2 often returns literal newlines/tabs in JSON strings instead of escaping them.
 */
function sanitizeJsonLiterals(json: string): string {
  const chars: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (escaped) {
      escaped = false;
      chars.push(ch);
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      chars.push(ch);
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      chars.push(ch);
      continue;
    }
    if (inString) {
      if (ch === '\n') { chars.push('\\', 'n'); continue; }
      if (ch === '\r') { chars.push('\\', 'r'); continue; }
      if (ch === '\t') { chars.push('\\', 't'); continue; }
    }
    chars.push(ch);
  }
  return chars.join('');
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

  const schemaParams: Record<string, unknown> = {
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
  };
  if (config.model?.includes('deepseek')) {
    (schemaParams as any).thinking = { type: 'disabled' };
  }
  const completion = await openai.chat.completions.create(schemaParams as any);

  const content = completion.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('LLM returned empty response with json_schema mode');
  }

  // The response should be valid JSON per schema, but handle markdown fences
  // in case the API ignores response_format and returns text with fences.
  try {
    return JSON.parse(content) as T;
  } catch {
    try {
      return JSON.parse(sanitizeJsonLiterals(content)) as T;
    } catch {
      // Use our robust parser (handles fences, truncation, etc.)
      return parseJSONFromLLM<T>(content);
    }
  }
}
