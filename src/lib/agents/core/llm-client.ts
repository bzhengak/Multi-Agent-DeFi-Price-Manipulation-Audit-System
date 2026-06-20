import { chatCompletion, chatWithRetry, getJSONResponse, getStructuredJSONResponse, getStructuredOutputMode, getLLMMode } from '@/lib/llm';

export interface LLMCallOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  maxRetries?: number;
}

export class LLMClient {
  private defaultOptions: LLMCallOptions;

  constructor(options: LLMCallOptions = {}) {
    this.defaultOptions = {
      temperature: 0.1,
      maxTokens: 8192,
      topP: 0.9,
      maxRetries: 3,
      ...options,
    };
  }

  async chat(systemPrompt: string, userPrompt: string, options: LLMCallOptions = {}): Promise<string> {
    const merged = { ...this.defaultOptions, ...options };
    const llmOptions: Record<string, unknown> = {};
    if (merged.model) llmOptions.model = merged.model;
    if (merged.temperature !== undefined) llmOptions.temperature = merged.temperature;
    if (merged.maxTokens !== undefined) llmOptions.maxTokens = merged.maxTokens;
    if (merged.topP !== undefined) llmOptions.topP = merged.topP;

    const retries = merged.maxRetries ?? 3;
    if (retries > 1) {
      return chatWithRetry(systemPrompt, userPrompt, retries);
    }
    return chatCompletion(systemPrompt, userPrompt, llmOptions);
  }

  async getJSON<T>(systemPrompt: string, userPrompt: string): Promise<T> {
    return getJSONResponse<T>(systemPrompt, userPrompt);
  }

  /**
   * Get structured JSON from the LLM using function calling or json_schema format.
   * Mode is controlled by LLM_OUTPUT_MODE env var: 'tool' | 'json_schema' | 'markdown'.
   * Falls back to markdown (fence stripping) on failure.
   */
  async getStructuredJSON<T>(
    systemPrompt: string,
    userPrompt: string,
    jsonSchema: Record<string, unknown>,
    options: LLMCallOptions = {},
  ): Promise<T> {
    const merged = { ...this.defaultOptions, ...options };
    const llmOptions: Record<string, unknown> = {};
    if (merged.model) llmOptions.model = merged.model;
    if (merged.temperature !== undefined) llmOptions.temperature = merged.temperature;
    if (merged.maxTokens !== undefined) llmOptions.maxTokens = merged.maxTokens;
    if (merged.topP !== undefined) llmOptions.topP = merged.topP;

    return getStructuredJSONResponse<T>(systemPrompt, userPrompt, jsonSchema, llmOptions);
  }

  getStructuredMode(): 'tool' | 'json_schema' | 'markdown' {
    return getStructuredOutputMode();
  }

  getMode(): 'zai' | 'openai' {
    return getLLMMode();
  }
}
