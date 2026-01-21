/**
 * Generate a unique peer ID using cryptographically secure random values
 * @param prefix - Optional prefix for the peer ID (default: 'peer')
 * @returns Unique peer ID in format: prefix-uuid
 *
 * @example
 * ```typescript
 * const peerId = generatePeerId(); // "peer-550e8400-e29b-41d4-a716-446655440000"
 * const customId = generatePeerId('session'); // "session-550e8400-e29b-41d4-a716-446655440000"
 * ```
 */
export function generatePeerId(prefix = 'peer'): string {
  // Use crypto.randomUUID() for cryptographically secure random generation
  // Falls back to crypto.getRandomValues() for environments without randomUUID
  const uuid = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : generateFallbackUUID();
  return `${prefix}-${uuid}`;
}

/**
 * Fallback UUID generator using crypto.getRandomValues()
 * Used when crypto.randomUUID() is not available
 */
function generateFallbackUUID(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // Set version (4) and variant bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
