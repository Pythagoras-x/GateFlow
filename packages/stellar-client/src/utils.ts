import { createHash } from 'crypto';

/**
 * Converts any string (like a site uuid or slug) to a 32-byte hex hash.
 */
export function stringToBytes32(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Normalizes a hex string to 32 bytes (64 hex characters), padding if necessary.
 */
export function normalizeBytes32Hex(hex: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length > 64) {
    return clean.slice(0, 64);
  }
  return clean.padStart(64, '0');
}

/**
 * Converts a 32-byte hex string to a Buffer.
 */
export function hexToBytes(hex: string): Buffer {
  const normalized = normalizeBytes32Hex(hex);
  return Buffer.from(normalized, 'hex');
}
