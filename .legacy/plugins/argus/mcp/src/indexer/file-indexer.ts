/**
 * File Indexer for ARGUS
 * Scans and indexes local codebases for semantic search
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getStorage } from '../storage/database.js';
import { getRAGEngine } from '../rag/engine.js';
import { Transaction } from '../types/index.js';

export interface IndexerConfig {
  rootPath: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  maxFileSize?: number;
  chunkSize?: number;
  chunkOverlap?: number;
}

export interface FileChunk {
  content: string;
  startLine: number;
  endLine: number;
  filePath: string;
}

export interface IndexedFile {
  path: string;
  hash: string;
  indexedAt: number;
  size: number;
  chunksCount: number;
}

export class FileIndexer {
  private storage = getStorage();
  private rag = getRAGEngine();
  private config: Required<IndexerConfig>;

  // Default file extensions to index
  private defaultExtensions = new Set([
    '.ts', '.tsx', '.js', '.jsx',
    '.py', '.rs', '.go', '.java',
    '.md', '.txt', '.json', '.yaml', '.yml',
    '.toml', '.graphql', '.sql'
  ]);

  // Default directories to exclude
  private defaultExcludeDirs = new Set([
    'node_modules', '.git', 'dist', 'build',
    'target', '.next', '.vscode', '.idea',
    'coverage', '__tests__', '.venv', 'venv'
  ]);

  constructor(config: IndexerConfig) {
    this.config = {
      rootPath: config.rootPath,
      includePatterns: config.includePatterns || ['**/*.{ts,tsx,js,jsx,py,rs,md}'],
      excludePatterns: config.excludePatterns || ['**/node_modules/**', '**/.git/**', '**/dist/**'],
      maxFileSize: config.maxFileSize || 1024 * 1024, // 1MB
      chunkSize: config.chunkSize || 500,
      chunkOverlap: config.chunkOverlap || 50
    };
  }

  /**
   * Scan and index all files in the codebase
   */
  async indexCodebase(): Promise<IndexedFile[]> {
    const indexedFiles: IndexedFile[] = [];
    const startTime = Date.now();

    // Safety timeout: if indexing takes more than 5 minutes, stop
    const MAX_INDEX_TIME = 5 * 60 * 1000; // 5 minutes

    console.log(`Starting indexing of ${this.config.rootPath}`);

    const files = this.scanFiles(this.config.rootPath);
    console.log(`Found ${files.length} files to index`);

    // Process files in batches to avoid memory overflow
    const BATCH_SIZE = 10;
    let stoppedEarly = false;

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      // Check timeout
      if (Date.now() - startTime > MAX_INDEX_TIME) {
        console.log(`⚠️  Indexing timeout reached (${MAX_INDEX_TIME/1000}s), stopping early`);
        console.log(`✅ Indexed ${indexedFiles.length} files so far`);
        stoppedEarly = true;
        break;
      }

      const batch = files.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(files.length / BATCH_SIZE)} (${batch.length} files)`);

      for (const filePath of batch) {
        try {
          const result = await this.indexFile(filePath);
          if (result) {
            indexedFiles.push(result);
          }
        } catch (error) {
          console.error(`Failed to index ${filePath}:`, error.message);
        }

        // Force garbage collection between files
        if (global.gc) {
          global.gc();
        }
      }

      // Force garbage collection between batches
      if (global.gc) {
        global.gc();
      }
    }

    const duration = Date.now() - startTime;

    if (stoppedEarly) {
      console.log(`⏱️  Indexing stopped after ${duration}ms due to timeout (more files remain)`);
    } else {
      console.log(`✅ Indexed ${indexedFiles.length} files in ${duration}ms`);
    }

    return indexedFiles;
  }

  /**
   * Scan directory for files to index
   */
  private scanFiles(rootPath: string): string[] {
    const files: string[] = [];

    const scan = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip excluded directories
          if (this.defaultExcludeDirs.has(entry.name)) {
            continue;
          }
          scan(fullPath);
        } else if (entry.isFile()) {
          // Check file extension
          const ext = path.extname(entry.name);
          if (this.defaultExtensions.has(ext)) {
            // Check file size
            const stats = fs.statSync(fullPath);
            if (stats.size <= this.config.maxFileSize) {
              files.push(fullPath);
            }
          }
        }
      }
    };

    scan(rootPath);
    return files;
  }

  /**
   * Index a single file
   */
  async indexFile(filePath: string): Promise<IndexedFile | null> {
    try {
      // Calculate file hash
      const content = fs.readFileSync(filePath, 'utf-8');
      const hash = this.calculateHash(content);
      const stats = fs.statSync(filePath);

      // Check if file needs re-indexing
      const existing = this.storage.getIndexedFile(filePath);
      if (existing && existing.hash === hash) {
        return { ...existing, path: filePath };
      }

      // Chunk the file
      const chunks = this.chunkFile(filePath, content);

      // Index each chunk
      for (const chunk of chunks) {
        await this.indexChunk(chunk);
      }

      // Store metadata
      const indexedFile: IndexedFile = {
        path: filePath,
        hash,
        indexedAt: Date.now(),
        size: stats.size,
        chunksCount: chunks.length
      };

      this.storage.storeIndexedFile(filePath, hash, stats.size, chunks.length);

      return indexedFile;
    } catch (error) {
      console.error(`Failed to index file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Chunk file content for embedding
   */
  private chunkFile(filePath: string, content: string): FileChunk[] {
    const lines = content.split('\n');
    const chunks: FileChunk[] = [];

    let startLine = 0;
    while (startLine < lines.length) {
      const endLine = Math.min(startLine + this.config.chunkSize, lines.length);
      const chunkContent = lines.slice(startLine, endLine).join('\n');

      chunks.push({
        content: chunkContent,
        startLine: startLine + 1, // 1-indexed
        endLine: endLine,
        filePath
      });

      // Move to next chunk with overlap
      startLine = endLine - this.config.chunkOverlap;
    }

    return chunks;
  }

  /**
   * Index a single chunk as a transaction
   */
  private async indexChunk(chunk: FileChunk): Promise<void> {
    const relativePath = path.relative(this.config.rootPath, chunk.filePath);

    // Create a pseudo-transaction for the chunk
    const transaction: Transaction = {
      id: this.generateChunkId(chunk),
      timestamp: Date.now(),
      sessionId: 'indexing',
      prompt: {
        raw: chunk.content,
        type: 'system'
      },
      context: {
        cwd: this.config.rootPath,
        environment: {},
        platform: process.platform,
        toolsAvailable: [],
        files: [{
          path: relativePath,
          hash: this.calculateHash(chunk.content)
        }]
      },
      result: {
        success: true,
        output: `Code snippet from ${relativePath}:${chunk.startLine}-${chunk.endLine}`,
        duration: 0
      },
      metadata: {
        tags: ['code', 'indexed', relativePath.split('/')[0]],
        category: 'code-index'
      }
    };

    await this.rag.indexTransaction(transaction);
  }

  /**
   * Calculate SHA256 hash of content
   */
  private calculateHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Generate unique ID for a file chunk
   */
  private generateChunkId(chunk: FileChunk): string {
    const data = `${chunk.filePath}:${chunk.startLine}-${chunk.endLine}`;
    return crypto.createHash('md5').update(data).digest('hex');
  }

  /**
   * Remove file from index
   */
  async unindexFile(filePath: string): Promise<boolean> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const chunks = this.chunkFile(filePath, content);

      for (const chunk of chunks) {
        const id = this.generateChunkId(chunk);
        await this.rag.deleteTransaction(id);
      }

      // Remove from SQLite
      const stmt = this.storage['db'].prepare(`DELETE FROM indexed_files WHERE path = ?`);
      stmt.run(filePath);

      return true;
    } catch (error) {
      console.error(`Failed to unindex file ${filePath}:`, error);
      return false;
    }
  }

  /**
   * Get indexing statistics
   */
  async getStats(): Promise<{
    totalFiles: number;
    totalChunks: number;
    lastIndexRun: number;
  }> {
    const stmt = this.storage['db'].prepare(`
      SELECT
        COUNT(*) as total_files,
        SUM(chunks_count) as total_chunks,
        MAX(indexed_at) as last_index_run
      FROM indexed_files
    `);

    const row = stmt.get() as any;
    return {
      totalFiles: row.total_files || 0,
      totalChunks: row.total_chunks || 0,
      lastIndexRun: row.last_index_run || 0
    };
  }

  /**
   * Incremental index - only index changed files
   */
  async incrementalIndex(): Promise<{
    indexed: number;
    skipped: number;
    failed: number;
  }> {
    const files = this.scanFiles(this.config.rootPath);
    let indexed = 0;
    let skipped = 0;
    let failed = 0;

    for (const filePath of files) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const hash = this.calculateHash(content);
        const existing = this.storage.getIndexedFile(filePath);

        if (existing && existing.hash === hash) {
          skipped++;
          continue;
        }

        const result = await this.indexFile(filePath);
        if (result) {
          indexed++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`Failed to index ${filePath}:`, error);
        failed++;
      }
    }

    return { indexed, skipped, failed };
  }

  /**
   * Search indexed code
   */
  async searchCode(query: string, limit: number = 10): Promise<{
    filePath: string;
    lineRange: string;
    snippet: string;
    score: number;
  }[]> {
    const result = await this.rag.search({
      query,
      limit,
      threshold: 0.6
    });

    return result.relevantTransactions
      .filter(tx => tx.metadata.category === 'code-index')
      .map(tx => {
        const file = tx.context.files[0];
        const match = tx.result.output?.match(/(.+):(\d+)-(\d+)/);
        if (match) {
          return {
            filePath: match[1],
            lineRange: `${match[2]}-${match[3]}`,
            snippet: tx.prompt.raw.substring(0, 200) + '...',
            score: 0.8 // Placeholder score
          };
        }
        return null;
      })
      .filter(Boolean) as any;
  }
}

/**
 * Create and return a file indexer instance
 */
export function createFileIndexer(config: IndexerConfig): FileIndexer {
  return new FileIndexer(config);
}
