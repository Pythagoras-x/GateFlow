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
        create: vi.fn(),
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
});
