import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VisitorsService } from '../visitors.service';
import { EncryptionService } from '../../common/encryption.service';
import { AuditService } from '../../audit/audit.service';
import { StellarClient } from '@gateflow/stellar-client';
import {
  PassStatus,
  VisitorStatus,
  GateEventType,
  UserRole,
} from '@gateflow/shared-types';

describe('VisitorsService', () => {
  let visitorsService: VisitorsService;
  let mockPrisma: any;
  let encryptionService: EncryptionService;
  let auditService: AuditService;
  let stellarClient: StellarClient;

  beforeEach(async () => {
    encryptionService = new EncryptionService();
    mockPrisma = {
      visitor: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      site: {
        findUnique: vi.fn(),
      },
      visitorPass: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      gateLog: {
        create: vi.fn(),
        findMany: vi.fn(),
      },
      auditLog: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
    };
    auditService = new AuditService(mockPrisma);
    stellarClient = new StellarClient({ useMock: true });
    await stellarClient.registerSite('1111111111111111111111111111111111111111111111111111111111111111');

    visitorsService = new VisitorsService(mockPrisma, encryptionService, auditService);
    visitorsService.setStellarClient(stellarClient);
  });

  it('pre-registers a visitor with encrypted PII', async () => {
    const rawDto = {
      name: 'Alice Smith',
      email: 'alice@example.com',
      phone: '+1-555-0199',
      company: 'Acme Corp',
      purpose: 'Technical audit',
    };

    mockPrisma.visitor.create.mockImplementation(({ data }: any) => {
      expect(data.nameEnc).not.toBe('Alice Smith');
      expect(data.emailEnc).not.toBe('alice@example.com');
      return {
        id: 'vis-123',
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    const visitor = await visitorsService.createVisitor('host-1', rawDto);

    expect(visitor.id).toBe('vis-123');
    expect(visitor.name).toBe('Alice Smith');
    expect(visitor.email).toBe('alice@example.com');
    expect(visitor.company).toBe('Acme Corp');
    expect(visitor.status).toBe(VisitorStatus.PRE_REGISTERED);
  });

  it('issues an on-chain visitor pass and generates QR token', async () => {
    const validFrom = new Date(Date.now() - 60000);
    const validUntil = new Date(Date.now() + 3600000);

    mockPrisma.visitor.findUnique.mockResolvedValue({
      id: 'vis-123',
      nameEnc: encryptionService.encrypt('Alice Smith'),
      emailEnc: encryptionService.encrypt('alice@example.com'),
      status: 'PRE_REGISTERED',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockPrisma.site.findUnique.mockResolvedValue({
      id: 'site-hq',
      name: 'Main HQ',
      siteIdHash: '1111111111111111111111111111111111111111111111111111111111111111',
      timezone: 'UTC',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockPrisma.visitorPass.create.mockImplementation(({ data }: any) => ({
      id: 'pass-999',
      ...data,
      visitor: {
        id: 'vis-123',
        nameEnc: encryptionService.encrypt('Alice Smith'),
        emailEnc: encryptionService.encrypt('alice@example.com'),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      site: {
        id: 'site-hq',
        name: 'Main HQ',
        siteIdHash: '1111111111111111111111111111111111111111111111111111111111111111',
        timezone: 'UTC',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      createdAt: new Date(),
    }));

    mockPrisma.visitor.update.mockResolvedValue({});

    const pass = await visitorsService.issuePass('host-1', {
      visitorId: 'vis-123',
      siteId: 'site-hq',
      validFrom: validFrom.toISOString(),
      validUntil: validUntil.toISOString(),
    });

    expect(pass.id).toBe('pass-999');
    expect(pass.status).toBe(PassStatus.ISSUED);
    expect(pass.passIdHash).toHaveLength(64);
    expect(pass.qrToken).toBeDefined();
    expect(pass.onchainTxHash).toBeDefined();
  });

  it('verifies gate pass status accurately for valid, expired, revoked and mismatched site', async () => {
    const now = new Date();
    const validPass = {
      id: 'pass-valid',
      visitorId: 'vis-1',
      siteId: 'site-hq',
      passIdHash: 'hash-valid',
      validFrom: new Date(now.getTime() - 10000),
      validUntil: new Date(now.getTime() + 100000),
      status: PassStatus.ISSUED,
      site: { id: 'site-hq', name: 'Main HQ' },
      visitor: {
        id: 'vis-1',
        nameEnc: encryptionService.encrypt('Bob'),
        emailEnc: encryptionService.encrypt('bob@example.com'),
        createdAt: now,
        updatedAt: now,
      },
    };

    mockPrisma.visitorPass.findUnique.mockResolvedValue(validPass);

    // 1. Valid pass
    const resValid = await visitorsService.verifyGatePass({
      passIdOrQrToken: 'pass-valid',
      siteId: 'site-hq',
    });
    expect(resValid.valid).toBe(true);

    // 2. Wrong site
    const resWrongSite = await visitorsService.verifyGatePass({
      passIdOrQrToken: 'pass-valid',
      siteId: 'site-branch',
    });
    expect(resWrongSite.valid).toBe(false);
    expect(resWrongSite.message).toContain('not valid for this site');

    // 3. Revoked pass
    mockPrisma.visitorPass.findUnique.mockResolvedValue({
      ...validPass,
      status: PassStatus.REVOKED,
    });
    const resRevoked = await visitorsService.verifyGatePass({
      passIdOrQrToken: 'pass-valid',
      siteId: 'site-hq',
    });
    expect(resRevoked.valid).toBe(false);
    expect(resRevoked.status).toBe(PassStatus.REVOKED);

    // 4. Expired pass
    mockPrisma.visitorPass.findUnique.mockResolvedValue({
      ...validPass,
      validFrom: new Date(now.getTime() - 20000),
      validUntil: new Date(now.getTime() - 10000),
    });
    const resExpired = await visitorsService.verifyGatePass({
      passIdOrQrToken: 'pass-valid',
      siteId: 'site-hq',
    });
    expect(resExpired.valid).toBe(false);
    expect(resExpired.status).toBe(PassStatus.EXPIRED);
  });

  it('records gate entry and gate exit', async () => {
    const now = new Date();
    const pass = {
      id: 'pass-flow',
      visitorId: 'vis-2',
      siteId: 'site-hq',
      passIdHash: '000000000000000000000000000000000000000000000000000000000000pass',
      validFrom: new Date(now.getTime() - 10000),
      validUntil: new Date(now.getTime() + 100000),
      status: PassStatus.ISSUED,
      site: {
        id: 'site-hq',
        name: 'Main HQ',
        siteIdHash: '1111111111111111111111111111111111111111111111111111111111111111',
        timezone: 'UTC',
        createdAt: now,
        updatedAt: now,
      },
      visitor: {
        id: 'vis-2',
        nameEnc: encryptionService.encrypt('Charlie'),
        emailEnc: encryptionService.encrypt('charlie@example.com'),
        createdAt: now,
        updatedAt: now,
      },
    };

    mockPrisma.visitorPass.findUnique.mockResolvedValue(pass);
    mockPrisma.visitorPass.update.mockImplementation(({ data }: any) => ({
      ...pass,
      ...data,
    }));
    mockPrisma.gateLog.create.mockImplementation(({ data }: any) => ({
      id: 'gate-1',
      ...data,
      pass,
      site: pass.site,
    }));

    // Record Entry
    const entryLog = await visitorsService.recordGateEntry('guard-1', {
      passIdOrQrToken: 'pass-flow',
      siteId: 'site-hq',
    });
    expect(entryLog.type).toBe(GateEventType.ENTRY);
    expect(entryLog.pass?.status).toBe(PassStatus.ENTERED);

    // Record Exit
    mockPrisma.visitorPass.findUnique.mockResolvedValue({
      ...pass,
      status: PassStatus.ENTERED,
    });

    const exitLog = await visitorsService.recordGateExit('guard-1', {
      passIdOrQrToken: 'pass-flow',
      siteId: 'site-hq',
    });
    expect(exitLog.type).toBe(GateEventType.EXIT);
    expect(exitLog.pass?.status).toBe(PassStatus.EXITED);
  });
});
