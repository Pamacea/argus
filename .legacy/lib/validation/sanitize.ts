/**
 * Input sanitization and security
 */

/**
 * Sanitize text to remove sensitive information
 */
export function sanitizeText(text: string): string {
  // Remove potential secrets
  let sanitized = text
  
  // Remove API keys
  sanitized = sanitized.replace(/(['"]?api[_-]?key['"]?\s*[:=]\s*['"])[\w-]+(['"])/gi, '$1***$2')
  
  // Remove tokens
  sanitized = sanitized.replace(/(['"]?(?:bearer\s+)?token['"]?\s*[:=]\s*['"])[\w.-]+(['"])/gi, '$1***$2')
  
  // Remove passwords
  sanitized = sanitized.replace(/(['"]?password['"]?\s*[:=]\s*['"])[^'"\s]+(['"])/gi, '$1***$2')
  
  return sanitized
}

/**
 * Sanitize file paths
 */
export function sanitizePath(path: string): string {
  // Remove directory traversal attempts
  return path.replace(/\.\./g, '').replace(/[<>:"|?*]/g, '')
}

/**
 * Validate observation type
 */
export function isValidType(type: string): boolean {
  const validTypes = ['solution', 'pattern', 'decision', 'command', 'file', 'error', 'best-practice', 'workflow']
  return validTypes.includes(type)
}
