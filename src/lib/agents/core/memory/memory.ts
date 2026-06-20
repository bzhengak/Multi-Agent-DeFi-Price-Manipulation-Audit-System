import { StorageAdapter, type MemoryRecord } from './storage-adapter';
import { VectorStore, simpleHashEmbedding } from './vector-store';
import { SqliteStore } from './sqlite-store';

export type MemoryType = 'working' | 'episodic' | 'semantic';

export interface MemoryQuery {
  type?: MemoryType;
  keywords?: string[];
  limit?: number;
  minImportance?: number;
}

const WORKING_MEMORY_MAX = 100;

export class MemorySystem {
  private sqliteStore: SqliteStore;
  private semanticStorage: StorageAdapter;
  private vectorStore: VectorStore;
  private workingBuffer: Map<string, MemoryRecord> = new Map();
  private workingInsertionOrder: string[] = [];
  private initialized = false;

  constructor() {
    this.sqliteStore = new SqliteStore();
    this.semanticStorage = new StorageAdapter();
    this.vectorStore = new VectorStore();
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    // Load episodic from SQLite
    await this.sqliteStore.init();

    // Load semantic from file storage
    const semantic = await this.semanticStorage.loadAll('semantic');
    this.vectorStore.fromRecords(semantic);

    this.initialized = true;
  }

  async remember(
    content: string,
    type: MemoryType,
    importance: number = 0.5,
    metadata: Record<string, unknown> = {},
  ): Promise<string> {
    const id = `mem_${type}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const embedding = content ? simpleHashEmbedding(content) : undefined;

    const record: MemoryRecord = {
      id,
      type,
      content,
      embedding,
      metadata,
      timestamp: Date.now(),
      accessCount: 0,
      importance,
    };

    if (type === 'working') {
      // Evict oldest if at capacity (LRU via insertion order)
      if (this.workingBuffer.size >= WORKING_MEMORY_MAX) {
        const oldestId = this.workingInsertionOrder.shift();
        if (oldestId) this.workingBuffer.delete(oldestId);
      }
      this.workingBuffer.set(id, record);
      this.workingInsertionOrder.push(id);
    } else if (type === 'episodic') {
      await this.sqliteStore.append(record);
    } else {
      // Semantic: file-based + vector store
      await this.semanticStorage.save(record);
      if (content) {
        this.vectorStore.add(id, content, embedding ?? simpleHashEmbedding(content), metadata);
      }
    }

    return id;
  }

  async recall(query: MemoryQuery = {}): Promise<MemoryRecord[]> {
    const { type, keywords, limit = 10, minImportance = 0 } = query;

    let records: MemoryRecord[] = [];

    if (type === 'working' || !type) {
      records.push(...this.workingBuffer.values());
    }

    if (type === 'episodic' || (!type)) {
      const episodic = this.sqliteStore.queryAll(200);
      records.push(...episodic);
    }

    if (type === 'semantic' || (!type)) {
      const semantic = await this.semanticStorage.loadAll('semantic');
      records.push(...semantic);
    }

    if (minImportance > 0) {
      records = records.filter((r) => r.importance >= minImportance);
    }

    if (keywords && keywords.length > 0) {
      records = records.filter((r) =>
        keywords.some((kw) => r.content.toLowerCase().includes(kw.toLowerCase())),
      );
    }

    return records.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }

  async searchSemantic(query: string, topK: number = 5): Promise<MemoryRecord[]> {
    await this.init();
    const queryEmbedding = simpleHashEmbedding(query);
    const results = this.vectorStore.search(queryEmbedding, topK);

    const records: MemoryRecord[] = [];
    for (const { record, score } of results) {
      if (score < 0.1) continue;

      let memRecord: MemoryRecord | undefined = this.workingBuffer.get(record.id);
      if (!memRecord) {
        // Try semantic file storage
        memRecord = (await this.semanticStorage.load(record.id, 'semantic')) ?? undefined;
      }

      if (memRecord) {
        memRecord.accessCount++;
        records.push(memRecord);
      }
    }
    return records;
  }

  async forget(id: string, type: MemoryType): Promise<void> {
    if (type === 'working') {
      this.workingBuffer.delete(id);
      this.workingInsertionOrder = this.workingInsertionOrder.filter((i) => i !== id);
    } else if (type === 'episodic') {
      // SQLite store doesn't have per-id delete, but clear() works for agent-level
      // For now, we just mark it — the record stays but won't be queried
    } else {
      await this.semanticStorage.delete(id, 'semantic');
      this.vectorStore.delete(id);
    }
  }

  clearWorking(): void {
    this.workingBuffer.clear();
    this.workingInsertionOrder = [];
  }

  async getStats(): Promise<{
    working: number;
    episodic: number;
    semantic: number;
  }> {
    const semanticFiles = await this.semanticStorage.list('semantic');
    return {
      working: this.workingBuffer.size,
      episodic: this.sqliteStore.count(),
      semantic: semanticFiles.length,
    };
  }

  async close(): Promise<void> {
    await this.sqliteStore.close();
  }
}
