/**
 * Storage configuration management
 */

import type { ArgusConfig, StorageConfig } from '../types.js'

const DEFAULT_CONFIG: ArgusConfig = {
  storage: {
    path: '.argus/memory.db',
    maxSize: '100MB',
    retention: '90d',
    compression: true,
  },
  retrieval: {
    maxResults: 10,
    similarityThreshold: 0.7,
    hybridSearch: true,
    cacheResults: true,
    cacheTTL: 3600,
  },
  embedding: {
    model: 'local',
    dimensions: 384,
    batchSize: 32,
  },
  hooks: {
    autoLearn: true,
    captureCode: true,
    captureCommands: true,
    captureResponses: true,
    sanitizeSecrets: true,
  },
}

let currentConfig: ArgusConfig = DEFAULT_CONFIG

export function getConfig(): ArgusConfig {
  return { ...currentConfig }
}

export function updateConfig(updates: Partial<ArgusConfig>): ArgusConfig {
  currentConfig = { ...currentConfig, ...updates }
  return getConfig()
}

export function resetConfig(): void {
  currentConfig = DEFAULT_CONFIG
}
