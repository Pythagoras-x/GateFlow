import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor() {
    const rawKey =
      process.env.PII_ENCRYPTION_KEY ||
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    this.key = Buffer.from(rawKey.slice(0, 64), 'hex');
  }

  /**
   * Encrypt plaintext string using AES-256-GCM.
   * Returns format: `${ivHex}:${authTagHex}:${ciphertextHex}`
   */
  public encrypt(plaintext: string): string {
    if (!plaintext) return '';
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt AES-256-GCM encrypted string.
   */
  public decrypt(ciphertextWithMetadata: string): string {
    if (!ciphertextWithMetadata) return '';
    const parts = ciphertextWithMetadata.split(':');
    if (parts.length !== 3) {
      // Return raw string if not matching encrypted format
      return ciphertextWithMetadata;
    }

    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
