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
  // Raised for thinking mode: reasoning tokens take significantly longer to generate.
  // Non-thinking calls finish well before this limit.
  timeout: 3_600_000,
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

/**
 * Determine whether thinking mode should be enabled for this call.
 *
 * Controlled by LLM_THINKING env var:
 *   'enabled' → thinking on for ALL DeepSeek calls (primary + medium)
 *   'auto'    → thinking on for PRIMARY provider only (vulnerability analysis)
 *   'disabled'/unset → thinking off (backward compatible, original behaviour)
 *
 * DeepSeek V4 Pro defaults to thinking=enabled server-side; we explicitly
 * send the parameter to ensure deterministic behaviour.
 */
function shouldEnableThinking(provider?: LLMProvider): boolean {
  const mode = process.env.LLM_THINKING || 'disabled';
  if (mode === 'enabled') return true;
  if (mode === 'auto') return provider === 'primary' || provider === undefined;
  return false;
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
  // HTTP 402 Payment Required, 429 Too Many Requests are always quota errors.
  // 400 is ambiguous: "model not found" may mean quota, but "Thinking mode does
  // not support this tool_choice" is a parameter incompatibility. Check message.
  if (status === 402 || status === 429) return true;
  // DeepSeek/OpenAI quota-specific messages
  if (message.includes('quota') || message.includes('insufficient')) return true;
  if (message.includes('billing') || message.includes('payment')) return true;
  if (message.includes('exceeded') && (message.includes('rate') || message.includes('limit'))) return true;
  // Chinese-language error patterns (GLM coding-plan SDK)
  if (message.includes('模型不存在') || message.includes('余额不足')) return true;
  if (message.includes('配额不足') || message.includes('频率限制')) return true;
  if (message.includes('请求过多') || message.includes('请求过于频繁')) return true;
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
      const enableThinking = shouldEnableThinking(provider);
      (params as any).thinking = { type: enableThinking ? 'enabled' : 'disabled' };
      if (enableThinking) (params as any).reasoning_effort = 'high';
    }
    const completion = await openai.chat.completions.create(params as any);

    const finishReason = completion.choices?.[0]?.finish_reason;
    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('LLM returned empty response');
    }
    if (finishReason === 'length') {
      console.warn(`[LLM] Chat response truncated by max_tokens limit (${config.maxTokens}). Output may be incomplete.`);
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

  // Fix 3: Count depth and add missing closing braces/brackets (stack-based for mixed types)
  const stack: string[] = [];
  inStr = false;
  escaped = false;
  for (let i = 0; i < fixed.length; i++) {
    const ch = fixed[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inStr) { escaped = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{' || ch === '[') stack.push(ch);
    if (ch === '}' || ch === ']') stack.pop();
  }

  if (stack.length > 0) {
    fixed += stack.reverse().map(c => c === '{' ? '}' : ']').join('');
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
 * Get structured JSON from the LLM using model-aware adaptive fallback chains.
 *
 * Fallback chain per model:
 *   DeepSeek:  tool → json_object → markdown
 *   GLM-5.2:   json_schema → tool → markdown
 *   Unknown:   tool → json_schema → markdown
 *
 * Each mode internally cascades: repairJSON → parseJSONFromLLM before throwing upward.
 */
export async function getStructuredJSONResponse<T>(
  systemPrompt: string,
  userPrompt: string,
  jsonSchema: Record<string, unknown>,
  options: Partial<typeof LLM_CONFIG> = {},
  provider?: LLMProvider,
): Promise<T> {
  const config = { ...LLM_CONFIG, ...options };
  // Safety guard: thinking mode needs room for reasoning + JSON output.
  // Override any caller-supplied maxTokens that's too small.
  if (shouldEnableThinking(provider)) {
    config.maxTokens = Math.max(config.maxTokens, 32768);
  }
  const model = provider ? getModelForProvider(provider) : config.model;
  const configWithModel = { ...config, model };
  const modelLower = model?.toLowerCase() || '';
  const isDeepSeek = modelLower.includes('deepseek');
  const isGLM = modelLower.includes('glm');

  if (isDeepSeek) {
    // DS: tool (forced function call, most reliable) → json_object (native DS path) → markdown (final)
    // NOTE: tool_choice: 'required' is incompatible with thinking mode.
    // When thinking is enabled, skip tool mode and start with json_object.
    const enableThinking = shouldEnableThinking(provider);
    if (!enableThinking) {
      try {
        return await getStructuredJSONViaTool<T>(systemPrompt, userPrompt, jsonSchema, configWithModel, provider);
      } catch (error) {
        if (isQuotaError(error)) throw error;
        console.warn('[LLM] DS tool mode failed, falling to json_object:', error instanceof Error ? error.message : error);
      }
    } else {
      console.log('[LLM] Thinking enabled — skipping tool mode (incompatible with tool_choice:required), using json_object');
    }
    try {
      return await getStructuredJSONViaJSONObject<T>(systemPrompt, userPrompt, jsonSchema, configWithModel, provider);
    } catch (error) {
      if (isQuotaError(error)) throw error;
      console.warn('[LLM] DS json_object mode failed, falling to markdown:', error instanceof Error ? error.message : error);
    }
    return getJSONResponse<T>(systemPrompt, userPrompt, provider);
  }

  if (isGLM) {
    // GLM: json_schema (native schema enforcement, most reliable) → tool → markdown
    try {
      return await getStructuredJSONViaSchema<T>(systemPrompt, userPrompt, jsonSchema, configWithModel, provider);
    } catch (error) {
      if (isQuotaError(error)) throw error;
      console.warn('[LLM] GLM json_schema mode failed, falling to tool:', error instanceof Error ? error.message : error);
    }
    try {
      return await getStructuredJSONViaTool<T>(systemPrompt, userPrompt, jsonSchema, configWithModel, provider);
    } catch (error) {
      if (isQuotaError(error)) throw error;
      console.warn('[LLM] GLM tool mode failed, falling to markdown:', error instanceof Error ? error.message : error);
    }
    return getJSONResponse<T>(systemPrompt, userPrompt, provider);
  }

  // Unknown model: original fallback chain (tool → json_schema → markdown)
  try {
    return await getStructuredJSONViaTool<T>(systemPrompt, userPrompt, jsonSchema, configWithModel, provider);
  } catch (error) {
    if (isQuotaError(error)) throw error;
    console.warn('[LLM] Tool mode failed, falling to json_schema:', error instanceof Error ? error.message : error);
  }
  try {
    return await getStructuredJSONViaSchema<T>(systemPrompt, userPrompt, jsonSchema, configWithModel, provider);
  } catch (error) {
    if (isQuotaError(error)) throw error;
    console.warn('[LLM] json_schema mode failed, falling to markdown:', error instanceof Error ? error.message : error);
  }
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
  provider?: LLMProvider,
): Promise<T> {
  const openai = getClient(provider);

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
    tool_choice: 'required',
  };
  // DeepSeek API: thinking is a top-level body parameter (not via extra_body)
  if (config.model?.includes('deepseek')) {
    const enableThinking = shouldEnableThinking(provider);
    (toolParams as any).thinking = { type: enableThinking ? 'enabled' : 'disabled' };
    if (enableThinking) (toolParams as any).reasoning_effort = 'high';
  }
  console.log(`[LLM] Sending structured request via tool mode (model: ${config.model})`);
  const completion = await openai.chat.completions.create(toolParams as any);
  console.log(`[LLM] Response received (finish_reason: ${completion.choices?.[0]?.finish_reason})`);

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
    // Stage 1: repair known JSON issues (trailing commas, missing quotes, truncation, etc.)
    try {
      return JSON.parse(repairJSON(args)) as T;
    } catch {
      // Stage 2: robust 4-strategy parser (fences, brace matching, lenient truncation)
      try {
        return parseJSONFromLLM<T>(args);
      } catch {
        throw new Error('LLM tool call arguments contain unparseable JSON');
      }
    }
  }
}

/**
 * Structured output via OpenAI response_format json_object (DS native path).
 */
async function getStructuredJSONViaJSONObject<T>(
  systemPrompt: string,
  userPrompt: string,
  jsonSchema: Record<string, unknown>,
  config: typeof LLM_CONFIG,
  provider?: LLMProvider,
): Promise<T> {
  const openai = getClient(provider);

  // DS requires the word "json" in the prompt for json_object mode
  const enhancedPrompt = systemPrompt.includes('json')
    ? systemPrompt
    : `${systemPrompt}\n\nYou must return valid JSON.`;

  const shapeHint = `\n\nExpected JSON shape:\n${JSON.stringify(jsonSchema, null, 2)}`;

  const params: Record<string, unknown> = {
    model: config.model,
    messages: [
      { role: 'system', content: enhancedPrompt },
      { role: 'user', content: userPrompt + shapeHint },
    ],
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    top_p: config.topP,
    response_format: { type: 'json_object' } as never,
  };
  if (config.model?.includes('deepseek')) {
    const enableThinking = shouldEnableThinking(provider);
    (params as any).thinking = { type: enableThinking ? 'enabled' : 'disabled' };
    if (enableThinking) (params as any).reasoning_effort = 'high';
  }
  console.log(`[LLM] Sending structured request via json_object mode (model: ${config.model})`);
  const completion = await openai.chat.completions.create(params as any);
  console.log(`[LLM] Response received (finish_reason: ${completion.choices?.[0]?.finish_reason})`);

  const content = completion.choices?.[0]?.message?.content;
  if (!content || content.trim().length === 0) {
    throw new Error('LLM returned empty response with json_object mode');
  }

  try {
    return JSON.parse(content) as T;
  } catch {
    try {
      return JSON.parse(repairJSON(content)) as T;
    } catch {
      return parseJSONFromLLM<T>(content);
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

// ═══════════════════════════════════════════════════════════════════════════════
// JSON Repair — multi-layer heuristic fixer for malformed LLM JSON output
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Repair common JSON formatting issues from LLM outputs.
 * Each layer handles a specific pattern; fails early on valid JSON.
 */
function repairJSON(raw: string): string {
  let s = raw;

  // Layer 1: Escape control characters in strings (existing sanitizeJsonLiterals)
  s = sanitizeJsonLiterals(s);

  // Layer 2: Strip JSON comments (//, /* */, #)
  s = s.replace(/\/\/[^\n\r]*/g, '');
  s = s.replace(/\/\*[\s\S]*?\*\//g, '');
  s = s.replace(/#[^\n\r]*/g, '');

  // Layer 3: Fix trailing commas and double/multiple commas
  s = s.replace(/,(\s*[}\]])/g, '$1');
  s = s.replace(/,{2,}/g, ',');

  // Layer 4: Fix DeepSeek strict mode bug — missing closing quote on key before colon
  // e.g. {"selected: ["A"]} → {"selected": ["A"]}
  s = s.replace(/([,\{])\s*"(\w[\w\d_]*):(\s*[\[{"\d-])/g, '$1 "$2":$3');

  // Layer 5: Unquoted keys (safe after { or ,)
  s = s.replace(/([,\{])\s*(\w[\w\d_]+)\s*:/g, '$1 "$2":');

  // Layer 6: Single quotes → double quotes (only at JSON delimiter positions)
  // Avoids breaking apostrophes inside string values (e.g., "It's a bug")
  s = s.replace(/([:,\[{]\s*)'/g, '$1"');
  s = s.replace(/'(\s*[,:}\]])/g, '"$1');

  // Layer 7: Fix missing closing brackets (truncation)
  s = closeBrackets(s);

  return s;
}

/**
 * Add missing closing brackets to a potentially truncated JSON string.
 */
function closeBrackets(s: string): string {
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (const ch of s) {
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{' || ch === '[') stack.push(ch);
    if (ch === '}' || ch === ']') stack.pop();
  }
  if (stack.length > 0) {
    return s + stack.reverse().map(c => c === '{' ? '}' : ']').join('');
  }
  return s;
}

/**
 * Structured output via OpenAI response_format json_schema.
 */
async function getStructuredJSONViaSchema<T>(
  systemPrompt: string,
  userPrompt: string,
  jsonSchema: Record<string, unknown>,
  config: typeof LLM_CONFIG,
  provider?: LLMProvider,
): Promise<T> {
  const openai = getClient(provider);

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
    const enableThinking = shouldEnableThinking(provider);
    (schemaParams as any).thinking = { type: enableThinking ? 'enabled' : 'disabled' };
    if (enableThinking) (schemaParams as any).reasoning_effort = 'high';
  }
  const completion = await openai.chat.completions.create(schemaParams as any);

  const finishReason = completion.choices?.[0]?.finish_reason;
  const content = completion.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('LLM returned empty response with json_schema mode');
  }
  if (finishReason === 'length') {
    console.warn(`[LLM] json_schema response truncated by max_tokens limit (${config.maxTokens}). Output may be incomplete.`);
  }

  try {
    return JSON.parse(content) as T;
  } catch {
    // Stage 1: repair known LLM JSON issues
    try {
      return JSON.parse(repairJSON(content)) as T;
    } catch {
      // Stage 2: robust 4-strategy parser (fences, brace matching, truncation repair)
      return parseJSONFromLLM<T>(content);
    }
  }
}
