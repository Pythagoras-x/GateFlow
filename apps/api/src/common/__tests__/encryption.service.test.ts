import { describe, it, expect } from 'vitest';
import { EncryptionService } from '../encryption.service';

describe('EncryptionService', () => {
  const service = new EncryptionService();

  it('encrypts and decrypts strings correctly with AES-256-GCM', () => {
    const sensitiveData = 'Alice Johnson +1-555-0199 alice@corp.example';
    const encrypted = service.encrypt(sensitiveData);

    expect(encrypted).not.toBe(sensitiveData);
    expect(encrypted.split(':')).toHaveLength(3); // iv:authTag:ciphertext

    const decrypted = service.decrypt(encrypted);
    expect(decrypted).toBe(sensitiveData);
  });

  it('produces different ciphertexts for the same plaintext due to random IVs', () => {
    const sensitiveData = 'Secret Employee Name';
    const enc1 = service.encrypt(sensitiveData);
    const enc2 = service.encrypt(sensitiveData);

    expect(enc1).not.toBe(enc2);
    expect(service.decrypt(enc1)).toBe(sensitiveData);
    expect(service.decrypt(enc2)).toBe(sensitiveData);
  });

  it('fails decryption or throws when ciphertext or auth tag is corrupted', () => {
    const encrypted = service.encrypt('Sensitive Data');
    const parts = encrypted.split(':');
    // Tamper with ciphertext
    const tampered = `${parts[0]}:${parts[1]}:bad${parts[2].slice(3)}`;

    expect(() => service.decrypt(tampered)).toThrow();
  });
});
