/**
 * RAG Engine for ARGUS
 * Provides semantic search using vector embeddings and Qdrant
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { v4 as uuidv4 } from 'uuid';
import { Transaction, Hook, SearchQuery, RAGResult } from '../types/index.js';
import { getStorage } from '../storage/database.js';

export interface RAGConfig {
  qdrantUrl?: string;
  qdrantApiKey?: string;
  embeddingDimension?: number;
  collectionName?: string;
}

export interface EmbeddingOptions {
  provider: 'openai' | 'local';
  modelName?: string;
  apiKey?: string;
}

/**
 * Simple embedding generation using OpenAI API
 * For production, you might want to use local models (Ollama, etc.)
 */
async function generateEmbedding(text: string, options: EmbeddingOptions): Promise<Float32Array> {
  if (options.provider === 'openai') {
    if (!options.apiKey) {
      throw new Error('OpenAI API key is required for OpenAI embeddings');
    }

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${options.apiKey}`
      },
      body: JSON.stringify({
        model: options.modelName || 'text-embedding-3-small',
        input: text,
        dimensions: 1536
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = (await response.json()) as any;
    const embedding = data.data[0].embedding;
    return new Float32Array(embedding);
  } else {
    // Local embedding (placeholder - would integrate with local models)
    // For now, return a simple hash-based embedding
    const dim = 384;
    const embedding = new Float32Array(dim);
    for (let i = 0; i < dim; i++) {
      const char = text.charCodeAt(i % text.length);
      embedding[i] = (char % 100) / 100;
    }
    // Normalize
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    for (let i = 0; i < dim; i++) {
      embedding[i] /= norm;
    }
    return embedding;
  }
}

/**
 * Calculate cosine similarity between two embeddings
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error('Embedding dimensions must match');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class RAGEngine {
  private qdrant: QdrantClient | null = null;
  private storage = getStorage();
  private config: Required<RAGConfig>;
  private embeddingOptions: EmbeddingOptions;
  private useLocalSearch: boolean = false;

  constructor(config: RAGConfig = {}, embeddingOptions: EmbeddingOptions = { provider: 'local' }) {
    this.config = {
      qdrantUrl: config.qdrantUrl || 'http://localhost:6333',
      qdrantApiKey: config.qdrantApiKey || '',
      embeddingDimension: config.embeddingDimension || 384,
      collectionName: config.collectionName || 'argus_memory'
    };
    this.embeddingOptions = embeddingOptions;

    this.initializeQdrant();
  }

  private async initializeQdrant(): Promise<void> {
    try {
      this.qdrant = new QdrantClient({
        url: this.config.qdrantUrl,
        apiKey: this.config.qdrantApiKey || undefined
      });

      // Check if Qdrant is available
      await this.qdrant.getCollections();

      // Ensure collection exists
      const collections = await this.qdrant.getCollections();
      const exists = collections.collections.some((c: any) => c.name === this.config.collectionName);

      if (!exists) {
        await this.qdrant.createCollection({
          collection_name: this.config.collectionName,
          vectors: {
            size: this.config.embeddingDimension,
            distance: 'Cosine'
          }
        });
        console.log(`Created Qdrant collection: ${this.config.collectionName}`);
      }
    } catch (error) {
      console.warn('Qdrant not available, falling back to local search:', error);
      this.qdrant = null;
      this.useLocalSearch = true;
    }
  }

  /**
   * Index a transaction for semantic search
   */
  async indexTransaction(tx: Transaction): Promise<boolean> {
    try {
      // Generate embedding from prompt and result
      const text = `${tx.prompt.raw}\n${tx.result.output || ''}`;
      const embedding = await generateEmbedding(text, this.embeddingOptions);

      // Store in SQLite with embedding
      this.storage.storeTransaction(tx, embedding);

      // If Qdrant is available, index there too
      if (this.qdrant && !this.useLocalSearch) {
        await this.qdrant.upsert(this.config.collectionName, {
          points: [
            {
              id: tx.id,
              vector: Array.from(embedding),
              payload: {
                timestamp: tx.timestamp,
                sessionId: tx.sessionId,
                promptRaw: tx.prompt.raw,
                resultOutput: tx.result.output,
                category: tx.metadata.category,
                tags: tx.metadata.tags
              }
            }
          ]
        });
      }

      return true;
    } catch (error) {
      console.error('Failed to index transaction:', error);
      return false;
    }
  }

  /**
   * Index a hook for semantic search
   */
  async indexHook(hook: Hook): Promise<boolean> {
    try {
      // Generate embedding from documentation
      const text = `${hook.name}\n${hook.description}\n${hook.documentation.summary}`;
      const embedding = await generateEmbedding(text, this.embeddingOptions);

      // Store in SQLite with embedding
      this.storage.storeHook(hook, embedding);

      // If Qdrant is available, index there too
      if (this.qdrant && !this.useLocalSearch) {
        await this.qdrant.upsert(this.config.collectionName, {
          points: [
            {
              id: `hook_${hook.id}`,
              vector: Array.from(embedding),
              payload: {
                type: 'hook',
                hookId: hook.id,
                name: hook.name,
                description: hook.description,
                triggers: hook.triggers
              }
            }
          ]
        });
      }

      return true;
    } catch (error) {
      console.error('Failed to index hook:', error);
      return false;
    }
  }

  /**
   * Semantic search for relevant transactions and hooks
   */
  async search(query: SearchQuery): Promise<RAGResult> {
    const limit = query.limit || 10;

    try {
      const embedding = await generateEmbedding(query.query, this.embeddingOptions);

      if (this.qdrant && !this.useLocalSearch) {
        // Use Qdrant for fast vector search
        const results = await this.qdrant.search(this.config.collectionName, {
          vector: Array.from(embedding),
          limit: limit * 2, // Get more to filter
          score_threshold: query.threshold || 0.7
        });

        // Separate hooks and transactions
        const hooks: Hook[] = [];
        const relevantTransactions: Transaction[] = [];

        for (const result of results) {
          if (result.payload?.type === 'hook') {
            const hook = this.storage.getHook(result.payload.hookId);
            if (hook) hooks.push(hook);
          } else {
            const tx = this.storage.getTransaction(result.id);
            if (tx) relevantTransactions.push(tx);
          }
        }

        return {
          hooks: hooks.slice(0, limit),
          relevantTransactions: relevantTransactions.slice(0, limit),
          confidence: results[0]?.score || 0
        };
      } else {
        // Fallback to local search using SQLite embeddings
        const allTransactions = this.storage.searchTransactions(query.query, limit * 2);
        const allHooks = this.storage.getAllHooks();

        // Score transactions by similarity
        const scoredTransactions = allTransactions.map(tx => {
          const stored = this.storage.getTransaction(tx.id);
          if (!stored) return { tx, score: 0 };

          // Get stored embedding (simplified - would need to retrieve from DB)
          return {
            tx,
            score: this.calculateTextSimilarity(query.query, tx.prompt.raw)
          };
        }).filter(s => s.score > (query.threshold || 0.5))
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);

        // Score hooks by similarity
        const scoredHooks = allHooks.map(hook => ({
          hook,
          score: this.calculateTextSimilarity(query.query, `${hook.name} ${hook.description}`)
        })).filter(s => s.score > (query.threshold || 0.5))
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);

        return {
          hooks: scoredHooks.map(s => s.hook),
          relevantTransactions: scoredTransactions.map(s => s.tx),
          confidence: scoredTransactions[0]?.score || 0
        };
      }
    } catch (error) {
      console.error('Search failed:', error);

      // Final fallback to text search
      const transactions = this.storage.searchTransactions(query.query, limit);
      return {
        hooks: [],
        relevantTransactions: transactions,
        confidence: 0.5
      };
    }
  }

  /**
   * Find hooks that might be relevant for a given context
   */
  async findRelevantHooks(context: {
    prompt: string;
    toolsUsed?: string[];
    category?: string;
  }): Promise<Hook[]> {
    const query: SearchQuery = {
      query: context.prompt,
      limit: 5,
      threshold: 0.6
    };

    const result = await this.search(query);
    return result.hooks;
  }

  /**
   * Simple text similarity calculation (Jaccard-like)
   */
  private calculateTextSimilarity(query: string, text: string): number {
    const queryWords = new Set(query.toLowerCase().split(/\s+/));
    const textWords = new Set(text.toLowerCase().split(/\s+/));

    let intersection = 0;
    for (const word of queryWords) {
      if (textWords.has(word)) intersection++;
    }

    const union = new Set([...queryWords, ...textWords]);
    return union.size > 0 ? intersection / union.size : 0;
  }

  /**
   * Delete a transaction from index
   */
  async deleteTransaction(id: string): Promise<boolean> {
    try {
      this.storage.deleteTransaction(id);

      if (this.qdrant && !this.useLocalSearch) {
        await this.qdrant.delete(this.config.collectionName, {
          points: [id]
        });
      }

      return true;
    } catch (error) {
      console.error('Failed to delete transaction:', error);
      return false;
    }
  }

  /**
   * Get statistics about the indexed data
   */
  async getStats(): Promise<{
    totalTransactions: number;
    totalHooks: number;
    usingQdrant: boolean;
  }> {
    const transactions = this.storage.getTransactionsByDateRange(0, Date.now(), 1, 0);
    const hooks = this.storage.getAllHooks();

    // Note: This is a rough estimate, proper implementation would use COUNT queries
    return {
      totalTransactions: transactions.length,
      totalHooks: hooks.length,
      usingQdrant: this.qdrant !== null && !this.useLocalSearch
    };
  }
}

let ragInstance: RAGEngine | null = null;

/**
 * Get or create singleton RAG engine instance
 */
export function getRAGEngine(config?: RAGConfig, embeddingOptions?: EmbeddingOptions): RAGEngine {
  if (!ragInstance) {
    ragInstance = new RAGEngine(config, embeddingOptions);
  }
  return ragInstance;
}
