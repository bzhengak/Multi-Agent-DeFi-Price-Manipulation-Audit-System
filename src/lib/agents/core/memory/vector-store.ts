import type { MemoryRecord } from './storage-adapter';

interface VectorEntry {
  id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
}

export class VectorStore {
  private entries: Map<string, VectorEntry> = new Map();

  add(id: string, content: string, embedding: number[], metadata: Record<string, unknown> = {}): void {
    this.entries.set(id, { id, content, embedding, metadata });
  }

  search(queryEmbedding: number[], topK: number = 5): Array<{ record: VectorEntry; score: number }> {
    const results: Array<{ record: VectorEntry; score: number }> = [];

    for (const entry of this.entries.values()) {
      const score = cosineSimilarity(queryEmbedding, entry.embedding);
      results.push({ record: entry, score });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  get(id: string): VectorEntry | undefined {
    return this.entries.get(id);
  }

  delete(id: string): boolean {
    return this.entries.delete(id);
  }

  size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  fromRecords(records: MemoryRecord[]): void {
    for (const record of records) {
      if (record.content) {
        const embedding = simpleHashEmbedding(record.content);
        this.add(record.id, record.content, embedding, record.metadata);
      }
    }
  }
}

export function simpleHashEmbedding(text: string, dimensions: number = 64): number[] {
  const embedding = new Array(dimensions).fill(0);
  const words = text.toLowerCase().split(/\s+/);
  for (const word of words) {
    for (let i = 0; i < word.length; i++) {
      const idx = (word.charCodeAt(i) + i) % dimensions;
      embedding[idx] += 1 / (i + 1);
    }
  }
  const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
  if (norm === 0) return embedding;
  return embedding.map((v) => v / norm);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
