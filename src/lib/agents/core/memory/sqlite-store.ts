import initSqlJs, { type Database } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';
import type { MemoryRecord } from './storage-adapter';

const STORAGE_DIR = path.join(process.cwd(), '.storage');
const DEFAULT_DB_PATH = path.join(STORAGE_DIR, 'memory.sqlite');

export interface SqliteStoreOptions {
  dbPath?: string;
}

export class SqliteStore {
  private db: Database | null = null;
  private dbPath: string;
  private saveTimer: ReturnType<typeof setInterval> | null = null;
  private dirty = false;

  constructor(options: SqliteStoreOptions = {}) {
    this.dbPath = options.dbPath ?? DEFAULT_DB_PATH;
  }

  async init(): Promise<void> {
    if (this.db) return;

    const wasmFile = path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
    if (!fs.existsSync(wasmFile)) {
      console.warn(`[SQLite] WASM file not found at ${wasmFile}, trying alternative resolution`);
    }
    const SQL = await initSqlJs({
      locateFile: (file: string) => {
        const cwdPath = path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file);
        if (fs.existsSync(cwdPath)) return cwdPath;
        return file;
      },
    });

    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Load existing DB or create new
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }

    // Create table if not exists
    this.db.run(`
      CREATE TABLE IF NOT EXISTS episodic (
        id TEXT PRIMARY KEY,
        agent_id TEXT,
        session_id TEXT,
        ts INTEGER,
        kind TEXT,
        content TEXT,
        embedding TEXT,
        metadata TEXT,
        access_count INTEGER DEFAULT 0,
        importance REAL DEFAULT 0.5
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_episodic_agent_ts
      ON episodic(agent_id, ts)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_episodic_kind
      ON episodic(kind)
    `);

    // Periodic save (every 5 seconds if dirty)
    this.saveTimer = setInterval(() => {
      if (this.dirty) {
        this.persist().catch(() => {});
      }
    }, 5000);
  }

  async append(record: MemoryRecord): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('SQLite store not initialized');

    this.db.run(
      `INSERT OR REPLACE INTO episodic
       (id, agent_id, session_id, ts, kind, content, embedding, metadata, access_count, importance)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        (record.metadata?.agentId as string) ?? '',
        (record.metadata?.sessionId as string) ?? '',
        record.timestamp,
        record.type,
        record.content,
        record.embedding ? JSON.stringify(record.embedding) : null,
        JSON.stringify(record.metadata),
        record.accessCount,
        record.importance,
      ],
    );

    this.dirty = true;
  }

  query(agentId: string, sinceTs: number = 0): MemoryRecord[] {
    if (!this.db) return [];

    const stmt = this.db.prepare(
      `SELECT * FROM episodic
       WHERE agent_id = ? AND ts >= ?
       ORDER BY ts DESC`,
    );
    stmt.bind([agentId, sinceTs]);

    const records: MemoryRecord[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      records.push({
        id: row.id as string,
        type: 'episodic',
        content: row.content as string,
        embedding: row.embedding ? JSON.parse(row.embedding as string) : undefined,
        metadata: row.metadata ? JSON.parse(row.metadata as string) : {},
        timestamp: row.ts as number,
        accessCount: row.access_count as number,
        importance: row.importance as number,
      });
    }
    stmt.free();
    return records;
  }

  queryAll(limit: number = 100): MemoryRecord[] {
    if (!this.db) return [];

    const stmt = this.db.prepare(
      `SELECT * FROM episodic ORDER BY ts DESC LIMIT ?`,
    );
    stmt.bind([limit]);

    const records: MemoryRecord[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      records.push({
        id: row.id as string,
        type: 'episodic',
        content: row.content as string,
        embedding: row.embedding ? JSON.parse(row.embedding as string) : undefined,
        metadata: row.metadata ? JSON.parse(row.metadata as string) : {},
        timestamp: row.ts as number,
        accessCount: row.access_count as number,
        importance: row.importance as number,
      });
    }
    stmt.free();
    return records;
  }

  queryByKind(kind: string, limit: number = 50): MemoryRecord[] {
    if (!this.db) return [];

    const stmt = this.db.prepare(
      `SELECT * FROM episodic WHERE kind = ? ORDER BY ts DESC LIMIT ?`,
    );
    stmt.bind([kind, limit]);

    const records: MemoryRecord[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      records.push({
        id: row.id as string,
        type: 'episodic',
        content: row.content as string,
        embedding: row.embedding ? JSON.parse(row.embedding as string) : undefined,
        metadata: row.metadata ? JSON.parse(row.metadata as string) : {},
        timestamp: row.ts as number,
        accessCount: row.access_count as number,
        importance: row.importance as number,
      });
    }
    stmt.free();
    return records;
  }

  updateAccessCount(id: string): void {
    if (!this.db) return;
    this.db.run(
      `UPDATE episodic SET access_count = access_count + 1 WHERE id = ?`,
      [id],
    );
    this.dirty = true;
  }

  clear(agentId: string): void {
    if (!this.db) return;
    this.db.run(`DELETE FROM episodic WHERE agent_id = ?`, [agentId]);
    this.dirty = true;
  }

  count(): number {
    if (!this.db) return 0;
    const result = this.db.exec(`SELECT COUNT(*) as cnt FROM episodic`);
    return result[0]?.values[0]?.[0] as number ?? 0;
  }

  async persist(): Promise<void> {
    if (!this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
    this.dirty = false;
  }

  async close(): Promise<void> {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
    await this.persist();
    this.db?.close();
    this.db = null;
  }
}
