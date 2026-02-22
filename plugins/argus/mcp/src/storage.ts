/**
 * Simple file-based storage for ARGUS
 * This will be enhanced by the RAG engineer with proper vector embeddings
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Transaction, Hook } from './types/index.js';

const ARGUS_DIR = join(homedir(), '.argus');
const TRANSACTIONS_FILE = join(ARGUS_DIR, 'transactions.json');
const HOOKS_FILE = join(ARGUS_DIR, 'hooks.json');
const INDEX_FILE = join(ARGUS_DIR, 'index.json');

export class Storage {
  private transactions: Map<string, Transaction> = new Map();
  private hooks: Map<string, Hook> = new Map();
  private index: Map<string, string[]> = new Map(); // keyword -> transaction IDs
  private initialized = false;

  async init() {
    if (this.initialized) return;

    // Ensure .argus directory exists
    if (!existsSync(ARGUS_DIR)) {
      await mkdir(ARGUS_DIR, { recursive: true });
    }

    // Load transactions
    if (existsSync(TRANSACTIONS_FILE)) {
      const data = await readFile(TRANSACTIONS_FILE, 'utf-8');
      const transactions = JSON.parse(data) as Transaction[];
      transactions.forEach(t => this.transactions.set(t.id, t));
    }

    // Load hooks
    if (existsSync(HOOKS_FILE)) {
      const data = await readFile(HOOKS_FILE, 'utf-8');
      const hooks = JSON.parse(data) as Hook[];
      hooks.forEach(h => this.hooks.set(h.id, h));
    }

    // Load index
    if (existsSync(INDEX_FILE)) {
      const data = await readFile(INDEX_FILE, 'utf-8');
      const index = JSON.parse(data) as Record<string, string[]>;
      Object.entries(index).forEach(([key, ids]) => {
        this.index.set(key, ids);
      });
    }

    this.initialized = true;
  }

  async saveTransaction(transaction: Transaction): Promise<void> {
    await this.init();
    this.transactions.set(transaction.id, transaction);
    await this.persistTransactions();

    // Update index
    await this.indexTransaction(transaction);
  }

  async getTransaction(id: string): Promise<Transaction | undefined> {
    await this.init();
    return this.transactions.get(id);
  }

  async getAllTransactions(): Promise<Transaction[]> {
    await this.init();
    return Array.from(this.transactions.values());
  }

  async saveHook(hook: Hook): Promise<void> {
    await this.init();
    this.hooks.set(hook.id, hook);
    await this.persistHooks();
  }

  async getHook(id: string): Promise<Hook | undefined> {
    await this.init();
    return this.hooks.get(id);
  }

  async getAllHooks(): Promise<Hook[]> {
    await this.init();
    return Array.from(this.hooks.values());
  }

  async searchTransactions(query: string, limit = 10): Promise<Transaction[]> {
    await this.init();
    const transactions = Array.from(this.transactions.values());

    // Simple keyword matching (will be replaced with semantic search)
    const queryLower = query.toLowerCase();
    const results = transactions
      .filter(t =>
        t.prompt.raw.toLowerCase().includes(queryLower) ||
        t.result.output?.toLowerCase().includes(queryLower) ||
        t.metadata.tags.some(tag => tag.toLowerCase().includes(queryLower))
      )
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);

    return results;
  }

  private async indexTransaction(transaction: Transaction): Promise<void> {
    // Extract keywords from prompt
    const words = transaction.prompt.raw
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3);

    for (const word of words) {
      if (!this.index.has(word)) {
        this.index.set(word, []);
      }
      const ids = this.index.get(word)!;
      if (!ids.includes(transaction.id)) {
        ids.push(transaction.id);
      }
    }

    await this.persistIndex();
  }

  private async persistTransactions(): Promise<void> {
    const transactions = Array.from(this.transactions.values());
    await writeFile(TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2));
  }

  private async persistHooks(): Promise<void> {
    const hooks = Array.from(this.hooks.values());
    await writeFile(HOOKS_FILE, JSON.stringify(hooks, null, 2));
  }

  private async persistIndex(): Promise<void> {
    const index = Object.fromEntries(this.index);
    await writeFile(INDEX_FILE, JSON.stringify(index, null, 2));
  }

  async getHistory(options: {
    limit?: number;
    offset?: number;
    sessionId?: string;
  }): Promise<Transaction[]> {
    await this.init();
    let transactions = Array.from(this.transactions.values());

    if (options.sessionId) {
      transactions = transactions.filter(t => t.sessionId === options.sessionId);
    }

    transactions.sort((a, b) => b.timestamp - a.timestamp);

    const offset = options.offset || 0;
    const limit = options.limit || 50;

    return transactions.slice(offset, offset + limit);
  }
}
