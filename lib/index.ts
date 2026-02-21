/**
 * ARGUS - Advanced RAG-powered Guardian and Utilization System
 *
 * Main library exports for the ARGUS plugin.
 */

// Storage exports
export * from './storage/config.js'
export * from './storage/database.js'
export * from './storage/vector.js'

// RAG exports
export * from './rag/embedder.js'
export * from './rag/retriever.js'
export * from './rag/ranker.js'

// Validation exports
export * from './validation/sanitize.js'
export * from './validation/schema.js'

// Types
export type {
  Observation,
  ObservationType,
  VectorEmbedding,
  SearchResult,
  ArgusConfig,
  StorageConfig,
  RetrievalConfig,
} from './types.js'
