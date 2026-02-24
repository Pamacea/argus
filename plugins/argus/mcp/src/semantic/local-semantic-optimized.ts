/**
 * Optimized Local Semantic Search Engine
 *
 * Performance Improvements:
 * - Pre-computed term frequencies
 * - Incremental index updates
 * - Efficient token caching
 * - Optimized similarity calculation
 * - Memory-efficient storage
 */

interface Document {
  id: string;
  content: string;
  metadata?: Record<string, any>;
  timestamp: number;
}

interface SearchResult {
  document: Document;
  score: number;
  highlights: string[];
}

interface TermInfo {
  tf: number; // Term frequency in document
  positions: number[]; // Word positions for phrase search
}

interface PrecomputedData {
  documents: Map<string, Document>;
  termFrequency: Map<string, Map<string, TermInfo>>;
  documentFrequency: Map<string, number>;
  totalDocuments: number;
  avgDocLength: number;
}

export class OptimizedLocalSemanticSearch {
  private documents: Map<string, Document> = new Map();
  private termFrequency: Map<string, Map<string, TermInfo>> = new Map();
  private documentFrequency: Map<string, number> = new Map();
  private totalDocuments = 0;
  private avgDocLength = 0;

  // Token cache for tokenized text
  private tokenCache: Map<string, string[]> = new Map();
  private readonly MAX_TOKEN_CACHE = 1000;

  // Pre-computed IDF values
  private idfCache: Map<string, number> = new Map();

  // Common stop words to filter
  private readonly STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that',
    'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they'
  ]);

  /**
   * Tokenize text into terms with caching
   */
  private tokenize(text: string, useCache = true): string[] {
    // Check cache first
    const cacheKey = text.substring(0, 100); // Cache by first 100 chars
    if (useCache && this.tokenCache.has(cacheKey)) {
      return this.tokenCache.get(cacheKey)!;
    }

    const terms = text
      .toLowerCase()
      .replace(/[^\w\s\u00C0-\u017F]/g, ' ')
      .split(/\s+/)
      .filter(term => term.length > 2 && !this.STOP_WORDS.has(term));

    // Cache result
    if (useCache) {
      // Enforce cache size limit
      if (this.tokenCache.size >= this.MAX_TOKEN_CACHE) {
        const firstKey = this.tokenCache.keys().next().value;
        this.tokenCache.delete(firstKey);
      }
      this.tokenCache.set(cacheKey, terms);
    }

    return terms;
  }

  /**
   * Calculate IDF with caching
   */
  private calculateIDF(term: string): number {
    if (this.idfCache.has(term)) {
      return this.idfCache.get(term)!;
    }

    const df = this.documentFrequency.get(term) || 0;
    const idf = df > 0 ? Math.log((this.totalDocuments + 1) / (df + 1)) + 1 : 0;

    this.idfCache.set(term, idf);
    return idf;
  }

  /**
   * Calculate TF-IDF score for a term in a document
   */
  private calculateTFIDF(term: string, docId: string): number {
    const termInfo = this.termFrequency.get(docId)?.get(term);
    if (!termInfo) return 0;

    const tf = 1 + Math.log(termInfo.tf); // Log normalization
    const idf = this.calculateIDF(term);
    return tf * idf;
  }

  /**
   * Add a document to the search index (optimized)
   */
  index(doc: Document): void {
    const id = doc.id || this.generateId();
    const document: Document = { ...doc, id };

    // Check if document already exists
    const exists = this.documents.has(id);
    this.documents.set(id, document);

    // Tokenize and calculate term frequency with positions
    const terms = this.tokenize(document.content, !exists); // Don't use cache for re-indexing
    const tfMap = new Map<string, TermInfo>();

    // Update document frequency
    const existingTerms = this.termFrequency.get(id) || new Map();

    terms.forEach((term, position) => {
      const termInfo = tfMap.get(term) || { tf: 0, positions: [] };
      termInfo.tf++;
      termInfo.positions.push(position);
      tfMap.set(term, termInfo);

      // Update document frequency (only count once per document)
      if (!existingTerms.has(term)) {
        const df = this.documentFrequency.get(term) || 0;
        this.documentFrequency.set(term, df + 1);
        // Invalidate IDF cache
        this.idfCache.delete(term);
      }
    });

    // Remove old term frequencies for this document
    for (const oldTerm of existingTerms.keys()) {
      if (!tfMap.has(oldTerm)) {
        const df = this.documentFrequency.get(oldTerm) || 0;
        if (df <= 1) {
          this.documentFrequency.delete(oldTerm);
        } else {
          this.documentFrequency.set(oldTerm, df - 1);
        }
        this.idfCache.delete(oldTerm);
      }
    }

    this.termFrequency.set(id, tfMap);

    if (!exists) {
      this.totalDocuments++;
      this.updateAvgDocLength();
    }
  }

  /**
   * Update average document length
   */
  private updateAvgDocLength(): void {
    if (this.totalDocuments === 0) {
      this.avgDocLength = 0;
      return;
    }

    let totalLength = 0;
    for (const doc of this.documents.values()) {
      const terms = this.tokenize(doc.content, false);
      totalLength += terms.length;
    }
    this.avgDocLength = totalLength / this.totalDocuments;
  }

  /**
   * Optimized search with early termination
   */
  search(query: string, limit = 10, threshold = 0.1): SearchResult[] {
    const queryTerms = this.tokenize(query, false);
    if (queryTerms.length === 0) return [];

    const scores: Map<string, { score: number; matches: number }> = new Map();

    // Pre-compute query IDF values
    const queryIDF = new Map<string, number>();
    for (const term of queryTerms) {
      queryIDF.set(term, this.calculateIDF(term));
    }

    // Calculate scores for each document
    for (const [docId] of this.documents) {
      let score = 0;
      let matchedTerms = 0;

      for (const term of queryTerms) {
        const termInfo = this.termFrequency.get(docId)?.get(term);
        if (termInfo) {
          const tf = 1 + Math.log(termInfo.tf);
          const idf = queryIDF.get(term) || 0;
          score += tf * idf;
          matchedTerms++;
        }
      }

      // Normalize by query length and document length
      if (queryTerms.length > 0 && this.avgDocLength > 0) {
        const docLength = this.termFrequency.get(docId)?.size || 1;
        const normalization = Math.sqrt(queryTerms.length) * Math.sqrt(docLength);
        score = score / normalization;
      }

      if (score >= threshold && matchedTerms > 0) {
        scores.set(docId, { score, matches: matchedTerms });
      }
    }

    // Sort by score and return top results
    const results = Array.from(scores.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, limit)
      .map(([docId, { score }]) => {
        const document = this.documents.get(docId)!;
        const highlights = this.extractHighlights(document.content, queryTerms);

        return { document, score, highlights };
      });

    return results;
  }

  /**
   * Extract relevant highlights (optimized)
   */
  private extractHighlights(content: string, queryTerms: string[]): string[] {
    const highlights: string[] = [];
    const sentences = content.split(/[.!?]+/);

    // Create a set for faster lookup
    const queryTermSet = new Set(queryTerms);

    for (const sentence of sentences) {
      const lowerSentence = sentence.toLowerCase();
      const terms = this.tokenize(sentence, false);
      const matchedTerms = terms.filter(term => queryTermSet.has(term));

      if (matchedTerms.length > 0) {
        highlights.push(sentence.trim());
      }

      if (highlights.length >= 3) break;
    }

    return highlights;
  }

  /**
   * Batch index multiple documents
   */
  batchIndex(documents: Document[]): void {
    for (const doc of documents) {
      this.index(doc);
    }
  }

  /**
   * Find similar documents (optimized)
   */
  findSimilar(docId: string, limit = 5): SearchResult[] {
    const doc = this.documents.get(docId);
    if (!doc) return [];

    return this.search(doc.content, limit, 0.05)
      .filter(result => result.document.id !== docId);
  }

  /**
   * Get document by ID
   */
  getDocument(id: string): Document | undefined {
    return this.documents.get(id);
  }

  /**
   * Get all documents
   */
  getAllDocuments(): Document[] {
    return Array.from(this.documents.values());
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      totalDocuments: this.totalDocuments,
      totalTerms: this.documentFrequency.size,
      avgDocLength: this.avgDocLength,
      cacheSize: this.tokenCache.size,
      idfCacheSize: this.idfCache.size
    };
  }

  /**
   * Clear index and caches
   */
  clear(): void {
    this.documents.clear();
    this.termFrequency.clear();
    this.documentFrequency.clear();
    this.tokenCache.clear();
    this.idfCache.clear();
    this.totalDocuments = 0;
    this.avgDocLength = 0;
  }

  /**
   * Remove document from index
   */
  removeDocument(id: string): boolean {
    const doc = this.documents.get(id);
    if (!doc) return false;

    // Remove term frequencies
    const termMap = this.termFrequency.get(id);
    if (termMap) {
      for (const term of termMap.keys()) {
        const df = this.documentFrequency.get(term) || 0;
        if (df <= 1) {
          this.documentFrequency.delete(term);
        } else {
          this.documentFrequency.set(term, df - 1);
        }
        this.idfCache.delete(term);
      }
      this.termFrequency.delete(id);
    }

    // Remove document
    this.documents.delete(id);
    this.totalDocuments--;
    this.updateAvgDocLength();

    return true;
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Export index to JSON (optimized)
   */
  export(): string {
    const data: PrecomputedData = {
      documents: this.documents,
      termFrequency: this.termFrequency,
      documentFrequency: this.documentFrequency,
      totalDocuments: this.totalDocuments,
      avgDocLength: this.avgDocLength
    };

    return JSON.stringify({
      ...data,
      termFrequency: Array.from(this.termFrequency.entries()).map(([docId, terms]) => [
        docId,
        Array.from(terms.entries())
      ]),
      documents: Array.from(this.documents.entries())
    });
  }

  /**
   * Import index from JSON (optimized)
   */
  import(data: string): void {
    try {
      const parsed = JSON.parse(data);

      this.documents = new Map(parsed.documents);
      this.termFrequency = new Map(
        (parsed.termFrequency || []).map(([docId, terms]: [string, any[]]) => [
          docId,
          new Map(terms.map(([term, info]: [string, any]) => [term, info]))
        ])
      );
      this.documentFrequency = new Map(parsed.documentFrequency || []);
      this.totalDocuments = parsed.totalDocuments || 0;
      this.avgDocLength = parsed.avgDocLength || 0;

      // Rebuild caches
      this.tokenCache.clear();
      this.idfCache.clear();
    } catch (error) {
      console.error('Failed to import index:', error);
    }
  }

  /**
   * Optimize index by cleaning up unused data
   */
  optimize(): void {
    // Clear token cache
    this.tokenCache.clear();

    // Clear IDF cache (will be rebuilt on demand)
    this.idfCache.clear();

    // Update statistics
    this.updateAvgDocLength();
  }
}

export default OptimizedLocalSemanticSearch;
