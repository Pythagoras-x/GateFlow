import { describe, it, expect, beforeEach } from 'vitest';
import { OnchainContractRole } from '@gateflow/shared-types';
import { MockStellarClient } from '../mock-stellar-client';
import { stringToBytes32, normalizeBytes32Hex } from '../utils';

describe('Stellar Client Package', () => {
  let client: MockStellarClient;

  beforeEach(() => {
    client = new MockStellarClient({
      useMock: true,
      networkPassphrase: 'Test SDF Network ; September 2015',
    });
  });

  describe('Utility Functions', () => {
    it('converts strings to 32-byte hex strings', () => {
      const site1 = stringToBytes32('site-ny-hq');
      const site2 = stringToBytes32('site-ny-hq');
      const site3 = stringToBytes32('site-sf-office');

      expect(site1).toHaveLength(64);
      expect(site1).toBe(site2);
      expect(site1).not.toBe(site3);
    });

    it('normalizes bytes32 hex correctly', () => {
      expect(normalizeBytes32Hex('0xabcd')).toBe(
        '000000000000000000000000000000000000000000000000000000000000abcd'
      );
    });
  });

  describe('Contract Operations via Mock Client', () => {
    it('handles site registration and lookup', async () => {
      const siteId = stringToBytes32('site-01');

      expect(await client.isSiteRegistered(siteId)).toBe(false);

      const tx = await client.registerSite(siteId);
      expect(tx).toHaveLength(64);
      expect(await client.isSiteRegistered(siteId)).toBe(true);

      // Re-registration throws
      await expect(client.registerSite(siteId)).rejects.toThrow('Site already registered');
    });

    it('enforces role assignments', async () => {
      const guardAddress = 'GGUARD000000000000000000000000000000000000000000000GATEFLOW';

      expect(await client.hasRole(guardAddress, OnchainContractRole.Security)).toBe(false);

      await client.addRole(guardAddress, OnchainContractRole.Security);
      expect(await client.hasRole(guardAddress, OnchainContractRole.Security)).toBe(true);
      expect(await client.hasRole(guardAddress, OnchainContractRole.HR)).toBe(false);
    });

    it('executes write-once Merkle anchoring for a site period', async () => {
      const siteId = stringToBytes32('site-london');
      await client.registerSite(siteId);

      const period = 1715000000;
      const root = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

      // Unanchored period returns null
      expect(await client.getAnchor(siteId, period)).toBeNull();

      // Submit anchor
      const res = await client.anchorAttendance(siteId, period, root);
      expect(res.txHash).toHaveLength(64);
      expect(res.period).toBe(period);
      expect(res.merkleRoot).toBe(root);

      // Verify anchor retrieval
      const fetched = await client.getAnchor(siteId, period);
      expect(fetched).not.toBeNull();
      expect(fetched!.merkleRoot).toBe(root);

      // Duplicate anchoring must be rejected
      await expect(client.anchorAttendance(siteId, period, root)).rejects.toThrow(
        'Anchor already exists'
      );
    });

    it('rejects anchoring for unregistered sites', async () => {
      const unregisteredSite = stringToBytes32('unregistered-site');
      const period = 1715000000;
      const root = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

      await expect(client.anchorAttendance(unregisteredSite, period, root)).rejects.toThrow(
        'Site not registered'
      );
    });
  });
});
