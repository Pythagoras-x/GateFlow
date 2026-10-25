import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnchoringService } from '../anchoring.service';
import { EncryptionService } from '../../common/encryption.service';
import { AuditService } from '../../audit/audit.service';
import { AttendanceType } from '@gateflow/shared-types';
import { GateFlowMerkleTree, hashLeaf } from '@gateflow/merkle';

describe('AnchoringService', () => {
  let anchoringService: AnchoringService;
  let mockPrisma: any;
  let encryptionService: EncryptionService;
  let auditService: AuditService;

  beforeEach(() => {
    encryptionService = new EncryptionService();
    mockPrisma = {
      site: {
        findUnique: vi.fn(),
      },
      anchor: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        upsert: vi.fn(),
      },
      attendanceEvent: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      merkleProof: {
        upsert: vi.fn(),
      },
      auditLog: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
    };
    auditService = new AuditService(mockPrisma);
    anchoringService = new AnchoringService(mockPrisma, encryptionService, auditService);
  });

  it('runs anchoring on unanchored events and stores proofs', async () => {
    const siteId = 'site-1';
    const siteIdHash = '1111111111111111111111111111111111111111111111111111111111111111';

    mockPrisma.site.findUnique.mockResolvedValue({
      id: siteId,
      name: 'HQ',
      siteIdHash,
    });
    // Register the site in mock stellar client first
    await (anchoringService as any).stellarClient.registerSite(siteIdHash);

    mockPrisma.anchor.findUnique.mockResolvedValue(null);
    mockPrisma.attendanceEvent.findMany.mockResolvedValue([
      { id: 'event-1', leafHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      { id: 'event-2', leafHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
    ]);

    mockPrisma.anchor.upsert.mockImplementation(({ create }: any) => ({
      id: 'anchor-1',
      ...create,
      createdAt: new Date(),
    }));

    const result = await anchoringService.runAnchoring(siteId, 1715000000);

    expect(result.id).toBe('anchor-1');
    expect(result.merkleRoot).toHaveLength(64);
    expect(result.status).toBe('CONFIRMED');
    expect(mockPrisma.merkleProof.upsert).toHaveBeenCalledTimes(2);
    expect(mockPrisma.attendanceEvent.update).toHaveBeenCalledTimes(2);
  });

  it('verifies a valid proof bundle against smart contract', async () => {
    const siteId = '2222222222222222222222222222222222222222222222222222222222222222';
    const period = 1715000000;

    // Register site & anchor in mock stellar client
    await (anchoringService as any).stellarClient.registerSite(siteId);

    const salt = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const rawEvent = {
      employeeRef: 'EMP001',
      nonce: 'nonce123',
      siteId,
      timestamp: 1715000000,
      type: AttendanceType.IN,
      salt,
    };

    const leaf = hashLeaf(
      {
        employee_ref: rawEvent.employeeRef,
        nonce: rawEvent.nonce,
        site_id: rawEvent.siteId,
        timestamp: rawEvent.timestamp,
        type: rawEvent.type,
      },
      salt
    );

    const otherLeaf = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    const tree = new GateFlowMerkleTree([leaf, otherLeaf].sort());
    const root = tree.getRoot();
    const proof = tree.getProof(leaf);

    // Anchor on chain
    await (anchoringService as any).stellarClient.anchorAttendance(siteId, period, root);

    // Verify proof
    const verifyRes = await anchoringService.verifyProof({
      proofBundle: {
        leaf,
        proof,
        root,
        period,
        siteId,
        rawEvent,
      },
    });

    expect(verifyRes.valid).toBe(true);
    expect(verifyRes.rootMatchesOnchain).toBe(true);
    expect(verifyRes.status).toBe('VERIFIED');
  });

  it('detects tampered leaf in proof verification', async () => {
    const siteId = '3333333333333333333333333333333333333333333333333333333333333333';
    const period = 1715000000;

    const res = await anchoringService.verifyProof({
      proofBundle: {
        leaf: 'badleaf000000000000000000000000000000000000000000000000000000000',
        proof: [],
        root: 'badroot000000000000000000000000000000000000000000000000000000000',
        period,
        siteId,
        rawEvent: {
          employeeRef: 'EMP001',
          nonce: 'nonce',
          siteId,
          timestamp: 1715000000,
          type: AttendanceType.IN,
          salt: '1111111111111111111111111111111111111111111111111111111111111111',
        },
      },
    });

    expect(verifyRes_status(res)).toBe('LEAF_MISMATCH');
  });
});

function verifyRes_status(res: any) {
  return res.status;
}
