/**
 * Storage layer for ARGUS using SQLite
 * Provides fast, reliable persistence for transactions and metadata
 */

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { Transaction, Hook } from '../types/index.js';
import path from 'path';
import fs from 'fs';

export class Storage {
  private db: Database.Database;
  private stmt!: {
    insertTransaction: Database.Statement;
    getTransaction: Database.Statement;
    getTransactionsBySession: Database.Statement;
    getTransactionsByDateRange: Database.Statement;
    searchTransactions: Database.Statement;
    deleteTransaction: Database.Statement;
    insertHook: Database.Statement;
    getHook: Database.Statement;
    getAllHooks: Database.Statement;
    updateHook: Database.Statement;
    deleteHook: Database.Statement;
  };

  constructor(dbPath?: string) {
    const dataDir = dbPath || path.join(process.env.HOME || process.env.USERPROFILE || '.', '.argus');
    fs.mkdirSync(dataDir, { recursive: true });

    const dbPathFull = path.join(dataDir, 'argus.db');
    this.db = new Database(dbPathFull);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');

    this.initializeSchema();
    this.prepareStatements();
  }

  private initializeSchema(): void {
    this.db.exec(`
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
      );

      CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp);
      CREATE INDEX IF NOT EXISTS idx_transactions_session_id ON transactions(session_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(metadata_category);

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
      );

      CREATE INDEX IF NOT EXISTS idx_hooks_name ON hooks(name);
      CREATE INDEX IF NOT EXISTS idx_hooks_triggers ON hooks(triggers);

      CREATE TABLE IF NOT EXISTS indexed_files (
        path TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        indexed_at INTEGER NOT NULL,
        size INTEGER NOT NULL,
        chunks_count INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_indexed_files_path ON indexed_files(path);
    `);
  }

  private prepareStatements(): void {
    this.stmt = {
      insertTransaction: this.db.prepare(`
        INSERT INTO transactions (
          id, timestamp, session_id,
          prompt_raw, prompt_type,
          context_cwd, context_environment, context_platform, context_tools_available, context_files,
          result_success, result_output, result_error, result_duration, result_tools_used,
          metadata_tags, metadata_category, metadata_related_hooks,
          embedding
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),

      getTransaction: this.db.prepare(`
        SELECT * FROM transactions WHERE id = ?
      `),

      getTransactionsBySession: this.db.prepare(`
        SELECT * FROM transactions
        WHERE session_id = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `),

      getTransactionsByDateRange: this.db.prepare(`
        SELECT * FROM transactions
        WHERE timestamp BETWEEN ? AND ?
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `),

      searchTransactions: this.db.prepare(`
        SELECT * FROM transactions
        WHERE (
          prompt_raw LIKE ? OR
          result_output LIKE ? OR
          metadata_category LIKE ?
        )
        ORDER BY timestamp DESC
        LIMIT ?
      `),

      deleteTransaction: this.db.prepare(`
        DELETE FROM transactions WHERE id = ?
      `),

      insertHook: this.db.prepare(`
        INSERT INTO hooks (
          id, name, description, version, triggers,
          rag_query,
          documentation_summary, documentation_examples, documentation_best_practices,
          validation_required_context, validation_prohibited_patterns,
          author_name, author_url,
          marketplace_downloads, marketplace_rating, marketplace_updated_at,
          embedding
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),

      getHook: this.db.prepare(`
        SELECT * FROM hooks WHERE id = ?
      `),

      getAllHooks: this.db.prepare(`
        SELECT * FROM hooks ORDER BY marketplace_downloads DESC
      `),

      updateHook: this.db.prepare(`
        UPDATE hooks SET
          name = ?, description = ?, version = ?, triggers = ?,
          rag_query = ?,
          documentation_summary = ?, documentation_examples = ?, documentation_best_practices = ?,
          validation_required_context = ?, validation_prohibited_patterns = ?,
          marketplace_downloads = ?, marketplace_rating = ?, marketplace_updated_at = ?
        WHERE id = ?
      `),

      deleteHook: this.db.prepare(`
        DELETE FROM hooks WHERE id = ?
      `)
    };
  }

  /**
   * Store a new transaction
   */
  storeTransaction(tx: Transaction, embedding?: Float32Array): boolean {
    try {
      this.stmt.insertTransaction.run(
        tx.id,
        tx.timestamp,
        tx.sessionId,
        tx.prompt.raw,
        tx.prompt.type,
        tx.context.cwd,
        JSON.stringify(tx.context.environment),
        tx.context.platform,
        JSON.stringify(tx.context.toolsAvailable),
        JSON.stringify(tx.context.files),
        tx.result.success ? 1 : 0,
        tx.result.output,
        tx.result.error,
        tx.result.duration,
        JSON.stringify(tx.result.toolsUsed),
        JSON.stringify(tx.metadata.tags),
        tx.metadata.category || null,
        JSON.stringify(tx.metadata.relatedHooks),
        embedding ? Buffer.from(embedding.buffer) : null
      );
      return true;
    } catch (error) {
      console.error('Failed to store transaction:', error);
      return false;
    }
  }

  /**
   * Retrieve a transaction by ID
   */
  getTransaction(id: string): Transaction | null {
    const row = this.stmt.getTransaction.get(id) as any;
    if (!row) return null;
    return this.rowToTransaction(row);
  }

  /**
   * Get transactions by session ID
   */
  getTransactionsBySession(sessionId: string, limit: number = 100): Transaction[] {
    const rows = this.stmt.getTransactionsBySession.all(sessionId, limit) as any[];
    return rows.map(row => this.rowToTransaction(row));
  }

  /**
   * Get transactions by date range
   */
  getTransactionsByDateRange(
    start: number,
    end: number,
    limit: number = 100,
    offset: number = 0
  ): Transaction[] {
    const rows = this.stmt.getTransactionsByDateRange.all(start, end, limit, offset) as any[];
    return rows.map(row => this.rowToTransaction(row));
  }

  /**
   * Simple text-based search (fallback when RAG is not available)
   */
  searchTransactions(query: string, limit: number = 10): Transaction[] {
    const pattern = `%${query}%`;
    const rows = this.stmt.searchTransactions.all(pattern, pattern, pattern, limit) as any[];
    return rows.map(row => this.rowToTransaction(row));
  }

  /**
   * Delete a transaction
   */
  deleteTransaction(id: string): boolean {
    try {
      this.stmt.deleteTransaction.run(id);
      return true;
    } catch (error) {
      console.error('Failed to delete transaction:', error);
      return false;
    }
  }

  /**
   * Store a hook definition
   */
  storeHook(hook: Hook, embedding?: Float32Array): boolean {
    try {
      this.stmt.insertHook.run(
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
      );
      return true;
    } catch (error) {
      console.error('Failed to store hook:', error);
      return false;
    }
  }

  /**
   * Get a hook by ID
   */
  getHook(id: string): Hook | null {
    const row = this.stmt.getHook.get(id) as any;
    if (!row) return null;
    return this.rowToHook(row);
  }

  /**
   * Get all hooks
   */
  getAllHooks(): Hook[] {
    const rows = this.stmt.getAllHooks.all() as any[];
    return rows.map(row => this.rowToHook(row));
  }

  /**
   * Update a hook
   */
  updateHook(hook: Hook): boolean {
    try {
      this.stmt.updateHook.run(
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
      );
      return true;
    } catch (error) {
      console.error('Failed to update hook:', error);
      return false;
    }
  }

  /**
   * Delete a hook
   */
  deleteHook(id: string): boolean {
    try {
      this.stmt.deleteHook.run(id);
      return true;
    } catch (error) {
      console.error('Failed to delete hook:', error);
      return false;
    }
  }

  /**
   * Store file indexing metadata
   */
  storeIndexedFile(filePath: string, hash: string, size: number, chunksCount: number): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO indexed_files (path, hash, indexed_at, size, chunks_count)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(filePath, hash, Date.now(), size, chunksCount);
  }

  /**
   * Get indexed file metadata
   */
  getIndexedFile(filePath: string): { hash: string; indexedAt: number; size: number; chunksCount: number } | null {
    const stmt = this.db.prepare(`SELECT * FROM indexed_files WHERE path = ?`);
    const row = stmt.get(filePath) as any;
    if (!row) return null;
    return {
      hash: row.hash,
      indexedAt: row.indexed_at,
      size: row.size,
      chunksCount: row.chunks_count
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
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
