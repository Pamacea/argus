/**
 * Optimized Storage layer for ARGUS using SQLite (sql.js)
 *
 * Performance Improvements:
 * - Prepared statement caching
 * - Batch insert operations
 * - Optimized indexes for common queries
 * - Connection pooling (simulated via singleton)
 * - Query result caching
 * - Lazy loading for large datasets
 */

import initSqlJs, { Database, SqlJsStatic, Statement } from 'sql.js';
import { v4 as uuidv4 } from 'uuid';
import { Transaction, Hook } from '../types/index.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export class OptimizedStorage {
  private db: Database | null = null;
  private dbPath: string;
  private SQL: SqlJsStatic | null = null;
  private initPromise: Promise<void>;
  private autoFlushInterval: NodeJS.Timeout | null = null;
  private pendingChanges = false;

  // Prepared statement cache
  private statementCache: Map<string, Statement> = new Map();

  // Query result cache with TTL
  private queryCache: Map<string, CacheEntry<any>> = new Map();
  private readonly DEFAULT_CACHE_TTL = 5000; // 5 seconds
  private readonly MAX_CACHE_SIZE = 100;

  // Batch operations buffer
  private batchBuffer: Transaction[] = [];
  private readonly BATCH_SIZE = 50;
  private batchTimeout: NodeJS.Timeout | null = null;

  constructor(dbPath?: string) {
    const dataDir = dbPath || path.join(process.env.HOME || process.env.USERPROFILE || '.', '.argus');
    fs.mkdirSync(dataDir, { recursive: true });

    this.dbPath = path.join(dataDir, 'argus.db');
    this.initPromise = this.initialize();
    this.setupAutoFlush();
    this.setupShutdownHooks();
    this.setupBatchProcessing();
  }

  private async initialize(): Promise<void> {
    // Initialize sql.js
    this.SQL = await initSqlJs({
      locateFile: (file) => {
        const wasmPath = path.join(__dirname, '../node_modules/sql.js/dist', file);
        return wasmPath;
      }
    });

    // Load existing database or create new one
    if (fs.existsSync(this.dbPath)) {
      try {
        const buffer = fs.readFileSync(this.dbPath);
        this.db = new this.SQL.Database(buffer);

        const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM transactions`);
        if (stmt.step()) {
          const count = stmt.getAsObject({ count: 0 }).count as number;
          console.log(`[ARGUS] Loaded existing database with ${count} transactions`);
        }
        stmt.free();
      } catch (error) {
        console.error('[ARGUS] Failed to load existing database, creating new one:', error);
        this.db = new this.SQL.Database();
      }
    } else {
      console.log('[ARGUS] Creating new database');
      this.db = new this.SQL.Database();
    }

    this.initializeSchema();
    this.cleanupCache();
  }

  private async ensureInitialized(): Promise<void> {
    await this.initPromise;
  }

  private initializeSchema(): void {
    if (!this.db) throw new Error('Database not initialized');

    // Transactions table with optimized schema
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

    // Optimized indexes for common query patterns
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_timestamp_desc ON transactions(timestamp DESC)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_session_timestamp ON transactions(session_id, timestamp DESC)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_category_timestamp ON transactions(metadata_category, timestamp DESC)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_success ON transactions(result_success)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_tags ON transactions(metadata_tags)`);

    // Full-text search virtual table for fast text search
    this.db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS transactions_fts USING fts5(
        id,
        prompt_raw,
        result_output,
        content='transactions',
        content_rowid='rowid'
      )
    `);

    // Triggers to keep FTS table in sync
    this.db.run(`
      CREATE TRIGGER IF NOT EXISTS transactions_ai AFTER INSERT ON transactions BEGIN
        INSERT INTO transactions_fts(rowid, id, prompt_raw, result_output)
        VALUES (new.rowid, new.id, new.prompt_raw, new.result_output);
      END
    `);

    this.db.run(`
      CREATE TRIGGER IF NOT EXISTS transactions_ad AFTER DELETE ON transactions BEGIN
        INSERT INTO transactions_fts(transactions_fts, id, prompt_raw, result_output)
        VALUES ('delete', old.id, old.prompt_raw, old.result_output);
      END
    `);

    // Hooks table
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
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_hooks_downloads ON hooks(marketplace_downloads DESC)`);

    // Indexed files table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS indexed_files (
        path TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        indexed_at INTEGER NOT NULL,
        size INTEGER NOT NULL,
        chunks_count INTEGER DEFAULT 0
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_indexed_files_hash ON indexed_files(hash)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_indexed_files_indexed_at ON indexed_files(indexed_at DESC)`);

    this.saveToFile();
  }

  /**
   * Get or create prepared statement from cache
   */
  private prepareStatement(sql: string): Statement {
    if (!this.db) throw new Error('Database not initialized');

    let stmt = this.statementCache.get(sql);
    if (!stmt) {
      stmt = this.db.prepare(sql);
      this.statementCache.set(sql, stmt);
    }
    return stmt;
  }

  /**
   * Get cached query result if valid
   */
  private getCached<T>(key: string): T | null {
    const entry = this.queryCache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.queryCache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Cache query result with TTL
   */
  private setCache<T>(key: string, data: T, ttl: number = this.DEFAULT_CACHE_TTL): void {
    // Enforce cache size limit
    if (this.queryCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = Array.from(this.queryCache.entries())[0][0];
      this.queryCache.delete(oldestKey);
    }

    this.queryCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * Generate cache key from parameters
   */
  private cacheKey(prefix: string, params: any[]): string {
    return `${prefix}:${JSON.stringify(params)}`;
  }

  /**
   * Invalidate cache entries matching pattern
   */
  private invalidateCache(pattern: string): void {
    for (const key of this.queryCache.keys()) {
      if (key.startsWith(pattern)) {
        this.queryCache.delete(key);
      }
    }
  }

  /**
   * Batch store multiple transactions
   */
  async batchStoreTransactions(transactions: Transaction[]): Promise<number> {
    if (transactions.length === 0) return 0;

    await this.ensureInitialized();
    if (!this.db) throw new Error('Database not initialized');

    let saved = 0;

    try {
      // Begin transaction for atomic batch insert
      this.db.run('BEGIN TRANSACTION');

      const stmt = this.prepareStatement(`
        INSERT INTO transactions (
          id, timestamp, session_id,
          prompt_raw, prompt_type,
          context_cwd, context_environment, context_platform, context_tools_available, context_files,
          result_success, result_output, result_error, result_duration, result_tools_used,
          metadata_tags, metadata_category, metadata_related_hooks,
          embedding
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const tx of transactions) {
        const toNull = (value: any): any => value === undefined ? null : value;

        stmt.run([
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
          null // embedding - would be passed separately if needed
        ]);

        saved++;
      }

      this.db.run('COMMIT');
      this.pendingChanges = true;
      this.saveToFile();

      // Invalidate relevant cache entries
      this.invalidateCache('transactions:');
      this.invalidateCache('search:');
    } catch (error) {
      this.db.run('ROLLBACK');
      console.error('Batch store failed:', error);
      throw error;
    }

    return saved;
  }

  /**
   * Queue transaction for batch processing
   */
  async queueTransaction(tx: Transaction): Promise<void> {
    this.batchBuffer.push(tx);

    if (this.batchBuffer.length >= this.BATCH_SIZE) {
      await this.flushBatch();
    } else if (!this.batchTimeout) {
      // Flush after 1 second if buffer not full
      this.batchTimeout = setTimeout(() => this.flushBatch(), 1000);
    }
  }

  /**
   * Flush batch buffer to database
   */
  private async flushBatch(): Promise<void> {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    if (this.batchBuffer.length === 0) return;

    const batch = this.batchBuffer.splice(0, this.batchBuffer.length);
    await this.batchStoreTransactions(batch);
  }

  /**
   * Store a single transaction (immediate write)
   */
  async storeTransaction(tx: Transaction, embedding?: Float32Array): Promise<boolean> {
    try {
      await this.ensureInitialized();
      if (!this.db) throw new Error('Database not initialized');

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

      this.pendingChanges = true;
      this.saveToFile();

      // Invalidate cache
      this.invalidateCache('transactions:');
      this.invalidateCache('search:');

      return true;
    } catch (error) {
      console.error('Failed to store transaction:', error);
      return false;
    }
  }

  /**
   * Retrieve a transaction by ID (with caching)
   */
  async getTransaction(id: string): Promise<Transaction | null> {
    await this.ensureInitialized();
    if (!this.db) return null;

    // Check cache first
    const cacheKey = this.cacheKey('transaction', [id]);
    const cached = this.getCached<Transaction>(cacheKey);
    if (cached) return cached;

    const stmt = this.prepareStatement(`SELECT * FROM transactions WHERE id = ?`);
    stmt.bind([id]);
    const result = stmt.getAsObject<any>();

    if (!result || !result.id) return null;

    const transaction = this.rowToTransaction(result);
    this.setCache(cacheKey, transaction);

    return transaction;
  }

  /**
   * Optimized text search using FTS5
   */
  async searchTransactions(query: string, limit: number = 10): Promise<Transaction[]> {
    await this.ensureInitialized();
    if (!this.db) return [];

    // Check cache first
    const cacheKey = this.cacheKey('search', [query, limit]);
    const cached = this.getCached<Transaction[]>(cacheKey);
    if (cached) return cached;

    // Use FTS5 for fast full-text search
    const stmt = this.prepareStatement(`
      SELECT t.* FROM transactions t
      INNER JOIN transactions_fts fts ON t.id = fts.id
      WHERE transactions_fts MATCH ?
      ORDER BY t.timestamp DESC
      LIMIT ?
    `);

    stmt.bind([query, limit]);

    const results: Transaction[] = [];
    while (stmt.step()) {
      results.push(this.rowToTransaction(stmt.getAsObject<any>()));
    }

    // Cache results
    this.setCache(cacheKey, results, 3000); // Shorter TTL for search results

    return results;
  }

  /**
   * Get transactions by session ID with pagination (optimized)
   */
  async getTransactionsBySession(sessionId: string, limit: number = 100, offset: number = 0): Promise<Transaction[]> {
    await this.ensureInitialized();
    if (!this.db) return [];

    // Check cache
    const cacheKey = this.cacheKey('session', [sessionId, limit, offset]);
    const cached = this.getCached<Transaction[]>(cacheKey);
    if (cached) return cached;

    const stmt = this.prepareStatement(`
      SELECT * FROM transactions
      WHERE session_id = ?
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `);
    stmt.bind([sessionId, limit, offset]);

    const results: Transaction[] = [];
    while (stmt.step()) {
      results.push(this.rowToTransaction(stmt.getAsObject<any>()));
    }

    // Cache results
    this.setCache(cacheKey, results);

    return results;
  }

  /**
   * Get statistics (optimized with separate queries for each metric)
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

    // Check cache (stats have longer TTL)
    const cacheKey = 'stats';
    const cached = this.getCached<any>(cacheKey);
    if (cached) {
      // Update memory size dynamically
      let memorySize = 0;
      try {
        const stats = fs.statSync(this.dbPath);
        memorySize = stats.size;
      } catch (e) {}
      cached.memorySize = memorySize;
      return cached;
    }

    // Use optimized COUNT queries
    const [transactionCount, hookCount, indexedFileData] = await Promise.all([
      this.getCount('transactions'),
      this.getCount('hooks'),
      this.getCountAndMax('indexed_files', 'indexed_at')
    ]);

    // Calculate memory size
    let memorySize = 0;
    try {
      const stats = fs.statSync(this.dbPath);
      memorySize = stats.size;
    } catch (e) {}

    const result = {
      transactionCount,
      hookCount,
      indexedFileCount: indexedFileData.count,
      memorySize,
      lastIndexTime: indexedFileData.max
    };

    // Cache for 10 seconds
    this.setCache(cacheKey, result, 10000);

    // Write to stats file
    try {
      const statsPath = path.join(path.dirname(this.dbPath), 'stats.json');
      const statsData = { ...result, lastUpdated: Date.now() };
      fs.writeFileSync(statsPath, JSON.stringify(statsData, null, 2));
    } catch (e) {
      console.warn('[ARGUS] Failed to write stats file:', e);
    }

    return result;
  }

  /**
   * Helper: Get count from table
   */
  private async getCount(table: string): Promise<number> {
    if (!this.db) return 0;

    const stmt = this.prepareStatement(`SELECT COUNT(*) as count FROM ${table}`);
    if (stmt.step()) {
      const count = stmt.getAsObject({ count: 0 }).count as number;
      return count;
    }
    return 0;
  }

  /**
   * Helper: Get count and max of column
   */
  private async getCountAndMax(table: string, column: string): Promise<{ count: number; max: number }> {
    if (!this.db) return { count: 0, max: 0 };

    const stmt = this.prepareStatement(`
      SELECT COUNT(*) as count, MAX(${column}) as max FROM ${table}
    `);
    if (stmt.step()) {
      const result = stmt.getAsObject({ count: 0, max: 0 });
      return {
        count: result.count as number,
        max: (result.max as number) || 0
      };
    }
    return { count: 0, max: 0 };
  }

  private saveToFile(): void {
    if (!this.db) return;
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);

      const tmpPath = this.dbPath + '.tmp';
      fs.writeFileSync(tmpPath, buffer);
      fs.renameSync(tmpPath, this.dbPath);

      console.debug(`[ARGUS] Database saved to ${this.dbPath} (${buffer.length} bytes)`);
    } catch (error) {
      console.error('[ARGUS] Failed to save database:', error);
      throw error;
    }
  }

  private setupAutoFlush(): void {
    this.autoFlushInterval = setInterval(() => {
      if (this.pendingChanges && this.db) {
        console.debug('[ARGUS] Auto-flushing database...');
        this.saveToFile();
        this.pendingChanges = false;
      }
    }, 10000);
  }

  private setupBatchProcessing(): void {
    // Flush any pending batches on shutdown
    process.on('beforeExit', async () => {
      await this.flushBatch();
    });
  }

  private setupShutdownHooks(): void {
    const shutdown = async () => {
      console.log('[ARGUS] Shutdown signal received, flushing...');
      await this.flushBatch();
      this.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('beforeExit', shutdown);
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.queryCache.entries()) {
        if (now - entry.timestamp > entry.ttl) {
          this.queryCache.delete(key);
        }
      }
    }, 60000); // Cleanup every minute
  }

  close(): void {
    if (this.autoFlushInterval) {
      clearInterval(this.autoFlushInterval);
      this.autoFlushInterval = null;
    }

    // Free prepared statements
    for (const stmt of this.statementCache.values()) {
      stmt.free();
    }
    this.statementCache.clear();

    if (this.db) {
      console.log('[ARGUS] Closing database and saving final state...');
      this.saveToFile();
      this.db.close();
      this.db = null;
    }
  }

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

  // Forward other methods from original Storage class
  async getAllTransactions(limit: number = 10000): Promise<Transaction[]> {
    await this.ensureInitialized();
    if (!this.db) return [];

    const stmt = this.prepareStatement(`
      SELECT * FROM transactions
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    stmt.bind([limit]);

    const results: Transaction[] = [];
    while (stmt.step()) {
      results.push(this.rowToTransaction(stmt.getAsObject<any>()));
    }

    return results;
  }

  async getTransactionsByDateRange(
    start: number,
    end: number,
    limit: number = 100,
    offset: number = 0
  ): Promise<Transaction[]> {
    await this.ensureInitialized();
    if (!this.db) return [];

    const stmt = this.prepareStatement(`
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

    return results;
  }

  async deleteTransaction(id: string): Promise<boolean> {
    try {
      await this.ensureInitialized();
      if (!this.db) throw new Error('Database not initialized');

      this.db.run(`DELETE FROM transactions WHERE id = ?`, [id]);
      this.pendingChanges = true;
      this.saveToFile();

      // Invalidate cache
      this.invalidateCache('transactions:');

      return true;
    } catch (error) {
      console.error('Failed to delete transaction:', error);
      return false;
    }
  }

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

      this.pendingChanges = true;
      this.saveToFile();

      // Invalidate cache
      this.invalidateCache('hooks:');

      return true;
    } catch (error) {
      console.error('Failed to store hook:', error);
      return false;
    }
  }

  async getHook(id: string): Promise<Hook | null> {
    await this.ensureInitialized();
    if (!this.db) return null;

    const stmt = this.prepareStatement(`SELECT * FROM hooks WHERE id = ?`);
    stmt.bind([id]);
    const result = stmt.getAsObject<any>();

    if (!result || !result.id) return null;
    return this.rowToHook(result);
  }

  async getAllHooks(): Promise<Hook[]> {
    await this.ensureInitialized();
    if (!this.db) return [];

    const stmt = this.prepareStatement(`SELECT * FROM hooks ORDER BY marketplace_downloads DESC`);

    const results: Hook[] = [];
    while (stmt.step()) {
      results.push(this.rowToHook(stmt.getAsObject<any>()));
    }

    return results;
  }

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

      // Invalidate cache
      this.invalidateCache('hooks:');

      return true;
    } catch (error) {
      console.error('Failed to update hook:', error);
      return false;
    }
  }

  async deleteHook(id: string): Promise<boolean> {
    try {
      await this.ensureInitialized();
      if (!this.db) throw new Error('Database not initialized');

      this.db.run(`DELETE FROM hooks WHERE id = ?`, [id]);
      this.saveToFile();

      // Invalidate cache
      this.invalidateCache('hooks:');

      return true;
    } catch (error) {
      console.error('Failed to delete hook:', error);
      return false;
    }
  }

  async storeIndexedFile(filePath: string, hash: string, size: number, chunksCount: number): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) return;

    this.db.run(`
      INSERT OR REPLACE INTO indexed_files (path, hash, indexed_at, size, chunks_count)
      VALUES (?, ?, ?, ?, ?)
    `, [filePath, hash, Date.now(), size, chunksCount]);

    this.pendingChanges = true;
    this.saveToFile();
  }

  async getIndexedFile(filePath: string): Promise<{ hash: string; indexedAt: number; size: number; chunksCount: number } | null> {
    await this.ensureInitialized();
    if (!this.db) return null;

    const stmt = this.prepareStatement(`SELECT * FROM indexed_files WHERE path = ?`);
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

let storageInstance: OptimizedStorage | null = null;

export function getOptimizedStorage(dbPath?: string): OptimizedStorage {
  if (!storageInstance) {
    storageInstance = new OptimizedStorage(dbPath);
  }
  return storageInstance;
}
