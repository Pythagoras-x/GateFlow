import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EncryptionService } from '../common/encryption.service';
import { AuditService } from '../audit/audit.service';
import { SitesService } from '../sites/sites.service';
import { VisitorsService } from '../visitors/visitors.service';
import { StellarClient } from '@gateflow/stellar-client';
import { PassStatus, GateEventType, UserRole } from '@gateflow/shared-types';

describe('GateFlow Visitor & Gate End-to-End Integration Flow', () => {
  let encryptionService: EncryptionService;
  let auditService: AuditService;
  let sitesService: SitesService;
  let visitorsService: VisitorsService;
  let stellarClient: StellarClient;

  // In-memory test state
  let sitesDb: any[] = [];
  let visitorsDb: any[] = [];
  let passesDb: any[] = [];
  let gateLogsDb: any[] = [];
  let mockPrisma: any;

  beforeEach(async () => {
    sitesDb = [];
    visitorsDb = [];
    passesDb = [];
    gateLogsDb = [];

    mockPrisma = {
      site: {
        findFirst: vi.fn().mockImplementation(({ where }: any) => {
          return sitesDb.find((s) => s.name === where?.name) || null;
        }),
        findUnique: vi.fn().mockImplementation(({ where }: any) => {
          return sitesDb.find((s) => s.id === where?.id || s.siteIdHash === where?.siteIdHash) || null;
        }),
        findMany: vi.fn().mockImplementation(() => sitesDb),
        create: vi.fn().mockImplementation(({ data }: any) => {
          const site = { id: 'site-' + (sitesDb.length + 1), ...data, createdAt: new Date(), updatedAt: new Date() };
          sitesDb.push(site);
          return site;
        }),
      },
      visitor: {
        findUnique: vi.fn().mockImplementation(({ where }: any) => {
          return visitorsDb.find((v) => v.id === where?.id) || null;
        }),
        findMany: vi.fn().mockImplementation(() => visitorsDb),
        create: vi.fn().mockImplementation(({ data }: any) => {
          const vis = { id: 'vis-' + (visitorsDb.length + 1), ...data, createdAt: new Date(), updatedAt: new Date() };
          visitorsDb.push(vis);
          return vis;
        }),
        update: vi.fn().mockImplementation(({ where, data }: any) => {
          const vis = visitorsDb.find((v) => v.id === where?.id);
          if (vis) Object.assign(vis, data);
          return vis;
        }),
      },
      visitorPass: {
        findUnique: vi.fn().mockImplementation(({ where }: any) => {
          const pass = passesDb.find((p) => p.id === where?.id || p.passIdHash === where?.passIdHash);
          if (!pass) return null;
          const site = sitesDb.find((s) => s.id === pass.siteId);
          const visitor = visitorsDb.find((v) => v.id === pass.visitorId);
          return { ...pass, site, visitor };
        }),
        findMany: vi.fn().mockImplementation(() => {
          return passesDb.map((pass) => ({
            ...pass,
            site: sitesDb.find((s) => s.id === pass.siteId),
            visitor: visitorsDb.find((v) => v.id === pass.visitorId),
          }));
        }),
        create: vi.fn().mockImplementation(({ data }: any) => {
          const pass = { id: 'pass-' + (passesDb.length + 1), ...data, createdAt: new Date() };
          passesDb.push(pass);
          const site = sitesDb.find((s) => s.id === pass.siteId);
          const visitor = visitorsDb.find((v) => v.id === pass.visitorId);
          return { ...pass, site, visitor };
        }),
        update: vi.fn().mockImplementation(({ where, data }: any) => {
          const pass = passesDb.find((p) => p.id === where?.id);
          if (pass) Object.assign(pass, data);
          const site = sitesDb.find((s) => s.id === pass.siteId);
          const visitor = visitorsDb.find((v) => v.id === pass.visitorId);
          return { ...pass, site, visitor };
        }),
      },
      gateLog: {
        create: vi.fn().mockImplementation(({ data }: any) => {
          const log = { id: 'log-' + (gateLogsDb.length + 1), ...data };
          gateLogsDb.push(log);
          const pass = passesDb.find((p) => p.id === log.passId);
          const site = sitesDb.find((s) => s.id === log.siteId);
          return { ...log, pass, site };
        }),
        findMany: vi.fn().mockImplementation(() => {
          return gateLogsDb
            .slice()
            .reverse()
            .map((log) => ({
              ...log,
              pass: passesDb.find((p) => p.id === log.passId),
              site: sitesDb.find((s) => s.id === log.siteId),
            }));
        }),
      },
      auditLog: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
    };

    encryptionService = new EncryptionService();
    auditService = new AuditService(mockPrisma);
    stellarClient = new StellarClient({ useMock: true });

    sitesService = new SitesService(mockPrisma, auditService);
    visitorsService = new VisitorsService(mockPrisma, encryptionService, auditService);
    visitorsService.setStellarClient(stellarClient);
  });

  it('executes full end-to-end visitor pass workflow', async () => {
    // 1. Create and register Site
    const siteDto = await sitesService.createSite(
      {
        name: 'London Innovation Centre',
        timezone: 'Europe/London',
      },
      'admin-1'
    );
    expect(siteDto.site.id).toBe('site-1');
    await stellarClient.registerSite(siteDto.site.siteIdHash);

    // 2. Pre-register Visitor
    const visitor = await visitorsService.createVisitor('host-1', {
      name: 'Dr. Gregory House',
      email: 'house@princeton-plainsboro.org',
      phone: '+44 20 7946 0991',
      company: 'Diagnostics Dept',
      purpose: 'Keynote Lecture',
    });
    expect(visitor.id).toBe('vis-1');
    expect(visitor.name).toBe('Dr. Gregory House');

    // 3. Issue Soroban Time-Bound Pass
    const now = new Date();
    const validUntil = new Date(now.getTime() + 14400000); // 4 hours later
    const pass = await visitorsService.issuePass('host-1', {
      visitorId: visitor.id,
      siteId: siteDto.site.id,
      validFrom: new Date(now.getTime() - 60000).toISOString(),
      validUntil: validUntil.toISOString(),
    });
    expect(pass.id).toBe('pass-1');
    expect(pass.status).toBe(PassStatus.ISSUED);
    expect(pass.qrToken).toBeDefined();

    // 4. Gate Verification by Security Guard
    const verifyBeforeEntry = await visitorsService.verifyGatePass({
      passIdOrQrToken: pass.qrToken!,
      siteId: siteDto.site.id,
    });
    expect(verifyBeforeEntry.valid).toBe(true);
    expect(verifyBeforeEntry.pass?.visitor?.name).toBe('Dr. Gregory House');

    // 5. Record Gate Entry
    const entryLog = await visitorsService.recordGateEntry('guard-gate-1', {
      passIdOrQrToken: pass.id,
      siteId: siteDto.site.id,
      notes: 'Visitor badge #42 issued',
    });
    expect(entryLog.type).toBe(GateEventType.ENTRY);
    expect(entryLog.pass?.status).toBe(PassStatus.ENTERED);

    // Duplicate entry must be rejected
    await expect(
      visitorsService.recordGateEntry('guard-gate-1', {
        passIdOrQrToken: pass.id,
        siteId: siteDto.site.id,
      })
    ).rejects.toThrow('Visitor is already recorded as entered');

    // 6. Record Gate Exit
    const exitLog = await visitorsService.recordGateExit('guard-gate-1', {
      passIdOrQrToken: pass.id,
      siteId: siteDto.site.id,
      notes: 'Visitor badge #42 returned',
    });
    expect(exitLog.type).toBe(GateEventType.EXIT);
    expect(exitLog.pass?.status).toBe(PassStatus.EXITED);

    // 7. Verify Pass status after exit
    const verifyAfterExit = await visitorsService.verifyGatePass({
      passIdOrQrToken: pass.id,
      siteId: siteDto.site.id,
    });
    expect(verifyAfterExit.valid).toBe(false);
    expect(verifyAfterExit.status).toBe(PassStatus.EXITED);

    // 8. Check Gate Logs audit history
    const logs = await visitorsService.getGateLogs(siteDto.site.id);
    expect(logs.length).toBe(2);
    expect(logs[0].type).toBe(GateEventType.EXIT);
    expect(logs[1].type).toBe(GateEventType.ENTRY);
  });
});
