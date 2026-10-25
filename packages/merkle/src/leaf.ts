import { createHash, randomBytes } from 'crypto';
import { AttendanceLeafPayload } from '@gateflow/shared-types';
import { canonicalJson } from './canonical';

/**
 * Generate a cryptographically secure random salt (32 bytes hex).
 */
export function generateSalt(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Computes a salted leaf hash:
 * leaf = SHA-256( canonical_json({ employee_ref, site_id, type, timestamp, nonce }) || salt )
 */
export function hashLeaf(
  payload: AttendanceLeafPayload,
  saltHex: string
): string {
  const canonicalString = canonicalJson({
    employee_ref: payload.employee_ref,
    nonce: payload.nonce,
    site_id: payload.site_id,
    timestamp: payload.timestamp,
    type: payload.type,
  });

  const canonicalBuffer = Buffer.from(canonicalString, 'utf8');
  const saltBuffer = Buffer.from(saltHex, 'hex');

  const combined = Buffer.concat([canonicalBuffer, saltBuffer]);
  return createHash('sha256').update(combined).digest('hex');
}
