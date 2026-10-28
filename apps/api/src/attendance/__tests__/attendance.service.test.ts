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
      device: {
        findMany: vi.fn().mockResolvedValue([]),
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

  describe('Anti-Fraud: Geofencing and Device Binding', () => {
    const geofencedSite = {
      id: 'site-hq',
      name: 'HQ Campus',
      siteIdHash: '1111111111111111111111111111111111111111111111111111111111111111',
      latitude: 51.5074, // London
      longitude: -0.1278,
      radiusMeters: 150.0,
    };

    beforeEach(() => {
      mockPrisma.employee.findUnique.mockResolvedValue({
        id: 'emp-1',
        employeeNo: 'EMP001',
        nameEnc: encryptionService.encrypt('Alice Smith'),
      });
      mockPrisma.site.findUnique.mockResolvedValue(geofencedSite);
      mockPrisma.attendanceEvent.findFirst.mockResolvedValue(null);
      mockPrisma.attendanceEvent.create.mockImplementation(({ data }: any) => ({
        id: 'event-geo-1',
        ...data,
        occurredAt: new Date(),
      }));
    });

    it('allows check-in when coordinates are within the geofence radius', async () => {
      // 50 meters away
      const res = await attendanceService.checkIn({
        employeeId: 'emp-1',
        siteId: 'site-hq',
        method: AttendanceMethod.QR,
        latitude: 51.5077,
        longitude: -0.1278,
      });

      expect(res.success).toBe(true);
      expect(mockPrisma.attendanceEvent.create).toHaveBeenCalled();
    });

    it('rejects check-in when coordinates are outside the geofence radius', async () => {
      // ~2.5km away
      await expect(
        attendanceService.checkIn({
          employeeId: 'emp-1',
          siteId: 'site-hq',
          method: AttendanceMethod.QR,
          latitude: 51.5300,
          longitude: -0.1278,
        })
      ).rejects.toThrow('Geofence verification failed');
    });

    it('allows check-in without coordinates if device has no GPS', async () => {
      const res = await attendanceService.checkIn({
        employeeId: 'emp-1',
        siteId: 'site-hq',
        method: AttendanceMethod.QR,
      });

      expect(res.success).toBe(true);
    });

    it('accepts check-in when device signature matches registered bound device', async () => {
      mockPrisma.device.findMany.mockResolvedValue([
        { id: 'dev-1', publicKey: 'valid-public-key-abc' },
      ]);

      const res = await attendanceService.checkIn({
        employeeId: 'emp-1',
        siteId: 'site-hq',
        method: AttendanceMethod.QR,
        latitude: 51.5074,
        longitude: -0.1278,
        deviceSignature: 'valid-public-key-abc',
      });

      expect(res.success).toBe(true);
    });

    it('rejects check-in when device signature does not match bound device', async () => {
      mockPrisma.device.findMany.mockResolvedValue([
        { id: 'dev-1', publicKey: 'valid-public-key-abc' },
      ]);

      await expect(
        attendanceService.checkIn({
          employeeId: 'emp-1',
          siteId: 'site-hq',
          method: AttendanceMethod.QR,
          latitude: 51.5074,
          longitude: -0.1278,
          deviceSignature: 'rogue-unregistered-device-xyz',
        })
      ).rejects.toThrow('Device binding verification failed');
    });
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

  describe('Payroll & Attendance Reports Engine', () => {
    it('aggregates employee attendance events into payroll metrics and detects late arrivals', async () => {
      const morningIn = new Date('2026-05-01T09:30:00'); // 9:30 AM (late for 09:00 shift with 15min grace)
      const eveningOut = new Date('2026-05-01T17:30:00'); // 8 hours later

      const mockEmployee = {
        id: 'emp-1',
        employeeNo: 'EMP001',
        nameEnc: encryptionService.encrypt('Alice Smith'),
        department: 'Engineering',
        shift: {
          startTime: '09:00',
          endTime: '17:00',
          graceMinutes: 15,
        },
      };

      const mockEvents = [
        {
          id: 'ev-1',
          employeeId: 'emp-1',
          siteId: 'site-1',
          type: AttendanceType.IN,
          occurredAt: morningIn,
          anchorId: 'anchor-1',
          employee: mockEmployee,
          site: { id: 'site-1', name: 'HQ' },
        },
        {
          id: 'ev-2',
          employeeId: 'emp-1',
          siteId: 'site-1',
          type: AttendanceType.OUT,
          occurredAt: eveningOut,
          anchorId: 'anchor-1',
          employee: mockEmployee,
          site: { id: 'site-1', name: 'HQ' },
        },
      ];

      mockPrisma.attendanceEvent.findMany.mockResolvedValue(mockEvents);

      const report = await attendanceService.getPayrollReports({
        startDate: '2026-05-01T00:00:00Z',
        endDate: '2026-05-01T23:59:59Z',
      });

      expect(report.summary.totalEmployees).toBe(1);
      expect(report.summary.totalCheckIns).toBe(1);
      expect(report.summary.totalCheckOuts).toBe(1);
      expect(report.summary.totalHoursWorked).toBe(8);
      expect(report.summary.totalLateArrivals).toBe(1);

      const item = report.items[0];
      expect(item.employeeNo).toBe('EMP001');
      expect(item.employeeName).toBe('Alice Smith');
      expect(item.department).toBe('Engineering');
      expect(item.totalHoursWorked).toBe(8);
      expect(item.lateArrivals).toBe(1);
      expect(item.anchoredEventsCount).toBe(2);
    });

    it('exports payroll report as formatted CSV', async () => {
      mockPrisma.attendanceEvent.findMany.mockResolvedValue([]);

      const csvResult = await attendanceService.exportPayrollReportsCsv({
        startDate: '2026-05-01T00:00:00Z',
        endDate: '2026-05-01T23:59:59Z',
      });

      expect(csvResult.filename).toContain('payroll-report-2026-05-01');
      expect(csvResult.content).toContain('employeeNo,employeeName,department,siteName,daysPresent,checkIns,checkOuts,hoursWorked,lateArrivals,anchoredEvents');
    });
  });
});
