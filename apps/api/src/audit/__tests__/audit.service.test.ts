import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash } from 'crypto';
import { AuditService } from '../audit.service';
import { AuditVerificationStatus } from '@gateflow/shared-types';

describe('AuditService', () => {
  let auditService: AuditService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      auditLog: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        count: vi.fn(),
      },
    };
    auditService = new AuditService(mockPrisma);
  });

  it('computes valid SHA-256 hash chaining on logAction', async () => {
    mockPrisma.auditLog.findFirst.mockResolvedValue(null);
    let capturedData: any = null;
    mockPrisma.auditLog.create.mockImplementation(({ data }: any) => {
      capturedData = data;
      return { id: 'log-1', ...data, createdAt: new Date() };
    });

    await auditService.logAction('user-1', 'SITE_CREATED', 'Site', { siteId: 's-123' });

    expect(capturedData.prevHash).toBe('0'.repeat(64));
    expect(capturedData.actorId).toBe('user-1');
    expect(capturedData.action).toBe('SITE_CREATED');
    expect(capturedData.entryHash).toHaveLength(64);

    // Verify hash math
    const expectedHash = createHash('sha256')
      .update(`${'0'.repeat(64)}:user-1:SITE_CREATED:Site:{"siteId":"s-123"}`)
      .digest('hex');
    expect(capturedData.entryHash).toBe(expectedHash);
  });

  describe('verifyAuditChain', () => {
    it('returns EMPTY status when no logs exist', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);

      const result = await auditService.verifyAuditChain();
      expect(result.valid).toBe(true);
      expect(result.status).toBe(AuditVerificationStatus.EMPTY);
      expect(result.totalEntries).toBe(0);
    });

    it('verifies an intact cryptographic hash chain across multiple records', async () => {
      const genesisPrev = '0'.repeat(64);
      const payload1 = '{"siteId":"s-1"}';
      const hash1 = createHash('sha256')
        .update(`${genesisPrev}:user-1:SITE_CREATE:Site:${payload1}`)
        .digest('hex');

      const payload2 = '{"employeeNo":"EMP001"}';
      const hash2 = createHash('sha256')
        .update(`${hash1}:user-1:EMPLOYEE_ENROL:Employee:${payload2}`)
        .digest('hex');

      const mockLogs = [
        {
          id: 'log-1',
          actorId: 'user-1',
          action: 'SITE_CREATE',
          entity: 'Site',
          payload: payload1,
          prevHash: genesisPrev,
          entryHash: hash1,
          createdAt: new Date('2026-01-01T10:00:00Z'),
        },
        {
          id: 'log-2',
          actorId: 'user-1',
          action: 'EMPLOYEE_ENROL',
          entity: 'Employee',
          payload: payload2,
          prevHash: hash1,
          entryHash: hash2,
          createdAt: new Date('2026-01-01T10:05:00Z'),
        },
      ];

      mockPrisma.auditLog.findMany.mockResolvedValue(mockLogs);

      const result = await auditService.verifyAuditChain();
      expect(result.valid).toBe(true);
      expect(result.status).toBe(AuditVerificationStatus.VALID);
      expect(result.totalEntries).toBe(2);
    });

    it('detects tampered payload in the middle of the chain', async () => {
      const genesisPrev = '0'.repeat(64);
      const payload1 = '{"siteId":"s-1"}';
      const hash1 = createHash('sha256')
        .update(`${genesisPrev}:user-1:SITE_CREATE:Site:${payload1}`)
        .digest('hex');

      const mockLogs = [
        {
          id: 'log-1',
          actorId: 'user-1',
          action: 'SITE_CREATE',
          entity: 'Site',
          payload: '{"siteId":"tampered-unauthorized-id"}', // Maliciously edited payload
          prevHash: genesisPrev,
          entryHash: hash1, // Hash was not updated or cannot match
          createdAt: new Date('2026-01-01T10:00:00Z'),
        },
      ];

      mockPrisma.auditLog.findMany.mockResolvedValue(mockLogs);

      const result = await auditService.verifyAuditChain();
      expect(result.valid).toBe(false);
      expect(result.status).toBe(AuditVerificationStatus.CORRUPTED);
      expect(result.brokenAtIndex).toBe(0);
      expect(result.message).toContain('Tampered payload detected');
    });

    it('detects broken chain link when a record was deleted or reordered', async () => {
      const genesisPrev = '0'.repeat(64);
      const hash1 = createHash('sha256')
        .update(`${genesisPrev}:user-1:ACTION1:Entity:{}`)
        .digest('hex');

      const mockLogs = [
        {
          id: 'log-1',
          actorId: 'user-1',
          action: 'ACTION1',
          entity: 'Entity',
          payload: '{}',
          prevHash: genesisPrev,
          entryHash: hash1,
          createdAt: new Date('2026-01-01T10:00:00Z'),
        },
        {
          id: 'log-3', // log-2 was deleted by an insider!
          actorId: 'user-1',
          action: 'ACTION3',
          entity: 'Entity',
          payload: '{}',
          prevHash: 'non-matching-prev-hash-from-missing-log-2',
          entryHash: 'any-hash',
          createdAt: new Date('2026-01-01T10:10:00Z'),
        },
      ];

      mockPrisma.auditLog.findMany.mockResolvedValue(mockLogs);

      const result = await auditService.verifyAuditChain();
      expect(result.valid).toBe(false);
      expect(result.status).toBe(AuditVerificationStatus.CORRUPTED);
      expect(result.brokenAtIndex).toBe(1);
      expect(result.message).toContain('Broken chain linkage');
    });
  });

  describe('exportAuditLogs', () => {
    it('exports audit logs formatted as CSV', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          actorId: 'u-1',
          action: 'SITE_ADD',
          entity: 'Site',
          prevHash: '0000',
          entryHash: '1111',
          createdAt: new Date('2026-01-01T12:00:00Z'),
          payload: '{"name":"HQ"}',
        },
      ]);

      const result = await auditService.exportAuditLogs({ format: 'csv' });
      expect(result.format).toBe('csv');
      expect(result.content).toContain('id,actorId,action,entity,prevHash,entryHash,createdAt,payload');
      expect(result.content).toContain('"u-1","SITE_ADD"');
    });

    it('exports audit logs formatted as JSON', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          actorId: 'u-1',
          action: 'SITE_ADD',
          entity: 'Site',
          prevHash: '0000',
          entryHash: '1111',
          createdAt: new Date('2026-01-01T12:00:00Z'),
          payload: '{"name":"HQ"}',
        },
      ]);

      const result = await auditService.exportAuditLogs({ format: 'json' });
      expect(result.format).toBe('json');
      const parsed = JSON.parse(result.content);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].actorId).toBe('u-1');
    });
  });
});
