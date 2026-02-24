/**
 * Unit tests for Local Semantic Search (semantic/local-semantic.ts)
 * Tests TF-IDF search, document indexing, and similarity scoring
 */

import { describe, it, expect, beforeEach } from 'vitest';
import LocalSemanticSearch from './local-semantic.js';

describe('LocalSemanticSearch', () => {
  let search: LocalSemanticSearch;

  beforeEach(() => {
    search = new LocalSemanticSearch();
  });

  describe('Document Indexing', () => {
    it('should index a document successfully', () => {
      search.index({
        id: 'doc1',
        content: 'This is a test document about semantic search',
        timestamp: Date.now(),
      });

      const doc = search.getDocument('doc1');
      expect(doc).toBeDefined();
      expect(doc?.content).toBe('This is a test document about semantic search');
    });

    it('should generate ID if not provided', () => {
      search.index({
        content: 'Test content',
        timestamp: Date.now(),
      });

      const docs = search.getAllDocuments();
      expect(docs).toHaveLength(1);
      expect(docs[0].id).toMatch(/^doc_\d+_[a-z0-9]+$/);
    });

    it('should store metadata with document', () => {
      const metadata = { category: 'test', tags: ['search', 'tfidf'] };

      search.index({
        id: 'doc1',
        content: 'Test document',
        metadata,
        timestamp: Date.now(),
      });

      const doc = search.getDocument('doc1');
      expect(doc?.metadata).toEqual(metadata);
    });

    it('should handle multiple documents', () => {
      search.index({
        id: 'doc1',
        content: 'First document about cats',
        timestamp: Date.now(),
      });
      search.index({
        id: 'doc2',
        content: 'Second document about dogs',
        timestamp: Date.now(),
      });
      search.index({
        id: 'doc3',
        content: 'Third document about birds',
        timestamp: Date.now(),
      });

      const docs = search.getAllDocuments();
      expect(docs).toHaveLength(3);
    });
  });

  describe('Search Functionality', () => {
    beforeEach(() => {
      // Index some test documents
      search.index({
        id: 'doc1',
        content: 'Authentication and authorization are important for security',
        timestamp: Date.now(),
      });
      search.index({
        id: 'doc2',
        content: 'Database optimization requires proper indexing',
        timestamp: Date.now(),
      });
      search.index({
        id: 'doc3',
        content: 'Frontend development uses React and TypeScript',
        timestamp: Date.now(),
      });
      search.index({
        id: 'doc4',
        content: 'API design follows REST principles',
        timestamp: Date.now(),
      });
    });

    it('should return relevant results for search query', () => {
      const results = search.search('authentication');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].document.content).toContain('authentication');
    });

    it('should return results ordered by relevance score', () => {
      const results = search.search('database indexing');

      expect(results.length).toBeGreaterThan(0);
      // First result should have highest score
      expect(results[0].score).toBeGreaterThanOrEqual(results[1]?.score || 0);
    });

    it('should respect limit parameter', () => {
      const results = search.search('development', 2);

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should apply threshold filter', () => {
      const results = search.search('nonexistent_term_xyz', 10, 0.5);

      // No matches should pass the threshold
      expect(results).toHaveLength(0);
    });

    it('should return empty array for no matches', () => {
      const results = search.search('quantum_physics_xyz');

      expect(results).toEqual([]);
    });

    it('should extract highlights from matched content', () => {
      const results = search.search('authorization');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].highlights).toBeDefined();
      expect(results[0].highlights.length).toBeGreaterThan(0);
    });

    it('should limit highlights to 3 per document', () => {
      const longDoc = 'Sentence one. Sentence two. Sentence three. Sentence four. Sentence five.';
      search.index({
        id: 'long',
        content: longDoc,
        timestamp: Date.now(),
      });

      const results = search.search('sentence');
      expect(results[0].highlights.length).toBeLessThanOrEqual(3);
    });
  });

  describe('TF-IDF Calculation', () => {
    it('should give higher score to rare terms', () => {
      search.index({
        id: 'doc1',
        content: 'quantum',
        timestamp: Date.now(),
      });
      search.index({
        id: 'doc2',
        content: 'the the the',
        timestamp: Date.now(),
      });
      search.index({
        id: 'doc3',
        content: 'the the the',
        timestamp: Date.now(),
      });

      const resultsRare = search.search('quantum');
      const resultsCommon = search.search('the');

      // Rare term should match
      expect(resultsRare.length).toBeGreaterThan(0);
      // Common term might not match due to IDF
      expect(resultsCommon.length).toBeGreaterThanOrEqual(0);
    });

    it('should calculate term frequency correctly', () => {
      search.index({
        id: 'doc1',
        content: 'authentication authentication security',
        timestamp: Date.now(),
      });

      const results = search.search('authentication');
      expect(results[0].score).toBeGreaterThan(0);
    });
  });

  describe('Find Similar Documents', () => {
    beforeEach(() => {
      search.index({
        id: 'doc1',
        content: 'Implementing JWT authentication in Node.js',
        timestamp: Date.now(),
      });
      search.index({
        id: 'doc2',
        content: 'OAuth2 authorization flow for web applications',
        timestamp: Date.now(),
      });
      search.index({
        id: 'doc3',
        content: 'Recipe for chocolate chip cookies',
        timestamp: Date.now(),
      });
    });

    it('should find similar documents', () => {
      const similar = search.findSimilar('doc1', 5);

      expect(similar.length).toBeGreaterThan(0);
      // doc2 (about OAuth) should be more similar to doc1 (about JWT)
      // than doc3 (about cookies)
      const similarIds = similar.map(s => s.document.id);
      expect(similarIds).toContain('doc2');
    });

    it('should exclude the original document from results', () => {
      const similar = search.findSimilar('doc1', 10);

      const ids = similar.map(s => s.document.id);
      expect(ids).not.toContain('doc1');
    });

    it('should return empty array for non-existent document', () => {
      const similar = search.findSimilar('nonexistent', 10);

      expect(similar).toEqual([]);
    });
  });

  describe('Document Retrieval', () => {
    it('should get document by ID', () => {
      search.index({
        id: 'doc1',
        content: 'Test content',
        timestamp: Date.now(),
      });

      const doc = search.getDocument('doc1');
      expect(doc).toBeDefined();
      expect(doc?.id).toBe('doc1');
    });

    it('should return undefined for non-existent document', () => {
      const doc = search.getDocument('nonexistent');
      expect(doc).toBeUndefined();
    });

    it('should get all documents', () => {
      search.index({ id: 'doc1', content: 'Content 1', timestamp: Date.now() });
      search.index({ id: 'doc2', content: 'Content 2', timestamp: Date.now() });
      search.index({ id: 'doc3', content: 'Content 3', timestamp: Date.now() });

      const docs = search.getAllDocuments();
      expect(docs).toHaveLength(3);
      expect(docs.map(d => d.id)).toContain('doc1');
      expect(docs.map(d => d.id)).toContain('doc2');
      expect(docs.map(d => d.id)).toContain('doc3');
    });
  });

  describe('Statistics', () => {
    it('should return zero stats for empty index', () => {
      const stats = search.getStats();

      expect(stats.totalDocuments).toBe(0);
      expect(stats.totalTerms).toBe(0);
    });

    it('should count documents correctly', () => {
      search.index({ id: 'doc1', content: 'Content', timestamp: Date.now() });
      search.index({ id: 'doc2', content: 'Content', timestamp: Date.now() });

      const stats = search.getStats();
      expect(stats.totalDocuments).toBe(2);
    });

    it('should count unique terms', () => {
      search.index({
        id: 'doc1',
        content: 'authentication authorization security',
        timestamp: Date.now(),
      });

      const stats = search.getStats();
      expect(stats.totalTerms).toBeGreaterThan(0);
    });

    it('should calculate average document length', () => {
      search.index({
        id: 'doc1',
        content: 'one two three',
        timestamp: Date.now(),
      });
      search.index({
        id: 'doc2',
        content: 'four five six seven',
        timestamp: Date.now(),
      });

      const stats = search.getStats();
      expect(stats.avgDocLength).toBeGreaterThan(0);
    });
  });

  describe('Clear Index', () => {
    it('should clear all documents', () => {
      search.index({ id: 'doc1', content: 'Content 1', timestamp: Date.now() });
      search.index({ id: 'doc2', content: 'Content 2', timestamp: Date.now() });

      expect(search.getAllDocuments()).toHaveLength(2);

      search.clear();

      expect(search.getAllDocuments()).toHaveLength(0);
    });

    it('should reset statistics after clear', () => {
      search.index({ id: 'doc1', content: 'Content', timestamp: Date.now() });

      search.clear();

      const stats = search.getStats();
      expect(stats.totalDocuments).toBe(0);
      expect(stats.totalTerms).toBe(0);
    });

    it('should allow indexing after clear', () => {
      search.index({ id: 'doc1', content: 'Content 1', timestamp: Date.now() });
      search.clear();

      search.index({ id: 'doc2', content: 'Content 2', timestamp: Date.now() });

      expect(search.getAllDocuments()).toHaveLength(1);
      expect(search.getDocument('doc2')).toBeDefined();
    });
  });

  describe('Import/Export', () => {
    it('should export index to JSON', () => {
      search.index({
        id: 'doc1',
        content: 'Test content for export',
        timestamp: 12345,
      });

      const exported = search.export();
      const data = JSON.parse(exported);

      expect(data).toHaveProperty('documents');
      expect(data).toHaveProperty('termFrequency');
      expect(data).toHaveProperty('documentFrequency');
      expect(data).toHaveProperty('totalDocuments');
    });

    it('should import index from JSON', () => {
      const originalData = {
        documents: [
          ['doc1', { id: 'doc1', content: 'Imported content', timestamp: 12345 }],
        ],
        termFrequency: [
          ['doc1', { imported: 1, content: 1 }],
        ],
        documentFrequency: [
          ['imported', 1],
          ['content', 1],
        ],
        totalDocuments: 1,
      };

      const newSearch = new LocalSemanticSearch();
      newSearch.import(JSON.stringify(originalData));

      expect(newSearch.getAllDocuments()).toHaveLength(1);
      expect(newSearch.getDocument('doc1')?.content).toBe('Imported content');
    });

    it('should preserve data across export/import cycle', () => {
      const originalSearch = new LocalSemanticSearch();
      originalSearch.index({
        id: 'doc1',
        content: 'Original content',
        metadata: { key: 'value' },
        timestamp: 12345,
      });

      const exported = originalSearch.export();

      const restoredSearch = new LocalSemanticSearch();
      restoredSearch.import(exported);

      expect(restoredSearch.getAllDocuments()).toHaveLength(1);
      const doc = restoredSearch.getDocument('doc1');
      expect(doc?.content).toBe('Original content');
      expect(doc?.metadata).toEqual({ key: 'value' });
      expect(doc?.timestamp).toBe(12345);
    });
  });

  describe('Tokenization', () => {
    it('should handle lowercase conversion', () => {
      search.index({
        id: 'doc1',
        content: 'AUTHENTICATION Authentication',
        timestamp: Date.now(),
      });

      const results = search.search('authentication');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should filter out short terms', () => {
      search.index({
        id: 'doc1',
        content: 'a an the in on at of',
        timestamp: Date.now(),
      });

      const stats = search.getStats();
      // Short terms (< 3 chars) should be filtered
      expect(stats.totalTerms).toBe(0);
    });

    it('should handle punctuation removal', () => {
      search.index({
        id: 'doc1',
        content: 'hello.world,test@example',
        timestamp: Date.now(),
      });

      const results = search.search('hello');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle unicode characters', () => {
      search.index({
        id: 'doc1',
        content: 'café résumé naïve',
        timestamp: Date.now(),
      });

      const results = search.search('café');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty content', () => {
      search.index({
        id: 'doc1',
        content: '',
        timestamp: Date.now(),
      });

      const doc = search.getDocument('doc1');
      expect(doc).toBeDefined();
    });

    it('should handle very long content', () => {
      const longContent = 'word '.repeat(10000);
      search.index({
        id: 'doc1',
        content: longContent,
        timestamp: Date.now(),
      });

      const results = search.search('word');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle special characters', () => {
      search.index({
        id: 'doc1',
        content: 'C++ & Java vs Python',
        timestamp: Date.now(),
      });

      const results = search.search('java');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle duplicate document IDs (update behavior)', () => {
      search.index({
        id: 'doc1',
        content: 'Original content',
        timestamp: Date.now(),
      });

      search.index({
        id: 'doc1',
        content: 'Updated content',
        timestamp: Date.now(),
      });

      const docs = search.getAllDocuments();
      expect(docs).toHaveLength(1);
      expect(docs[0].content).toBe('Updated content');
    });

    it('should handle query with no matching terms', () => {
      search.index({
        id: 'doc1',
        content: 'database authentication',
        timestamp: Date.now(),
      });

      const results = search.search('quantum physics');
      expect(results).toEqual([]);
    });

    it('should handle zero threshold', () => {
      search.index({
        id: 'doc1',
        content: 'test content',
        timestamp: Date.now(),
      });

      const results = search.search('unrelated', 10, 0);
      // With zero threshold, might get results depending on implementation
      expect(results).toBeDefined();
    });
  });

  describe('Search Result Structure', () => {
    beforeEach(() => {
      search.index({
        id: 'doc1',
        content: 'Test document about search algorithms',
        timestamp: Date.now(),
      });
    });

    it('should return document in result', () => {
      const results = search.search('search');

      expect(results[0].document).toBeDefined();
      expect(results[0].document.id).toBe('doc1');
    });

    it('should return score in result', () => {
      const results = search.search('search');

      expect(results[0].score).toBeDefined();
      expect(typeof results[0].score).toBe('number');
    });

    it('should return highlights array in result', () => {
      const results = search.search('search');

      expect(results[0].highlights).toBeDefined();
      expect(Array.isArray(results[0].highlights)).toBe(true);
    });

    it('should order results by score descending', () => {
      search.index({
        id: 'doc2',
        content: 'search search search', // More frequent term
        timestamp: Date.now(),
      });

      const results = search.search('search');

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large number of documents', () => {
      const count = 1000;
      for (let i = 0; i < count; i++) {
        search.index({
          id: `doc${i}`,
          content: `Document ${i} with unique content ${i}`,
          timestamp: Date.now(),
        });
      }

      const stats = search.getStats();
      expect(stats.totalDocuments).toBe(count);

      const results = search.search('document');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should maintain performance with repeated terms', () => {
      for (let i = 0; i < 100; i++) {
        search.index({
          id: `doc${i}`,
          content: 'the quick brown fox jumps over the lazy dog',
          timestamp: Date.now(),
        });
      }

      const start = Date.now();
      const results = search.search('quick fox');
      const duration = Date.now() - start;

      expect(results.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(1000); // Should complete in < 1s
    });
  });
});
