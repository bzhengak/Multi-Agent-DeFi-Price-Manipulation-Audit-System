import { saveJSON, loadJSON, listFiles } from '@/lib/storage/blob';

export interface MemoryRecord {
  id: string;
  type: 'working' | 'episodic' | 'semantic';
  content: string;
  metadata: Record<string, unknown>;
  timestamp: number;
  accessCount: number;
  importance: number;
}

const MEMORY_DIRS: Record<MemoryRecord['type'], string> = {
  working: 'memory/working/',
  episodic: 'memory/episodic/',
  semantic: 'memory/semantic/',
};

export class StorageAdapter {
  async save(record: MemoryRecord): Promise<void> {
    const dir = MEMORY_DIRS[record.type];
    await saveJSON(`${dir}${record.id}.json`, record);
  }

  async load(id: string, type: MemoryRecord['type']): Promise<MemoryRecord | null> {
    const dir = MEMORY_DIRS[type];
    return loadJSON<MemoryRecord>(`${dir}${id}.json`);
  }

  async list(type: MemoryRecord['type']): Promise<string[]> {
    const dir = MEMORY_DIRS[type];
    const files = await listFiles(dir);
    return files.filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));
  }

  async loadAll(type: MemoryRecord['type']): Promise<MemoryRecord[]> {
    const ids = await this.list(type);
    const records: MemoryRecord[] = [];
    for (const id of ids) {
      const record = await this.load(id, type);
      if (record) records.push(record);
    }
    return records.sort((a, b) => b.timestamp - a.timestamp);
  }

  async delete(id: string, type: MemoryRecord['type']): Promise<void> {
    const { deleteFile } = await import('@/lib/storage/blob');
    const dir = MEMORY_DIRS[type];
    await deleteFile(`${dir}${id}.json`);
  }
}
