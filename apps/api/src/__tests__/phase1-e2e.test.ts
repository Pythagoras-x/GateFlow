import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EncryptionService } from '../common/encryption.service';
import { AuditService } from '../audit/audit.service';
import { EmployeesService } from '../employees/employees.service';
import { SitesService } from '../sites/sites.service';
import { AttendanceService } from '../attendance/attendance.service';
import { AnchoringService } from '../anchoring/anchoring.service';
import { AttendanceType, AttendanceMethod } from '@gateflow/shared-types';
import { verifyMerkleProof, computeRootFromProof } from '@gateflow/merkle';

describe('GateFlow Phase 1 End-to-End Integration Flow', () => {
  let encryptionService: EncryptionService;
  let auditService: AuditService;
  let employeesService: EmployeesService;
  let sitesService: SitesService;
  let attendanceService: AttendanceService;
  let anchoringService: AnchoringService;

  // In-memory test state
  let sitesDb: any[] = [];
  let employeesDb: any[] = [];
  let eventsDb: any[] = [];
  let anchorsDb: any[] = [];
  let proofsDb: any[] = [];
  let mockPrisma: any;

  beforeEach(() => {
    sitesDb = [];
    employeesDb = [];
    eventsDb = [];
    anchorsDb = [];
    proofsDb = [];

    mockPrisma = {
      site: {
        findFirst: vi.fn().mockImplementation(({ where }: any) => {
          return sitesDb.find((s) => s.name === where.name) || null;
        }),
        findUnique: vi.fn().mockImplementation(({ where }: any) => {
          return sitesDb.find((s) => s.id === where.id || s.siteIdHash === where.siteIdHash) || null;
        }),
        findMany: vi.fn().mockImplementation(() => sitesDb),
        create: vi.fn().mockImplementation(({ data }: any) => {
          const site = { id: 'site-' + (sitesDb.length + 1), ...data, createdAt: new Date(), updatedAt: new Date() };
          sitesDb.push(site);
          return site;
        }),
      },
      employee: {
        findUnique: vi.fn().mockImplementation(({ where }: any) => {
          return employeesDb.find((e) => e.id === where.id || e.employeeNo === where.employeeNo) || null;
        }),
        findMany: vi.fn().mockImplementation(() => employeesDb),
        create: vi.fn().mockImplementation(({ data }: any) => {
          const emp = { id: 'emp-' + (employeesDb.length + 1), ...data, createdAt: new Date(), updatedAt: new Date() };
          employeesDb.push(emp);
          return emp;
        }),
      },
      attendanceEvent: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockImplementation(({ where }: any) => {
          return eventsDb
            .filter((e) => (where.siteId ? e.siteId === where.siteId : true) && (where.anchorId === null ? !e.anchorId : true))
            .map((e) => ({
              ...e,
              employee: employeesDb.find((emp) => emp.id === e.employeeId),
              site: sitesDb.find((s) => s.id === e.siteId),
            }));
        }),
        findUnique: vi.fn().mockImplementation(({ where }: any) => {
          const e = eventsDb.find((ev) => ev.id === where.id);
          if (!e) return null;
          return {
            ...e,
            employee: employeesDb.find((emp) => emp.id === e.employeeId),
            site: sitesDb.find((s) => s.id === e.siteId),
            anchor: anchorsDb.find((a) => a.id === e.anchorId),
            proof: proofsDb.find((p) => p.eventId === e.id),
          };
        }),
        create: vi.fn().mockImplementation(({ data }: any) => {
          const ev = { id: 'event-' + (eventsDb.length + 1), anchorId: null, occurredAt: new Date(), ...data };
          eventsDb.push(ev);
          return ev;
        }),
        update: vi.fn().mockImplementation(({ where, data }: any) => {
          const ev = eventsDb.find((e) => e.id === where.id);
          if (ev) Object.assign(ev, data);
          return ev;
        }),
      },
      anchor: {
        findUnique: vi.fn().mockImplementation(() => null),
        findMany: vi.fn().mockImplementation(() => anchorsDb),
        upsert: vi.fn().mockImplementation(({ create }: any) => {
          const anchor = { id: 'anchor-' + (anchorsDb.length + 1), ...create, createdAt: new Date() };
          anchorsDb.push(anchor);
          return anchor;
        }),
      },
      merkleProof: {
        upsert: vi.fn().mockImplementation(({ create }: any) => {
          const proof = { id: 'proof-' + (proofsDb.length + 1), ...create, createdAt: new Date() };
          proofsDb.push(proof);
          return proof;
        }),
      },
      auditLog: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
    };

    encryptionService = new EncryptionService();
    auditService = new AuditService(mockPrisma);
    sitesService = new SitesService(mockPrisma, auditService);
    employeesService = new EmployeesService(mockPrisma, encryptionService, auditService);
    attendanceService = new AttendanceService(mockPrisma, encryptionService, auditService);
    anchoringService = new AnchoringService(mockPrisma, encryptionService, auditService);

    // Share StellarClient between services in integration test
    (anchoringService as any).stellarClient = (sitesService as any).stellarClient;
  });

  it('runs complete lifecycle: Register Site -> Enrol Employee -> QR Check-In -> Anchor Merkle Root -> Verify Proof', async () => {
    // 1. Register Site (also registers on Stellar smart contract)
    const siteResult = await sitesService.createSite(
      {
        name: 'Pythagoras HQ',
        timezone: 'America/New_York',
        latitude: 40.7128,
        longitude: -74.006,
      },
      'admin-actor'
    );
    expect(siteResult.site.name).toBe('Pythagoras HQ');
    expect(siteResult.onchainRegistered).toBe(true);
    const siteId = siteResult.site.id;

    // 2. Enrol Employee (PII encrypted with AES-256-GCM)
    const empResult = await employeesService.createEmployee(
      {
        employeeNo: 'EMP-9001',
        name: 'Elena Rostova',
        phone: '+1-555-0149',
        department: 'Security & Infrastructure',
      },
      'admin-actor'
    );
    expect(empResult.employeeNo).toBe('EMP-9001');
    expect(empResult.name).toBe('Elena Rostova');
    const employeeId = empResult.id;

    // Verify stored name is encrypted in database
    expect(employeesDb[0].nameEnc).not.toBe('Elena Rostova');
    expect(encryptionService.decrypt(employeesDb[0].nameEnc)).toBe('Elena Rostova');

    // 3. Issue Rotating QR Token
    const qrTokenResult = attendanceService.generateQrToken({
      employeeId,
      siteId,
    });
    expect(qrTokenResult.token).toBeDefined();
    expect(qrTokenResult.ttlSeconds).toBe(30);

    // 4. Employee presents QR at Gate -> Check-In
    const checkInResult = await attendanceService.checkIn({
      qrToken: qrTokenResult.token,
      siteId,
      method: AttendanceMethod.QR,
    });
    expect(checkInResult.success).toBe(true);
    expect(checkInResult.event.type).toBe(AttendanceType.IN);
    expect(checkInResult.event.leafHash).toHaveLength(64);
    const eventId = checkInResult.event.id;

    // 5. Trigger Daily Merkle Anchoring to Soroban Smart Contract
    const periodTimestamp = 1715000000;
    const anchorRecord = await anchoringService.runAnchoring(siteId, periodTimestamp);
    expect(anchorRecord.status).toBe('CONFIRMED');
    expect(anchorRecord.merkleRoot).toHaveLength(64);
    expect(anchorRecord.txHash).toBeDefined();

    // 6. Retrieve Full Merkle Proof Bundle for the Employee Check-In Event
    const proofBundle = await anchoringService.getProofBundleForEvent(eventId);
    expect(proofBundle.leaf).toBe(checkInResult.event.leafHash);
    expect(proofBundle.root).toBe(anchorRecord.merkleRoot);
    expect(proofBundle.period).toBe(periodTimestamp);
    expect(proofBundle.rawEvent?.employeeRef).toBe('EMP-9001');

    // 7. Independent Cryptographic Proof Verification
    const computedRoot = computeRootFromProof(proofBundle.leaf, proofBundle.proof);
    expect(computedRoot.toLowerCase()).toBe(proofBundle.root.toLowerCase());

    const isProofValid = verifyMerkleProof(proofBundle.leaf, proofBundle.proof, proofBundle.root);
    expect(isProofValid).toBe(true);

    // 8. Public Verifier Service Validation against On-Chain Contract
    const verificationReport = await anchoringService.verifyProof({
      proofBundle,
    });
    expect(verificationReport.valid).toBe(true);
    expect(verificationReport.rootMatchesOnchain).toBe(true);
    expect(verificationReport.status).toBe('VERIFIED');
  });
});
