import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SponsorshipService } from '../sponsorship.service';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../audit/audit.service';
import {
  SponsorshipGuardCode,
  SponsorshipHealthStatus,
} from '@gateflow/shared-types';

describe('SponsorshipService', () => {
  let service: SponsorshipService;
  let mockPrisma: any;
  let mockAudit: any;

  beforeEach(() => {
    mockPrisma = {
      auditLog: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    mockAudit = {
      logAction: vi.fn().mockResolvedValue(undefined),
    };

    service = new SponsorshipService(mockPrisma as unknown as PrismaService, mockAudit as unknown as AuditService);
  });

  it('initializes with sponsor public key and healthy status', async () => {
    const status = await service.getStatus();
    expect(status.metrics).toBeDefined();
    expect(status.balance).toBeDefined();
    expect(status.balance.publicKey).toContain('GSPONSOR');
    expect(status.balance.balanceXlm).toBeGreaterThan(0);
    expect(status.metrics.healthStatus).toBe(SponsorshipHealthStatus.HEALTHY);
  });

  it('records sponsored fee-bump action and dispatches audit log', async () => {
    const record = await service.recordSponsoredAction({
      feeStroops: 100_000,
      operationType: 'ANCHOR_ATTENDANCE',
      txHash: '0x1234567890abcdef',
    });

    expect(record).toBeDefined();
    expect(record.feeStroops).toBe(100_000);
    expect(record.feeXlm).toBe(0.01);
    expect(record.operationType).toBe('ANCHOR_ATTENDANCE');

    expect(mockAudit.logAction).toHaveBeenCalledWith(
      'system',
      'SPONSORED_FEE_BUMP',
      'sponsorship',
      expect.objectContaining({
        txHash: '0x1234567890abcdef',
        feeStroops: 100_000,
      })
    );
  });

  it('rejects sponsored action when fee exceeds per-tx guard limit', async () => {
    await expect(
      service.recordSponsoredAction({
        feeStroops: 50_000_000, // Exceeds default 500,000 stroops
        operationType: 'EXORBITANT_FEE_TX',
        txHash: '0xexorbitant',
      })
    ).rejects.toThrow('Sponsorship guard rejected transaction');
  });

  it('wraps inner transaction and returns fee-bump info when allowed', async () => {
    const res = await service.wrapTransaction({
      innerTxXdr: 'AAAA...dummyInnerTxXdr',
      operationType: 'ISSUE_PASS',
      maxFeeStroops: 150_000,
    });

    expect(res.success).toBe(true);
    expect(res.evaluation.allowed).toBe(true);
    expect(res.txHash).toBeDefined();
    expect(res.feeBumpTxXdr).toBeDefined();

    expect(mockAudit.logAction).toHaveBeenCalledWith(
      'system',
      'FEE_BUMP_WRAPPED',
      'sponsorship',
      expect.objectContaining({
        feeStroops: 150_000,
      })
    );
  });

  it('updates sponsorship guard configuration and audits changes', async () => {
    const updated = await service.updateConfig(
      {
        maxFeeStroopsPerTx: 300_000,
        dailySpendCapStroops: 15_000_000,
      },
      'admin-user-123'
    );

    expect(updated.maxFeeStroopsPerTx).toBe(300_000);
    expect(updated.dailySpendCapStroops).toBe(15_000_000);

    expect(mockAudit.logAction).toHaveBeenCalledWith(
      'admin-user-123',
      'UPDATE_SPONSOR_CONFIG',
      'sponsorship',
      expect.objectContaining({
        maxFeeStroopsPerTx: 300_000,
      })
    );
  });

  it('retrieves paginated transaction history', async () => {
    await service.recordSponsoredAction({
      feeStroops: 50_000,
      operationType: 'TEST_OP_1',
      txHash: '0xtx1',
    });
    await service.recordSponsoredAction({
      feeStroops: 75_000,
      operationType: 'TEST_OP_2',
      txHash: '0xtx2',
    });

    const history = await service.getHistory(10, 0);
    expect(history.total).toBe(2);
    expect(history.records.length).toBe(2);
    expect(history.records[0].operationType).toBe('TEST_OP_2');
  });
});
