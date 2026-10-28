import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AttendanceService } from '../attendance.service';
import { EncryptionService } from '../../common/encryption.service';
import { AuditService } from '../../audit/audit.service';
import { AttendanceType, AttendanceMethod } from '@gateflow/shared-types';

describe('AttendanceService', () => {
  let attendanceService: AttendanceService;
  let mockPrisma: any;
  let encryptionService: EncryptionService;
  let auditService: AuditService;

  beforeEach(() => {
    encryptionService = new EncryptionService();
    mockPrisma = {
      employee: {
        findUnique: vi.fn(),
      },
      site: {
        findUnique: vi.fn(),
      },
      attendanceEvent: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      correction: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      auditLog: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
    };
    auditService = new AuditService(mockPrisma);
    attendanceService = new AttendanceService(mockPrisma, encryptionService, auditService);
  });

  it('generates valid rotating QR tokens and verifies them', () => {
    const tokenResponse = attendanceService.generateQrToken({
      employeeId: 'emp-1',
      siteId: 'site-hq',
    });

    expect(tokenResponse.token).toBeDefined();
    expect(tokenResponse.ttlSeconds).toBe(30);

    const verified = attendanceService.verifyQrToken(tokenResponse.token);
    expect(verified.employeeId).toBe('emp-1');
    expect(verified.siteId).toBe('site-hq');
    expect(verified.nonce).toBeDefined();
  });

  it('detects replay when token is reused', () => {
    const tokenResponse = attendanceService.generateQrToken({
      employeeId: 'emp-1',
      siteId: 'site-hq',
    });

    // First use succeeds
    attendanceService.verifyQrToken(tokenResponse.token);

    // Second use is rejected as replay attack
    expect(() => attendanceService.verifyQrToken(tokenResponse.token)).toThrow(
      'QR token has already been used (replay detected)'
    );
  });

  it('successfully checks in employee and computes salted leaf hash', async () => {
    mockPrisma.employee.findUnique.mockResolvedValue({
      id: 'emp-1',
      employeeNo: 'EMP001',
      nameEnc: encryptionService.encrypt('Alice Smith'),
    });
    mockPrisma.site.findUnique.mockResolvedValue({
      id: 'site-hq',
      name: 'HQ',
      siteIdHash: '1111111111111111111111111111111111111111111111111111111111111111',
    });
    mockPrisma.attendanceEvent.findFirst.mockResolvedValue(null);
    mockPrisma.attendanceEvent.create.mockImplementation(({ data }: any) => ({
      id: 'event-1',
      ...data,
      occurredAt: new Date(),
    }));

    const result = await attendanceService.checkIn({
      employeeId: 'emp-1',
      siteId: 'site-hq',
      method: AttendanceMethod.QR,
    });

    expect(result.success).toBe(true);
    expect(result.event.leafHash).toHaveLength(64);
    expect(result.event.type).toBe(AttendanceType.IN);
    expect(mockPrisma.attendanceEvent.create).toHaveBeenCalled();
  });

  it('prevents rapid double check-in within 2 minutes', async () => {
    mockPrisma.employee.findUnique.mockResolvedValue({
      id: 'emp-1',
      employeeNo: 'EMP001',
      nameEnc: encryptionService.encrypt('Alice Smith'),
    });
    mockPrisma.site.findUnique.mockResolvedValue({
      id: 'site-hq',
      name: 'HQ',
      siteIdHash: '1111111111111111111111111111111111111111111111111111111111111111',
    });
    // Simulate check-in occurred 30 seconds ago
    mockPrisma.attendanceEvent.findFirst.mockResolvedValue({
      id: 'recent-event',
      occurredAt: new Date(),
    });

    await expect(
      attendanceService.checkIn({
        employeeId: 'emp-1',
        siteId: 'site-hq',
        method: AttendanceMethod.QR,
      })
    ).rejects.toThrow('A check-in was already recorded within the last 2 minutes');
  });

  describe('Attendance Corrections Workflow', () => {
    const mockEvent = {
      id: 'ev-123',
      employeeId: 'emp-1',
      siteId: 'site-hq',
      type: AttendanceType.IN,
      occurredAt: new Date(),
      leafHash: 'a'.repeat(64),
      employee: { employeeNo: 'EMP001' },
      site: { id: 'site-hq', name: 'HQ', siteIdHash: '1'.repeat(64) },
    };

    it('creates a pending correction request', async () => {
      mockPrisma.attendanceEvent.findUnique.mockResolvedValue(mockEvent);
      mockPrisma.correction.findFirst.mockResolvedValue(null);
      mockPrisma.correction.create.mockImplementation(({ data }: any) => ({
        id: 'corr-1',
        ...data,
        createdAt: new Date(),
      }));

      const result = await attendanceService.requestCorrection(
        { eventId: 'ev-123', reason: 'Badge scanner malfunction' },
        'hr-user-1'
      );

      expect(result.id).toBe('corr-1');
      expect(result.status).toBe('PENDING');
      expect(result.reason).toBe('Badge scanner malfunction');
      expect(mockPrisma.correction.create).toHaveBeenCalled();
    });

    it('rejects duplicate pending correction request for same event', async () => {
      mockPrisma.attendanceEvent.findUnique.mockResolvedValue(mockEvent);
      mockPrisma.correction.findFirst.mockResolvedValue({ id: 'existing-corr', status: 'PENDING' });

      await expect(
        attendanceService.requestCorrection(
          { eventId: 'ev-123', reason: 'Another correction' },
          'hr-user-1'
        )
      ).rejects.toThrow('A correction request is already pending approval');
    });

    it('enforces four-eyes principle by rejecting self-approval', async () => {
      mockPrisma.correction.findUnique.mockResolvedValue({
        id: 'corr-1',
        eventId: 'ev-123',
        reason: 'Badge scanner malfunction',
        requestedBy: 'user-hr-1',
        status: 'PENDING',
        event: mockEvent,
      });

      // Same user attempts to approve their own request
      await expect(
        attendanceService.approveCorrection('corr-1', 'user-hr-1')
      ).rejects.toThrow('Four-eyes principle violation');
    });

    it('approves correction when approved by different authorized user and anchors on-chain', async () => {
      mockPrisma.correction.findUnique.mockResolvedValue({
        id: 'corr-1',
        eventId: 'ev-123',
        reason: 'Badge scanner malfunction',
        requestedBy: 'user-hr-1',
        status: 'PENDING',
        event: mockEvent,
      });
      mockPrisma.correction.update.mockImplementation(({ data }: any) => ({
        id: 'corr-1',
        eventId: 'ev-123',
        reason: 'Badge scanner malfunction',
        requestedBy: 'user-hr-1',
        approvedBy: data.approvedBy,
        status: data.status,
        onchainTxHash: data.onchainTxHash,
        createdAt: new Date(),
      }));

      const res = await attendanceService.approveCorrection('corr-1', 'user-admin-2');

      expect(res.success).toBe(true);
      expect(res.correction.approvedBy).toBe('user-admin-2');
      expect(res.correction.status).toBe('APPROVED');
      expect(res.onchainTxHash).toBeDefined();
      expect(mockPrisma.correction.update).toHaveBeenCalled();
    });
  });
});
