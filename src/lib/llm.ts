// ============================================
// LLM Module - Dual Mode (Z.ai + OpenAI)
// ============================================
// This module supports two modes:
// 1. Z.ai mode: Uses z-ai-web-dev-sdk (default on Z.ai platform)
// 2. OpenAI mode: Uses OpenAI-compatible API (for external deployment)
//
// Mode selection is automatic:
// - If OPENAI_API_KEY is set → OpenAI mode
// - Otherwise → Z.ai mode (only works on Z.ai platform)
// ============================================

// LLM configuration
const LLM_CONFIG = {
  model: process.env.LLM_MODEL || 'qwen3.5-plus',
  temperature: 0.1,
  maxTokens: 8192,
  topP: 0.9,
  timeout: 120000, // 2 minutes
};

// Detect which mode to use
const isOpenAIMode = !!process.env.OPENAI_API_KEY;

console.log(`[LLM] Mode: ${isOpenAIMode ? 'OpenAI-compatible' : 'Z.ai SDK'}`);

// ---- Z.ai SDK Mode ----
let zaiInstance: Awaited<ReturnType<typeof import('z-ai-web-dev-sdk').default.create>> | null = null;

async function getZAIInstance() {
  if (!zaiInstance) {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

// ---- OpenAI Mode ----
let openaiInstance: InstanceType<typeof import('openai').default> | null = null;

async function getOpenAIInstance() {
  if (!openaiInstance) {
    const { default: OpenAI } = await import('openai');
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined, // Support custom endpoints
    });
  }
  return openaiInstance;
}

/**
 * Basic chat completion.
 * Automatically uses Z.ai SDK or OpenAI API based on environment.
 */
export async function chatCompletion(
  systemPrompt: string,
  userPrompt: string,
  options: Partial<typeof LLM_CONFIG> = {}
): Promise<string> {
  const config = { ...LLM_CONFIG, ...options };

  if (isOpenAIMode) {
    return chatCompletionOpenAI(systemPrompt, userPrompt, config);
  } else {
    return chatCompletionZAI(systemPrompt, userPrompt);
  }
}

async function chatCompletionOpenAI(
  systemPrompt: string,
  userPrompt: string,
  config: typeof LLM_CONFIG
): Promise<string> {
  const openai = await getOpenAIInstance();

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
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[LLM] OpenAI call failed:', message);
    throw new Error(`LLM call failed: ${message}`);
  }
}

async function chatCompletionZAI(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const zai = await getZAIInstance();

  try {
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      thinking: { type: 'disabled' },
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('LLM returned empty response');
    }
    return content;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[LLM] Z.ai SDK call failed:', message);
    throw new Error(`LLM call failed: ${message}`);
  }
}

/**
 * Chat completion with exponential backoff retry logic.
 */
export async function chatWithRetry(
  systemPrompt: string,
  userPrompt: string,
  maxRetries: number = 3
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await chatCompletion(systemPrompt, userPrompt);
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      console.warn(`[LLM] Attempt ${attempt} failed:`, lastError.message);

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
 */
export async function getJSONResponse<T>(
  systemPrompt: string,
  userPrompt: string
): Promise<T> {
  const response = await chatCompletion(systemPrompt, userPrompt);

  // Try to extract JSON from markdown code blocks (```json ... ```)
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
  const jsonStr = jsonMatch ? jsonMatch[1] : response;

  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    console.error('[LLM] Failed to parse JSON. Raw response:', response);
    throw new Error('LLM did not return valid JSON format');
  }
}

/**
 * Check which LLM mode is currently active.
 */
export function getLLMMode(): 'zai' | 'openai' {
  return isOpenAIMode ? 'openai' : 'zai';
}
