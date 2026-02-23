/**
 * Local Semantic Search Engine
 *
 * Provides TF-IDF based semantic search without requiring external dependencies.
 * This is a lightweight alternative to Qdrant for local semantic search.
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

export class LocalSemanticSearch {
  private documents: Map<string, Document> = new Map();
  private termFrequency: Map<string, Map<string, number>> = new Map();
  private documentFrequency: Map<string, number> = new Map();
  private totalDocuments = 0;

  /**
   * Tokenize text into terms
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s\u00C0-\u017F]/g, ' ') // Keep unicode chars
      .split(/\s+/)
      .filter(term => term.length > 2); // Ignore short terms
  }

  /**
   * Calculate TF-IDF score for a term in a document
   */
  private calculateTFIDF(term: string, docId: string): number {
    const tf = this.termFrequency.get(docId)?.get(term) || 0;
    const df = this.documentFrequency.get(term) || 0;
    const idf = df > 0 ? Math.log(this.totalDocuments / df) : 0;
    return tf * idf;
  }

  /**
   * Add a document to the search index
   */
  index(doc: Document): void {
    const id = doc.id || this.generateId();
    const document: Document = { ...doc, id };

    this.documents.set(id, document);
    this.totalDocuments++;

    // Tokenize and calculate term frequency
    const terms = this.tokenize(document.content);
    const tfMap = new Map<string, number>();

    terms.forEach(term => {
      const count = (tfMap.get(term) || 0) + 1;
      tfMap.set(term, count);

      // Update document frequency
      const df = this.documentFrequency.get(term) || 0;
      if (df === 0) {
        this.documentFrequency.set(term, 1);
      }
    });

    this.termFrequency.set(id, tfMap);
  }

  /**
   * Search for similar documents
   */
  search(query: string, limit = 10, threshold = 0.1): SearchResult[] {
    const queryTerms = this.tokenize(query);
    const scores: Map<string, number> = new Map();

    // Calculate scores for each document
    for (const [docId] of this.documents) {
      let score = 0;
      let matchedTerms = 0;

      for (const term of queryTerms) {
        const tfidf = this.calculateTFIDF(term, docId);
        if (tfidf > 0) {
          score += tfidf;
          matchedTerms++;
        }
      }

      // Normalize by query length
      if (queryTerms.length > 0) {
        score = score / queryTerms.length;
      }

      if (score >= threshold && matchedTerms > 0) {
        scores.set(docId, score);
      }
    }

    // Sort by score and return top results
    const results = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([docId, score]) => {
        const document = this.documents.get(docId)!;
        const highlights = this.extractHighlights(document.content, queryTerms);

        return { document, score, highlights };
      });

    return results;
  }

  /**
   * Extract relevant highlights from content
   */
  private extractHighlights(content: string, queryTerms: string[]): string[] {
    const highlights: string[] = [];
    const sentences = content.split(/[.!?]+/);

    for (const sentence of sentences) {
      const lowerSentence = sentence.toLowerCase();
      const matchedTerms = queryTerms.filter(term =>
        lowerSentence.includes(term)
      );

      if (matchedTerms.length > 0) {
        highlights.push(sentence.trim());
      }

      if (highlights.length >= 3) break;
    }

    return highlights;
  }

  /**
   * Find similar documents to a given document
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
      avgDocLength: Array.from(this.termFrequency.values())
        .reduce((sum, tf) => sum + Array.from(tf.values()).reduce((a, b) => a + b, 0), 0) / this.totalDocuments
    };
  }

  /**
   * Clear index
   */
  clear(): void {
    this.documents.clear();
    this.termFrequency.clear();
    this.documentFrequency.clear();
    this.totalDocuments = 0;
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Export index to JSON
   */
  export(): string {
    return JSON.stringify({
      documents: Array.from(this.documents.entries()),
      termFrequency: Array.from(this.termFrequency.entries()),
      documentFrequency: Array.from(this.documentFrequency.entries()),
      totalDocuments: this.totalDocuments
    });
  }

  /**
   * Import index from JSON
   */
  import(data: string): void {
    const parsed = JSON.parse(data);
    this.documents = new Map(parsed.documents);
    this.termFrequency = new Map(parsed.termFrequency.map(([k, v]: [string, any]) => [k, new Map(Object.entries(v))]));
    this.documentFrequency = new Map(parsed.documentFrequency);
    this.totalDocuments = parsed.totalDocuments;
  }
}

export default LocalSemanticSearch;
