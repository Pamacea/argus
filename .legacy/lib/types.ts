/**
 * Core type definitions for ARGUS
 */

/**
 * Observation types for categorizing stored knowledge
 */
export type ObservationType =
  | 'solution'      // Working solutions to problems
  | 'pattern'       // Code patterns and conventions
  | 'decision'      // Technical decisions with rationale
  | 'command'       // CLI commands and workflows
  | 'file'          // File locations and purposes
  | 'error'         // Errors encountered and fixes
  | 'best-practice' // Best practices and guidelines
  | 'workflow'      // Development workflows

/**
 * A stored observation/memory in ARGUS
 */
export interface Observation {
  id: number
  type: ObservationType
  content: string
  embedding?: Float32Array
  tags: string[]
  metadata: Record<string, unknown>
  timestamp: Date
  projectId?: string
}

/**
 * Vector embedding representation
 */
export interface VectorEmbedding {
  vector: Float32Array
  dimensions: number
  model: string
}

/**
 * Search result with similarity score
 */
export interface SearchResult extends Observation {
  score: number
  highlight?: string
}

/**
 * Search query options
 */
export interface SearchOptions {
  limit?: number
  threshold?: number
  type?: ObservationType
  tags?: string[]
  dateRange?: {
    start: Date
    end: Date
  }
  hybrid?: boolean // Combine semantic + keyword search
}

/**
 * ARGUS configuration
 */
export interface ArgusConfig {
  storage: StorageConfig
  retrieval: RetrievalConfig
  embedding: EmbeddingConfig
  hooks: HooksConfig
}

/**
 * Storage configuration
 */
export interface StorageConfig {
  path: string
  maxSize: string // e.g., "100MB"
  retention: string // e.g., "90d"
  compression: boolean
}

/**
 * Retrieval configuration
 */
export interface RetrievalConfig {
  maxResults: number
  similarityThreshold: number
  hybridSearch: boolean
  cacheResults: boolean
  cacheTTL: number // seconds
}

/**
 * Embedding configuration
 */
export interface EmbeddingConfig {
  model: 'local' | 'openai' | 'cohere'
  dimensions: number
  batchSize: number
}

/**
 * Hooks configuration
 */
export interface HooksConfig {
  autoLearn: boolean
  captureCode: boolean
  captureCommands: boolean
  captureResponses: boolean
  sanitizeSecrets: boolean
}

/**
 * Tool execution context for hooks
 */
export interface ToolContext {
  toolName: string
  args: Record<string, unknown>
  cwd: string
  timestamp: Date
}

/**
 * Tool result for learning
 */
export interface ToolResult {
  success: boolean
  output?: string
  error?: string
  duration: number
}
