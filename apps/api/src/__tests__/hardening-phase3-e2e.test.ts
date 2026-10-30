import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash, createHmac } from 'crypto';
import { AttendanceService } from '../attendance/attendance.service';
import { AuditService } from '../audit/audit.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { EncryptionService } from '../common/encryption.service';
import {
  AttendanceType,
  AttendanceMethod,
  CorrectionStatus,
  AuditVerificationStatus,
  WebhookEvent,
} from '@gateflow/shared-types';

describe('Phase 3 Hardening End-to-End Integration Flow', () => {
  let attendanceService: AttendanceService;
  let auditService: AuditService;
  let webhooksService: WebhooksService;
  let encryptionService: EncryptionService;

  // In-memory mock database tables
  let auditLogsDb: any[] = [];
  let correctionsDb: any[] = [];
  let attendanceDb: any[] = [];
  let webhooksDb: any[] = [];
  let webhookDeliveriesDb: any[] = [];

  const mockSite = {
    id: 'site-alpha',
    name: 'Alpha Campus',
    siteIdHash: '2222222222222222222222222222222222222222222222222222222222222222',
    latitude: 40.7128,
    longitude: -74.006,
    radiusMeters: 100.0,
  };

  beforeEach(() => {
    auditLogsDb = [];
    correctionsDb = [];
    attendanceDb = [];
    webhooksDb = [];
    webhookDeliveriesDb = [];

    encryptionService = new EncryptionService();

    const mockPrisma: any = {
      auditLog: {
        findFirst: vi.fn().mockImplementation(() => auditLogsDb[auditLogsDb.length - 1] || null),
        findMany: vi.fn().mockImplementation(() => [...auditLogsDb]),
        create: vi.fn().mockImplementation(({ data }: any) => {
          const entry = { id: `audit-${auditLogsDb.length + 1}`, ...data, createdAt: new Date() };
          auditLogsDb.push(entry);
          return entry;
        }),
        count: vi.fn().mockImplementation(() => auditLogsDb.length),
      },
      correction: {
        findFirst: vi.fn().mockImplementation(({ where }: any) =>
          correctionsDb.find((c) => c.eventId === where.eventId && c.status === where.status) || null
        ),
        findUnique: vi.fn().mockImplementation(({ where }: any) => {
          const c = correctionsDb.find((item) => item.id === where.id);
          if (!c) return null;
          const ev = attendanceDb.find((item) => item.id === c.eventId);
          return {
            ...c,
            event: ev
              ? {
                  ...ev,
                  site: mockSite,
                  employee: { employeeNo: 'EMP-777', nameEnc: encryptionService.encrypt('Sarah Connor') },
                }
              : null,
          };
        }),
        create: vi.fn().mockImplementation(({ data }: any) => {
          const record = { id: `corr-${correctionsDb.length + 1}`, ...data, createdAt: new Date() };
          correctionsDb.push(record);
          return record;
        }),
        update: vi.fn().mockImplementation(({ where, data }: any) => {
          const idx = correctionsDb.findIndex((c) => c.id === where.id);
          if (idx !== -1) {
            correctionsDb[idx] = { ...correctionsDb[idx], ...data };
            return correctionsDb[idx];
          }
          return null;
        }),
        findMany: vi.fn().mockImplementation(() => [...correctionsDb]),
        count: vi.fn().mockImplementation(() => correctionsDb.length),
      },
      attendanceEvent: {
        findFirst: vi.fn().mockImplementation(() => null),
        findUnique: vi.fn().mockImplementation(({ where }: any) =>
          attendanceDb.find((ev) => ev.id === where.id) || null
        ),
        create: vi.fn().mockImplementation(({ data }: any) => {
          const ev = { id: `ev-${attendanceDb.length + 1}`, ...data, occurredAt: new Date() };
          attendanceDb.push(ev);
          return ev;
        }),
        findMany: vi.fn().mockImplementation(() =>
          attendanceDb.map((ev) => ({
            ...ev,
            site: mockSite,
            employee: {
              id: 'emp-777',
              employeeNo: 'EMP-777',
              nameEnc: encryptionService.encrypt('Sarah Connor'),
              department: 'Security',
              shift: { startTime: '09:00', endTime: '17:00', graceMinutes: 15 },
            },
          }))
        ),
        count: vi.fn().mockImplementation(() => attendanceDb.length),
      },
      employee: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'emp-777',
          employeeNo: 'EMP-777',
          nameEnc: encryptionService.encrypt('Sarah Connor'),
          department: 'Security',
          shift: { startTime: '09:00', endTime: '17:00', graceMinutes: 15 },
        }),
      },
      site: {
        findUnique: vi.fn().mockResolvedValue(mockSite),
      },
      device: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      webhook: {
        create: vi.fn().mockImplementation(({ data }: any) => {
          const wh = { id: `wh-${webhooksDb.length + 1}`, ...data, createdAt: new Date(), updatedAt: new Date() };
          webhooksDb.push(wh);
          return wh;
        }),
        findMany: vi.fn().mockImplementation(() => [...webhooksDb]),
        findUnique: vi.fn().mockImplementation(({ where }: any) =>
          webhooksDb.find((w) => w.id === where.id) || null
        ),
      },
      webhookDeliveryLog: {
        create: vi.fn().mockImplementation(({ data }: any) => {
          const log = { id: `whlog-${webhookDeliveriesDb.length + 1}`, ...data, deliveredAt: new Date() };
          webhookDeliveriesDb.push(log);
          return log;
        }),
        findMany: vi.fn().mockImplementation(() => [...webhookDeliveriesDb]),
      },
    };

    auditService = new AuditService(mockPrisma);
    webhooksService = new WebhooksService(mockPrisma, auditService);
    attendanceService = new AttendanceService(mockPrisma, encryptionService, auditService, webhooksService);
  });

  it('runs complete Phase 3 Hardening integration lifecycle', async () => {
    // 1. Register Webhook for attendance & corrections events
    const webhook = await webhooksService.registerWebhook({
      url: 'https://security-gateway.internal/events',
      events: [WebhookEvent.ATTENDANCE_CHECKED_IN, WebhookEvent.CORRECTION_APPROVED],
    }, 'admin-super');

    expect(webhook.id).toBeDefined();
    expect(webhook.secret).toMatch(/^gf_sec_/);

    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: vi.fn().mockResolvedValue('{"status":"ack"}'),
    });
    vi.stubGlobal('fetch', mockFetch);

    // 2. Geofenced Anti-Fraud Check-In
    // Attempt 1: Outside geofence boundary -> Rejected
    await expect(
      attendanceService.checkIn({
        employeeId: 'emp-777',
        siteId: 'site-alpha',
        method: AttendanceMethod.QR,
        latitude: 40.7589, // Times Square (~5km away from Wall St)
        longitude: -73.9851,
      })
    ).rejects.toThrow('Geofence verification failed');

    // Attempt 2: Inside geofence boundary -> Accepted
    const checkInRes = await attendanceService.checkIn({
      employeeId: 'emp-777',
      siteId: 'site-alpha',
      method: AttendanceMethod.QR,
      latitude: 40.71285,
      longitude: -74.00605,
    });

    expect(checkInRes.success).toBe(true);
    expect(attendanceDb).toHaveLength(1);
    const eventId = attendanceDb[0].id;

    // Verify webhook was dispatched with HMAC-SHA256 signature
    expect(mockFetch).toHaveBeenCalledWith(
      'https://security-gateway.internal/events',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-GateFlow-Event': WebhookEvent.ATTENDANCE_CHECKED_IN,
          'X-GateFlow-Signature': expect.stringMatching(/^sha256=/),
        }),
      })
    );

    // 3. Four-Eyes Attendance Correction Workflow
    // HR User requests a correction
    const correctionReq = await attendanceService.requestCorrection(
      { eventId, reason: 'NFC reader firmware timeout during morning shift' },
      'hr-officer-alice'
    );
    expect(correctionReq.status).toBe(CorrectionStatus.PENDING);

    // Four-Eyes Rule: Requester cannot self-approve
    await expect(
      attendanceService.approveCorrection(correctionReq.id, 'hr-officer-alice')
    ).rejects.toThrow('Four-eyes principle violation');

    // Second authorized user approves -> Anchors to Soroban
    const approveRes = await attendanceService.approveCorrection(
      correctionReq.id,
      'admin-officer-bob',
      'Verified gate logs manually'
    );
    expect(approveRes.success).toBe(true);
    expect(approveRes.correction.status).toBe(CorrectionStatus.APPROVED);
    expect(approveRes.onchainTxHash).toBeDefined();

    // 4. Cryptographic Audit Chain Integrity Verification
    const initialVerify = await auditService.verifyAuditChain();
    expect(initialVerify.valid).toBe(true);
    expect(initialVerify.status).toBe(AuditVerificationStatus.VALID);
    expect(initialVerify.totalEntries).toBeGreaterThanOrEqual(3);

    // Tamper with audit log in database -> Verify detection
    const originalEntry = auditLogsDb[1];
    auditLogsDb[1] = {
      ...originalEntry,
      payload: '{"tampered":true}', // Unauthorized direct DB edit
    };

    const tamperedVerify = await auditService.verifyAuditChain();
    expect(tamperedVerify.valid).toBe(false);
    expect(tamperedVerify.status).toBe(AuditVerificationStatus.CORRUPTED);
    expect(tamperedVerify.brokenAtIndex).toBe(1);

    // Restore original entry
    auditLogsDb[1] = originalEntry;
    const restoredVerify = await auditService.verifyAuditChain();
    expect(restoredVerify.valid).toBe(true);

    // 5. Payroll Report Aggregation & CSV Generation
    const payrollReport = await attendanceService.getPayrollReports({});
    expect(payrollReport.summary.totalEmployees).toBe(1);
    expect(payrollReport.items[0].employeeName).toBe('Sarah Connor');

    const csvExport = await attendanceService.exportPayrollReportsCsv({});
    expect(csvExport.filename).toContain('payroll-report-');
    expect(csvExport.content).toContain('Sarah Connor');
    expect(csvExport.content).toContain('Security');
  });
});
