/**
 * Performance Benchmark Suite for ARGUS
 *
 * Establishes baseline metrics for critical operations:
 * - Database operations (save, search, retrieve)
 * - RAG/semantic search (TF-IDF, Qdrant)
 * - Queue processing
 * - File indexing
 *
 * Run with: npm run benchmark
 */

import { getStorage } from '../storage/database.js';
import { getRAGEngine } from '../rag/engine.js';
import { Transaction } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';

interface BenchmarkResult {
  name: string;
  operation: string;
  iterations: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  opsPerSecond: number;
  memoryBefore: number;
  memoryAfter: number;
  memoryDelta: number;
}

class PerformanceBenchmark {
  private results: BenchmarkResult[] = [];
  private storage = getStorage();
  private rag = getRAGEngine();

  /**
   * Get current memory usage in MB
   */
  private getMemoryUsage(): number {
    const usage = process.memoryUsage();
    return Math.round(usage.heapUsed / 1024 / 1024);
  }

  /**
   * Run a benchmark with multiple iterations
   */
  private async benchmark(
    name: string,
    operation: string,
    fn: () => Promise<any> | any,
    iterations: number = 100
  ): Promise<BenchmarkResult> {
    // Warmup run
    await fn();

    const times: number[] = [];
    const memoryBefore = this.getMemoryUsage();
    const startTime = Date.now();

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await fn();
      const end = performance.now();
      times.push(end - start);
    }

    const totalTime = Date.now() - startTime;
    const memoryAfter = this.getMemoryUsage();

    const result: BenchmarkResult = {
      name,
      operation,
      iterations,
      totalTime,
      avgTime: times.reduce((a, b) => a + b, 0) / times.length,
      minTime: Math.min(...times),
      maxTime: Math.max(...times),
      opsPerSecond: (iterations / totalTime) * 1000,
      memoryBefore,
      memoryAfter,
      memoryDelta: memoryAfter - memoryBefore
    };

    this.results.push(result);
    return result;
  }

  /**
   * Benchmark: Database - Store Transaction
   */
  async benchmarkStoreTransaction(): Promise<BenchmarkResult> {
    const createMockTransaction = (): Transaction => ({
      id: uuidv4(),
      timestamp: Date.now(),
      sessionId: 'benchmark_session',
      prompt: {
        raw: 'This is a test prompt for benchmarking database performance',
        type: 'user'
      },
      context: {
        cwd: '/test/path',
        environment: { NODE_ENV: 'test' },
        platform: 'linux',
        toolsAvailable: ['read', 'write'],
        files: []
      },
      result: {
        success: true,
        output: 'Benchmark result output',
        duration: 100,
        toolsUsed: ['read']
      },
      metadata: {
        tags: ['benchmark', 'test'],
        category: 'testing'
      }
    });

    return this.benchmark(
      'Database',
      'Store Transaction',
      async () => {
        const tx = createMockTransaction();
        await this.storage.storeTransaction(tx);
      },
      50
    );
  }

  /**
   * Benchmark: Database - Retrieve Transaction by ID
   */
  async benchmarkGetTransaction(): Promise<BenchmarkResult> {
    // First, create a test transaction
    const testId = uuidv4();
    const testTx: Transaction = {
      id: testId,
      timestamp: Date.now(),
      sessionId: 'benchmark_session',
      prompt: { raw: 'Test transaction for retrieval benchmark', type: 'user' },
      context: {
        cwd: '/test',
        environment: {},
        platform: 'linux',
        toolsAvailable: [],
        files: []
      },
      result: { success: true, output: 'Test output', duration: 0 },
      metadata: { tags: ['test'], category: 'test' }
    };

    await this.storage.storeTransaction(testTx);

    return this.benchmark(
      'Database',
      'Get Transaction by ID',
      async () => {
        await this.storage.getTransaction(testId);
      },
      1000
    );
  }

  /**
   * Benchmark: Database - Search Transactions
   */
  async benchmarkSearchTransactions(): Promise<BenchmarkResult> {
    // Create test data
    const queries = ['test', 'benchmark', 'performance', 'database', 'search'];

    return this.benchmark(
      'Database',
      'Search Transactions (LIKE)',
      async () => {
        const query = queries[Math.floor(Math.random() * queries.length)];
        await this.storage.searchTransactions(query, 10);
      },
      100
    );
  }

  /**
   * Benchmark: Database - Get All Transactions
   */
  async benchmarkGetAllTransactions(): Promise<BenchmarkResult> {
    return this.benchmark(
      'Database',
      'Get All Transactions (1000 limit)',
      async () => {
        await this.storage.getAllTransactions(1000);
      },
      50
    );
  }

  /**
   * Benchmark: Local Semantic Search - Index
   */
  async benchmarkLocalIndex(): Promise<BenchmarkResult> {
    const { default: LocalSemanticSearch } = await import('../semantic/local-semantic.js');
    const search = new LocalSemanticSearch();

    const documents = Array.from({ length: 100 }, (_, i) => ({
      id: `doc_${i}`,
      content: `Test document ${i} with some content for semantic search benchmarking`,
      timestamp: Date.now()
    }));

    return this.benchmark(
      'Local Semantic Search',
      'Index 100 Documents',
      async () => {
        for (const doc of documents) {
          search.index(doc);
        }
      },
      20
    );
  }

  /**
   * Benchmark: Local Semantic Search - Search
   */
  async benchmarkLocalSearch(): Promise<BenchmarkResult> {
    const { default: LocalSemanticSearch } = await import('../semantic/local-semantic.js');
    const search = new LocalSemanticSearch();

    // Pre-index some documents
    for (let i = 0; i < 100; i++) {
      search.index({
        id: `doc_${i}`,
        content: `Document about ${['testing', 'benchmark', 'performance', 'code', 'search'][i % 5]} and various topics`,
        timestamp: Date.now()
      });
    }

    const queries = ['testing performance', 'code benchmark', 'search optimization'];

    return this.benchmark(
      'Local Semantic Search',
      'Search Query',
      async () => {
        const query = queries[Math.floor(Math.random() * queries.length)];
        search.search(query, 10);
      },
      200
    );
  }

  /**
   * Benchmark: RAG Engine - Index Transaction
   */
  async benchmarkRAGIndex(): Promise<BenchmarkResult> {
    const testTx: Transaction = {
      id: uuidv4(),
      timestamp: Date.now(),
      sessionId: 'benchmark_rag',
      prompt: { raw: 'Testing RAG indexing performance', type: 'user' },
      context: {
        cwd: '/test',
        environment: {},
        platform: 'linux',
        toolsAvailable: [],
        files: []
      },
      result: { success: true, output: 'RAG index test result', duration: 50 },
      metadata: { tags: ['rag', 'benchmark'], category: 'testing' }
    };

    return this.benchmark(
      'RAG Engine',
      'Index Transaction',
      async () => {
        testTx.id = uuidv4(); // Generate new ID for each iteration
        await this.rag.indexTransaction(testTx);
      },
      20
    );
  }

  /**
   * Benchmark: RAG Engine - Search
   */
  async benchmarkRAGSearch(): Promise<BenchmarkResult> {
    const queries = [
      'database performance optimization',
      'semantic search implementation',
      'transaction storage efficiency'
    ];

    return this.benchmark(
      'RAG Engine',
      'Search Query',
      async () => {
        const query = queries[Math.floor(Math.random() * queries.length)];
        await this.rag.search({ query, limit: 10, threshold: 0.5 });
      },
      50
    );
  }

  /**
   * Benchmark: Database - Batch Insert
   */
  async benchmarkBatchInsert(): Promise<BenchmarkResult> {
    const batchSize = 50;
    const transactions = Array.from({ length: batchSize }, () => ({
      id: uuidv4(),
      timestamp: Date.now(),
      sessionId: 'batch_benchmark',
      prompt: { raw: 'Batch insert test transaction', type: 'user' },
      context: {
        cwd: '/test',
        environment: {},
        platform: 'linux',
        toolsAvailable: [],
        files: []
      },
      result: { success: true, output: 'Batch test', duration: 10 },
      metadata: { tags: ['batch', 'test'], category: 'testing' }
    }));

    return this.benchmark(
      'Database',
      `Batch Insert (${batchSize} transactions)`,
      async () => {
        for (const tx of transactions) {
          tx.id = uuidv4();
          await this.storage.storeTransaction(tx);
        }
      },
      10
    );
  }

  /**
   * Run all benchmarks
   */
  async runAll(): Promise<void> {
    console.log('='.repeat(80));
    console.log('ARGUS Performance Benchmark Suite');
    console.log('='.repeat(80));
    console.log('');

    console.log('Running benchmarks...');
    console.log('');

    try {
      // Database benchmarks
      console.log('📊 Database Benchmarks');
      await this.benchmarkStoreTransaction();
      await this.benchmarkGetTransaction();
      await this.benchmarkSearchTransactions();
      await this.benchmarkGetAllTransactions();
      await this.benchmarkBatchInsert();

      // Semantic search benchmarks
      console.log('🔍 Semantic Search Benchmarks');
      await this.benchmarkLocalIndex();
      await this.benchmarkLocalSearch();

      // RAG benchmarks
      console.log('🧠 RAG Engine Benchmarks');
      await this.benchmarkRAGIndex();
      await this.benchmarkRAGSearch();

    } catch (error) {
      console.error('Benchmark failed:', error);
    }

    this.printResults();
    this.exportResults();
  }

  /**
   * Print benchmark results
   */
  private printResults(): void {
    console.log('');
    console.log('='.repeat(80));
    console.log('BENCHMARK RESULTS');
    console.log('='.repeat(80));
    console.log('');

    const formatNumber = (n: number, decimals = 2) => n.toFixed(decimals);
    const formatTime = (ms: number) => ms < 1 ? `${(ms * 1000).toFixed(2)}μs` : `${formatNumber(ms)}ms`;

    // Group by category
    const grouped = this.results.reduce((acc, result) => {
      if (!acc[result.name]) acc[result.name] = [];
      acc[result.name].push(result);
      return acc;
    }, {} as Record<string, BenchmarkResult[]>);

    for (const [category, results] of Object.entries(grouped)) {
      console.log(`\n${category}`);
      console.log('-'.repeat(80));

      for (const result of results) {
        console.log(`\n  Operation: ${result.operation}`);
        console.log(`  Iterations: ${result.iterations}`);
        console.log(`  Total Time: ${formatTime(result.totalTime)}`);
        console.log(`  Average:   ${formatTime(result.avgTime)}`);
        console.log(`  Min:       ${formatTime(result.minTime)}`);
        console.log(`  Max:       ${formatTime(result.maxTime)}`);
        console.log(`  Throughput: ${formatNumber(result.opsPerSecond)} ops/sec`);
        console.log(`  Memory:    ${result.memoryBefore}MB → ${result.memoryAfter}MB (Δ${result.memoryDelta >= 0 ? '+' : ''}${result.memoryDelta}MB)`);
      }
    }

    console.log('');
    console.log('='.repeat(80));
  }

  /**
   * Export results to JSON file
   */
  private exportResults(): void {
    const resultsPath = './benchmark-results.json';
    const fs = require('fs');

    const exportData = {
      timestamp: new Date().toISOString(),
      platform: process.platform,
      nodeVersion: process.version,
      results: this.results
    };

    fs.writeFileSync(resultsPath, JSON.stringify(exportData, null, 2));
    console.log(`\n✅ Results exported to ${resultsPath}`);
  }

  /**
   * Compare results with previous run
   */
  compareWithPrevious(previousResults: BenchmarkResult[]): void {
    console.log('');
    console.log('='.repeat(80));
    console.log('PERFORMANCE COMPARISON');
    console.log('='.repeat(80));
    console.log('');

    const previousMap = new Map(
      previousResults.map(r => [`${r.name}-${r.operation}`, r])
    );

    for (const current of this.results) {
      const key = `${current.name}-${current.operation}`;
      const previous = previousMap.get(key);

      if (previous) {
        const avgDiff = current.avgTime - previous.avgTime;
        const avgPercent = (avgDiff / previous.avgTime) * 100;
        const opsDiff = current.opsPerSecond - previous.opsPerSecond;
        const opsPercent = (opsDiff / previous.opsPerSecond) * 100;

        const status = avgDiff < 0 ? '✅' : '⚠️';
        const diffStr = avgDiff < 0 ? `${formatNumber(Math.abs(avgPercent))}% faster` : `${formatNumber(avgPercent)}% slower`;

        console.log(`${status} ${current.name} - ${current.operation}`);
        console.log(`   ${diffStr} (${formatTime(previous.avgTime)} → ${formatTime(current.avgTime)})`);
        console.log(`   Throughput: ${opsDiff >= 0 ? '+' : ''}${formatNumber(opsPercent)}% (${formatNumber(previous.opsPerSecond)} → ${formatNumber(current.opsPerSecond)} ops/sec)`);
        console.log('');
      }
    }
  }
}

// Run benchmarks if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const benchmark = new PerformanceBenchmark();
  benchmark.runAll().catch(console.error);
}

export default PerformanceBenchmark;
