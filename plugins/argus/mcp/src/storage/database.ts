/**
 * Storage layer for ARGUS using SQLite (sql.js - pure JavaScript)
 * Provides fast, reliable persistence for transactions and metadata
 */

import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { v4 as uuidv4 } from 'uuid';
import { Transaction, Hook } from '../types/index.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class Storage {
  private db: Database | null = null;
  private dbPath: string;
  private SQL: SqlJsStatic | null = null;
  private initPromise: Promise<void>;

  constructor(dbPath?: string) {
    const dataDir = dbPath || path.join(process.env.HOME || process.env.USERPROFILE || '.', '.argus');
    fs.mkdirSync(dataDir, { recursive: true });

    this.dbPath = path.join(dataDir, 'argus.db');
    this.initPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    // Initialize sql.js
    this.SQL = await initSqlJs({
      // Locate wasm file relative to this module
      locateFile: (file) => {
        // Try to find the wasm file in node_modules/sql.js/dist
        const wasmPath = path.join(__dirname, '../node_modules/sql.js/dist', file);
        // Fallback to relative path
        return wasmPath;
      }
    });

    // Load existing database or create new one
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(buffer);
    } else {
      this.db = new this.SQL.Database();
    }

    this.initializeSchema();
  }

  private async ensureInitialized(): Promise<void> {
    await this.initPromise;
  }

  private saveToFile(): void {
    if (!this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  private initializeSchema(): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        prompt_raw TEXT NOT NULL,
        prompt_type TEXT NOT NULL,
        context_cwd TEXT,
        context_environment TEXT,
        context_platform TEXT,
        context_tools_available TEXT,
        context_files TEXT,
        result_success INTEGER NOT NULL,
        result_output TEXT,
        result_error TEXT,
        result_duration INTEGER NOT NULL,
        result_tools_used TEXT,
        metadata_tags TEXT,
        metadata_category TEXT,
        metadata_related_hooks TEXT,
        embedding BLOB
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp)
    `);
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_transactions_session_id ON transactions(session_id)
    `);
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(metadata_category)
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS hooks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        version TEXT NOT NULL,
        triggers TEXT NOT NULL,
        rag_query TEXT,
        documentation_summary TEXT,
        documentation_examples TEXT,
        documentation_best_practices TEXT,
        validation_required_context TEXT,
        validation_prohibited_patterns TEXT,
        author_name TEXT,
        author_url TEXT,
        marketplace_downloads INTEGER DEFAULT 0,
        marketplace_rating REAL DEFAULT 0,
        marketplace_updated_at INTEGER NOT NULL,
        embedding BLOB
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_hooks_name ON hooks(name)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_hooks_triggers ON hooks(triggers)`);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS indexed_files (
        path TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        indexed_at INTEGER NOT NULL,
        size INTEGER NOT NULL,
        chunks_count INTEGER DEFAULT 0
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_indexed_files_path ON indexed_files(path)`);

    this.saveToFile();
  }

  /**
   * Store a new transaction
   */
  async storeTransaction(tx: Transaction, embedding?: Float32Array): Promise<boolean> {
    try {
      await this.ensureInitialized();
      if (!this.db) throw new Error('Database not initialized');

      // Helper to convert undefined to null
      const toNull = (value: any): any => value === undefined ? null : value;

      this.db.run(`
        INSERT INTO transactions (
          id, timestamp, session_id,
          prompt_raw, prompt_type,
          context_cwd, context_environment, context_platform, context_tools_available, context_files,
          result_success, result_output, result_error, result_duration, result_tools_used,
          metadata_tags, metadata_category, metadata_related_hooks,
          embedding
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        tx.id,
        tx.timestamp,
        tx.sessionId,
        tx.prompt.raw,
        tx.prompt.type,
        toNull(tx.context.cwd),
        toNull(JSON.stringify(tx.context.environment)),
        toNull(tx.context.platform),
        toNull(JSON.stringify(tx.context.toolsAvailable)),
        toNull(JSON.stringify(tx.context.files)),
        tx.result.success ? 1 : 0,
        toNull(tx.result.output),
        toNull(tx.result.error),
        tx.result.duration || 0,
        toNull(JSON.stringify(tx.result.toolsUsed)),
        toNull(JSON.stringify(tx.metadata.tags)),
        toNull(tx.metadata.category),
        toNull(JSON.stringify(tx.metadata.relatedHooks)),
        embedding ? Buffer.from(embedding.buffer) : null
      ]);

      this.saveToFile();
      return true;
    } catch (error) {
      console.error('Failed to store transaction:', error);
      return false;
    }
  }

  /**
   * Retrieve a transaction by ID
   */
  async getTransaction(id: string): Promise<Transaction | null> {
    await this.ensureInitialized();
    if (!this.db) return null;

    const stmt = this.db.prepare(`SELECT * FROM transactions WHERE id = ?`);
    stmt.bind([id]);
    const result = stmt.getAsObject<any>();

    if (!result || !result.id) return null;
    return this.rowToTransaction(result);
  }

  /**
   * Get transactions by session ID
   */
  async getTransactionsBySession(sessionId: string, limit: number = 100): Promise<Transaction[]> {
    await this.ensureInitialized();
    if (!this.db) return [];

    const stmt = this.db.prepare(`
      SELECT * FROM transactions
      WHERE session_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    stmt.bind([sessionId, limit]);

    const results: Transaction[] = [];
    while (stmt.step()) {
      results.push(this.rowToTransaction(stmt.getAsObject<any>()));
    }
    stmt.free();

    return results;
  }

  /**
   * Get transactions by date range
   */
  async getTransactionsByDateRange(
    start: number,
    end: number,
    limit: number = 100,
    offset: number = 0
  ): Promise<Transaction[]> {
    await this.ensureInitialized();
    if (!this.db) return [];

    const stmt = this.db.prepare(`
      SELECT * FROM transactions
      WHERE timestamp BETWEEN ? AND ?
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `);
    stmt.bind([start, end, limit, offset]);

    const results: Transaction[] = [];
    while (stmt.step()) {
      results.push(this.rowToTransaction(stmt.getAsObject<any>()));
    }
    stmt.free();

    return results;
  }

  /**
   * Get all transactions (for local search index loading)
   */
  async getAllTransactions(limit: number = 10000): Promise<Transaction[]> {
    await this.ensureInitialized();
    if (!this.db) return [];

    const stmt = this.db.prepare(`
      SELECT * FROM transactions
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    stmt.bind([limit]);

    const results: Transaction[] = [];
    while (stmt.step()) {
      results.push(this.rowToTransaction(stmt.getAsObject<any>()));
    }
    stmt.free();

    return results;
  }

  /**
   * Simple text-based search (fallback when RAG is not available)
   */
  async searchTransactions(query: string, limit: number = 10): Promise<Transaction[]> {
    await this.ensureInitialized();
    if (!this.db) return [];

    const pattern = `%${query}%`;
    const stmt = this.db.prepare(`
      SELECT * FROM transactions
      WHERE (
        prompt_raw LIKE ? OR
        result_output LIKE ? OR
        metadata_category LIKE ?
      )
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    stmt.bind([pattern, pattern, pattern, limit]);

    const results: Transaction[] = [];
    while (stmt.step()) {
      results.push(this.rowToTransaction(stmt.getAsObject<any>()));
    }
    stmt.free();

    return results;
  }

  /**
   * Delete a transaction
   */
  async deleteTransaction(id: string): Promise<boolean> {
    try {
      await this.ensureInitialized();
      if (!this.db) throw new Error('Database not initialized');

      this.db.run(`DELETE FROM transactions WHERE id = ?`, [id]);
      this.saveToFile();
      return true;
    } catch (error) {
      console.error('Failed to delete transaction:', error);
      return false;
    }
  }

  /**
   * Store a hook definition
   */
  async storeHook(hook: Hook, embedding?: Float32Array): Promise<boolean> {
    try {
      await this.ensureInitialized();
      if (!this.db) throw new Error('Database not initialized');

      this.db.run(`
        INSERT INTO hooks (
          id, name, description, version, triggers,
          rag_query,
          documentation_summary, documentation_examples, documentation_best_practices,
          validation_required_context, validation_prohibited_patterns,
          author_name, author_url,
          marketplace_downloads, marketplace_rating, marketplace_updated_at,
          embedding
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        hook.id,
        hook.name,
        hook.description,
        hook.version,
        JSON.stringify(hook.triggers),
        hook.ragQuery || null,
        hook.documentation.summary,
        JSON.stringify(hook.documentation.examples || []),
        JSON.stringify(hook.documentation.bestPractices || []),
        JSON.stringify(hook.validation?.requiredContext || []),
        JSON.stringify(hook.validation?.prohibitedPatterns || []),
        hook.author.name,
        hook.author.url || null,
        hook.marketplace.downloads,
        hook.marketplace.rating,
        hook.marketplace.updatedAt,
        embedding ? Buffer.from(embedding.buffer) : null
      ]);

      this.saveToFile();
      return true;
    } catch (error) {
      console.error('Failed to store hook:', error);
      return false;
    }
  }

  /**
   * Get a hook by ID
   */
  async getHook(id: string): Promise<Hook | null> {
    await this.ensureInitialized();
    if (!this.db) return null;

    const stmt = this.db.prepare(`SELECT * FROM hooks WHERE id = ?`);
    stmt.bind([id]);
    const result = stmt.getAsObject<any>();

    if (!result || !result.id) return null;
    return this.rowToHook(result);
  }

  /**
   * Get all hooks
   */
  async getAllHooks(): Promise<Hook[]> {
    await this.ensureInitialized();
    if (!this.db) return [];

    const stmt = this.db.prepare(`SELECT * FROM hooks ORDER BY marketplace_downloads DESC`);

    const results: Hook[] = [];
    while (stmt.step()) {
      results.push(this.rowToHook(stmt.getAsObject<any>()));
    }
    stmt.free();

    return results;
  }

  /**
   * Update a hook
   */
  async updateHook(hook: Hook): Promise<boolean> {
    try {
      await this.ensureInitialized();
      if (!this.db) throw new Error('Database not initialized');

      this.db.run(`
        UPDATE hooks SET
          name = ?, description = ?, version = ?, triggers = ?,
          rag_query = ?,
          documentation_summary = ?, documentation_examples = ?, documentation_best_practices = ?,
          validation_required_context = ?, validation_prohibited_patterns = ?,
          marketplace_downloads = ?, marketplace_rating = ?, marketplace_updated_at = ?
        WHERE id = ?
      `, [
        hook.name,
        hook.description,
        hook.version,
        JSON.stringify(hook.triggers),
        hook.ragQuery || null,
        hook.documentation.summary,
        JSON.stringify(hook.documentation.examples || []),
        JSON.stringify(hook.documentation.bestPractices || []),
        JSON.stringify(hook.validation?.requiredContext || []),
        JSON.stringify(hook.validation?.prohibitedPatterns || []),
        hook.marketplace.downloads,
        hook.marketplace.rating,
        hook.marketplace.updatedAt,
        hook.id
      ]);

      this.saveToFile();
      return true;
    } catch (error) {
      console.error('Failed to update hook:', error);
      return false;
    }
  }

  /**
   * Delete a hook
   */
  async deleteHook(id: string): Promise<boolean> {
    try {
      await this.ensureInitialized();
      if (!this.db) throw new Error('Database not initialized');

      this.db.run(`DELETE FROM hooks WHERE id = ?`, [id]);
      this.saveToFile();
      return true;
    } catch (error) {
      console.error('Failed to delete hook:', error);
      return false;
    }
  }

  /**
   * Store file indexing metadata
   */
  async storeIndexedFile(filePath: string, hash: string, size: number, chunksCount: number): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) return;

    this.db.run(`
      INSERT OR REPLACE INTO indexed_files (path, hash, indexed_at, size, chunks_count)
      VALUES (?, ?, ?, ?, ?)
    `, [filePath, hash, Date.now(), size, chunksCount]);

    this.saveToFile();
  }

  /**
   * Get indexed file metadata
   */
  async getIndexedFile(filePath: string): Promise<{ hash: string; indexedAt: number; size: number; chunksCount: number } | null> {
    await this.ensureInitialized();
    if (!this.db) return null;

    const stmt = this.db.prepare(`SELECT * FROM indexed_files WHERE path = ?`);
    stmt.bind([filePath]);
    const result = stmt.getAsObject<any>();

    if (!result || !result.path) return null;
    return {
      hash: result.hash,
      indexedAt: result.indexed_at,
      size: result.size,
      chunksCount: result.chunks_count
    };
  }

  /**
   * Get statistics summary for the web dashboard
   */
  async getStats(): Promise<{
    transactionCount: number;
    hookCount: number;
    indexedFileCount: number;
    memorySize: number;
    lastIndexTime: number;
  }> {
    await this.ensureInitialized();
    if (!this.db) {
      return {
        transactionCount: 0,
        hookCount: 0,
        indexedFileCount: 0,
        memorySize: 0,
        lastIndexTime: 0
      };
    }

    // Get transaction count
    let transactionCount = 0;
    try {
      const txStmt = this.db.prepare(`SELECT COUNT(*) as count FROM transactions`);
      if (txStmt.step()) {
        transactionCount = txStmt.getAsObject({ count: 0 }).count as number;
      }
      txStmt.free();
    } catch (e) {
      // Ignore error
    }

    // Get hook count
    let hookCount = 0;
    try {
      const hookStmt = this.db.prepare(`SELECT COUNT(*) as count FROM hooks`);
      if (hookStmt.step()) {
        hookCount = hookStmt.getAsObject({ count: 0 }).count as number;
      }
      hookStmt.free();
    } catch (e) {
      // Ignore error
    }

    // Get indexed file count and last index time
    let indexedFileCount = 0;
    let lastIndexTime = 0;
    try {
      const fileStmt = this.db.prepare(`
        SELECT COUNT(*) as count, MAX(indexed_at) as last_indexed
        FROM indexed_files
      `);
      if (fileStmt.step()) {
        const result = fileStmt.getAsObject({ count: 0, last_indexed: 0 });
        indexedFileCount = result.count as number;
        lastIndexTime = result.last_indexed as number || 0;
      }
      fileStmt.free();
    } catch (e) {
      // Ignore error
    }

    // Calculate memory size (database file size)
    let memorySize = 0;
    try {
      const stats = fs.statSync(this.dbPath);
      memorySize = stats.size;
    } catch (e) {
      // Ignore error
    }

    // Write stats to JSON file for web dashboard
    try {
      const statsPath = path.join(path.dirname(this.dbPath), 'stats.json');
      const statsData = {
        transactionCount,
        hookCount,
        indexedFileCount,
        memorySize,
        lastIndexTime,
        lastUpdated: Date.now()
      };
      fs.writeFileSync(statsPath, JSON.stringify(statsData, null, 2));
    } catch (e) {
      console.warn('[ARGUS] Failed to write stats file:', e);
    }

    return {
      transactionCount,
      hookCount,
      indexedFileCount,
      memorySize,
      lastIndexTime
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.saveToFile();
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Convert database row to Transaction object
   */
  private rowToTransaction(row: any): Transaction {
    return {
      id: row.id,
      timestamp: row.timestamp,
      sessionId: row.session_id,
      prompt: {
        raw: row.prompt_raw,
        type: row.prompt_type
      },
      context: {
        cwd: row.context_cwd,
        environment: JSON.parse(row.context_environment || '{}'),
        platform: row.context_platform,
        toolsAvailable: JSON.parse(row.context_tools_available || '[]'),
        files: JSON.parse(row.context_files || '[]')
      },
      result: {
        success: row.result_success === 1,
        output: row.result_output,
        error: row.result_error,
        duration: row.result_duration,
        toolsUsed: JSON.parse(row.result_tools_used || '[]')
      },
      metadata: {
        tags: JSON.parse(row.metadata_tags || '[]'),
        category: row.metadata_category,
        relatedHooks: JSON.parse(row.metadata_related_hooks || '[]')
      }
    };
  }

  /**
   * Convert database row to Hook object
   */
  private rowToHook(row: any): Hook {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      version: row.version,
      triggers: JSON.parse(row.triggers),
      ragQuery: row.rag_query,
      documentation: {
        summary: row.documentation_summary,
        examples: JSON.parse(row.documentation_examples || '[]'),
        bestPractices: JSON.parse(row.documentation_best_practices || '[]')
      },
      validation: row.validation_required_context ? {
        requiredContext: JSON.parse(row.validation_required_context),
        prohibitedPatterns: JSON.parse(row.validation_prohibited_patterns || '[]')
      } : undefined,
      author: {
        name: row.author_name,
        url: row.author_url
      },
      marketplace: {
        downloads: row.marketplace_downloads,
        rating: row.marketplace_rating,
        updatedAt: row.marketplace_updated_at
      }
    };
  }
}

let storageInstance: Storage | null = null;

/**
 * Get or create singleton storage instance
 */
export function getStorage(dbPath?: string): Storage {
  if (!storageInstance) {
    storageInstance = new Storage(dbPath);
  }
  return storageInstance;
}
