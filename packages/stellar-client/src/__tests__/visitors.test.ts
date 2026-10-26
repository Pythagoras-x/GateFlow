import { describe, it, expect, beforeEach } from 'vitest';
import { MockStellarClient } from '../mock-stellar-client';
import { StellarClient } from '../stellar-client';
import { stringToBytes32 } from '../utils';

describe('Stellar Client - Visitor Pass Management', () => {
  let mockClient: MockStellarClient;
  let sdkClient: StellarClient;

  beforeEach(async () => {
    mockClient = new MockStellarClient({ useMock: true });
    sdkClient = new StellarClient({ useMock: true });
  });

  it('manages full lifecycle: issue -> verify -> enter -> exit', async () => {
    const siteId = stringToBytes32('site-hq');
    await sdkClient.registerSite(siteId);

    const passId = stringToBytes32('pass-001');
    const passHash = stringToBytes32('hash-001');
    const now = Math.floor(Date.now() / 1000);
    const validFrom = now - 60; // 1 min ago
    const validUntil = now + 3600; // 1 hr later

    // Initial check: pass does not exist
    expect(await sdkClient.verifyPass(passId)).toBeNull();

    // Issue pass
    const tx = await sdkClient.issuePass(passId, passHash, siteId, validFrom, validUntil);
    expect(tx).toHaveLength(64);

    // Verify pass is Active
    const passData = await sdkClient.verifyPass(passId);
    expect(passData).not.toBeNull();
    expect(passData!.status).toBe('Active');
    expect(passData!.siteId).toBe(siteId);

    // Record Entry
    const entryTx = await sdkClient.recordEntry(passId);
    expect(entryTx).toHaveLength(64);

    const enteredPass = await sdkClient.verifyPass(passId);
    expect(enteredPass!.status).toBe('Entered');
    expect(enteredPass!.entryTime).toBeGreaterThan(0);

    // Record Exit
    const exitTx = await sdkClient.recordExit(passId);
    expect(exitTx).toHaveLength(64);

    const exitedPass = await sdkClient.verifyPass(passId);
    expect(exitedPass!.status).toBe('Exited');
    expect(exitedPass!.exitTime).toBeGreaterThan(0);
  });

  it('rejects pass issuance for unregistered sites', async () => {
    const siteId = stringToBytes32('unregistered-site');
    const passId = stringToBytes32('pass-002');
    const passHash = stringToBytes32('hash-002');

    await expect(
      sdkClient.issuePass(passId, passHash, siteId, 1000, 2000)
    ).rejects.toThrow('Site not registered on-chain');
  });

  it('rejects pass issuance with invalid validity time range', async () => {
    const siteId = stringToBytes32('site-valid-time');
    await sdkClient.registerSite(siteId);

    const passId = stringToBytes32('pass-003');
    const passHash = stringToBytes32('hash-003');

    await expect(
      sdkClient.issuePass(passId, passHash, siteId, 2000, 1000)
    ).rejects.toThrow('Invalid validity period');
  });

  it('handles pass revocation and rejects entry on revoked pass', async () => {
    const siteId = stringToBytes32('site-revocation');
    await sdkClient.registerSite(siteId);

    const passId = stringToBytes32('pass-004');
    const passHash = stringToBytes32('hash-004');
    const now = Math.floor(Date.now() / 1000);

    await sdkClient.issuePass(passId, passHash, siteId, now - 60, now + 3600);

    // Revoke
    await sdkClient.revokePass(passId);
    const pass = await sdkClient.verifyPass(passId);
    expect(pass!.status).toBe('Revoked');

    // Attempted entry must fail
    await expect(sdkClient.recordEntry(passId)).rejects.toThrow('Pass has been revoked');
  });

  it('rejects entry if current time is outside validity window', async () => {
    const siteId = stringToBytes32('site-expired');
    await sdkClient.registerSite(siteId);

    const passId = stringToBytes32('pass-005');
    const passHash = stringToBytes32('hash-005');
    const now = Math.floor(Date.now() / 1000);

    // Expired pass
    await sdkClient.issuePass(passId, passHash, siteId, now - 3600, now - 1800);
    await expect(sdkClient.recordEntry(passId)).rejects.toThrow('Pass has expired');
  });
});
