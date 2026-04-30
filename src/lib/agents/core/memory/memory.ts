import { StorageAdapter, type MemoryRecord } from './storage-adapter';
import { VectorStore, simpleHashEmbedding } from './vector-store';

export type MemoryType = 'working' | 'episodic' | 'semantic';

export interface MemoryQuery {
  type?: MemoryType;
  keywords?: string[];
  limit?: number;
  minImportance?: number;
}

export class MemorySystem {
  private storage: StorageAdapter;
  private vectorStore: VectorStore;
  private workingBuffer: Map<string, MemoryRecord> = new Map();
  private initialized = false;

  constructor() {
    this.storage = new StorageAdapter();
    this.vectorStore = new VectorStore();
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    const episodic = await this.storage.loadAll('episodic');
    this.vectorStore.fromRecords(episodic);
    const semantic = await this.storage.loadAll('semantic');
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
    const record: MemoryRecord = {
      id,
      type,
      content,
      metadata,
      timestamp: Date.now(),
      accessCount: 0,
      importance,
    };

    if (type === 'working') {
      this.workingBuffer.set(id, record);
    } else {
      await this.storage.save(record);
      if (content) {
        this.vectorStore.add(id, content, simpleHashEmbedding(content), metadata);
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

    if (type && type !== 'working') {
      const stored = await this.storage.loadAll(type);
      records.push(...stored);
    } else if (!type) {
      const episodic = await this.storage.loadAll('episodic');
      const semantic = await this.storage.loadAll('semantic');
      records.push(...episodic, ...semantic);
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
        memRecord = (await this.storage.load(record.id, 'episodic'))
          ?? (await this.storage.load(record.id, 'semantic'))
          ?? undefined;
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
    } else {
      await this.storage.delete(id, type);
      this.vectorStore.delete(id);
    }
  }

  clearWorking(): void {
    this.workingBuffer.clear();
  }

  async getStats(): Promise<{
    working: number;
    episodic: number;
    semantic: number;
  }> {
    const episodicFiles = await this.storage.list('episodic');
    const semanticFiles = await this.storage.list('semantic');
    return {
      working: this.workingBuffer.size,
      episodic: episodicFiles.length,
      semantic: semanticFiles.length,
    };
  }
}
