import type {
  AgentConfig,
  AgentState,
  AgentResult,
  Observation,
  Thought,
  Action,
  Result,
} from './types';
import { ToolRegistry } from './tools/registry';
import { MemorySystem } from './memory/memory';
import { LLMClient } from './llm-client';

export abstract class BaseAgent {
  protected config: AgentConfig;
  protected state: AgentState;
  protected tools: ToolRegistry;
  protected memory: MemorySystem;
  protected llm: LLMClient;

  constructor(config: AgentConfig) {
    this.config = config;
    this.tools = new ToolRegistry();
    this.memory = new MemorySystem();
    this.llm = new LLMClient();
    this.state = {
      id: `agent_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      iteration: 0,
      status: 'idle',
      observations: [],
      thoughts: [],
      actions: [],
      results: [],
      metadata: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  abstract observe(): Promise<Observation>;
  abstract think(observation: Observation): Promise<Thought>;
  abstract act(thought: Thought): Promise<Result>;
  abstract update(result: Result): Promise<void>;
  abstract compileResult(): AgentResult;

  protected shouldTerminate(result: Result): boolean {
    if (this.state.iteration >= this.config.maxIterations) return true;
    if (result.action.type === 'finalize' && result.success) return true;
    return false;
  }

  async run(): Promise<AgentResult> {
    const startTime = Date.now();
    this.state.status = 'running';
    this.state.updatedAt = Date.now();

    try {
      while (this.state.iteration < this.config.maxIterations) {
        this.state.iteration++;
        this.state.updatedAt = Date.now();

        const observation = await this.observe();
        this.state.observations.push(observation);

        const thought = await this.think(observation);
        this.state.thoughts.push(thought);

        const result = await this.act(thought);
        this.state.results.push(result);

        await this.update(result);

        if (this.shouldTerminate(result)) break;
      }

      this.state.status = 'completed';
      this.state.updatedAt = Date.now();

      const agentResult = this.compileResult();
      agentResult.duration = Date.now() - startTime;
      agentResult.iterations = this.state.iteration;
      return agentResult;
    } catch (error: unknown) {
      this.state.status = 'error';
      this.state.updatedAt = Date.now();

      const agentResult = this.compileResult();
      agentResult.status = 'error';
      agentResult.duration = Date.now() - startTime;
      agentResult.iterations = this.state.iteration;
      agentResult.data = {
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      return agentResult;
    } finally {
      this.memory.clearWorking();
    }
  }

  getState(): AgentState {
    return { ...this.state };
  }

  getConfig(): AgentConfig {
    return { ...this.config };
  }
}
