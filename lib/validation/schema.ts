/**
 * Type validation using Zod-like schema
 */

import type { Observation, ObservationType } from '../types.js'

/**
 * Validate observation data
 */
export function validateObservation(data: unknown): { valid: boolean; errors?: string[] } {
  const errors: string[] = []
  
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Data must be an object'] }
  }
  
  const obs = data as Partial<Observation>
  
  if (!obs.type || typeof obs.type !== 'string') {
    errors.push('type is required and must be a string')
  }
  
  if (!obs.content || typeof obs.content !== 'string') {
    errors.push('content is required and must be a string')
  }
  
  if (!Array.isArray(obs.tags)) {
    errors.push('tags must be an array')
  }
  
  if (typeof obs.metadata !== 'object' || obs.metadata === null) {
    errors.push('metadata must be an object')
  }
  
  return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined }
}
