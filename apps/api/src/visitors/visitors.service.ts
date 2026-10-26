import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { EncryptionService } from '../common/encryption.service';
import { AuditService } from '../audit/audit.service';
import { StellarClient, stringToBytes32 } from '@gateflow/stellar-client';
import { config } from '../common/config';
import {
  CreateVisitorDto,
  IssuePassDto,
  RevokePassDto,
  GateVerifyPassRequestDto,
  GateVerifyPassResponseDto,
  GateRecordEntryDto,
  GateRecordExitDto,
  WalkInRegistrationDto,
  Visitor,
  VisitorPass,
  GateLog,
  PassStatus,
  GateEventType,
  VisitorStatus,
  UserRole,
} from '@gateflow/shared-types';

@Injectable()
export class VisitorsService {
  private stellarClient: StellarClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly audit: AuditService
  ) {
    this.stellarClient = new StellarClient({
      networkPassphrase: config.stellar.networkPassphrase,
      rpcUrl: config.stellar.rpcUrl,
      coreContractId: config.stellar.coreContractId,
      visitorsContractId: config.stellar.visitorsContractId,
      sponsorSecret: config.stellar.sponsorSecret,
      useMock: config.stellar.useMock,
    });
  }

  public setStellarClient(client: StellarClient) {
    this.stellarClient = client;
  }

  /**
   * Pre-register a visitor with encrypted PII.
   */
  public async createVisitor(hostId: string, dto: CreateVisitorDto): Promise<Visitor> {
    const nameEnc = this.encryption.encrypt(dto.name.trim());
    const emailEnc = this.encryption.encrypt(dto.email.toLowerCase().trim());
    const phoneEnc = dto.phone ? this.encryption.encrypt(dto.phone.trim()) : undefined;
    const companyEnc = dto.company ? this.encryption.encrypt(dto.company.trim()) : undefined;

    const visitor = await this.prisma.visitor.create({
      data: {
        nameEnc,
        emailEnc,
        phoneEnc,
        companyEnc,
        purpose: dto.purpose,
        hostId: dto.hostId || hostId,
        status: VisitorStatus.PRE_REGISTERED,
      },
    });

    await this.audit.logAction(hostId, 'VISITOR_PRE_REGISTERED', 'Visitor', {
      visitorId: visitor.id,
      hostId: visitor.hostId,
      purpose: visitor.purpose,
    });

    return this.decryptVisitor(visitor);
  }

  /**
   * Retrieve visitors, optionally filtered by host.
   */
  public async getVisitors(hostId?: string, userRole?: string): Promise<Visitor[]> {
    const where: any = {};
    if (userRole === UserRole.Host && hostId) {
      where.hostId = hostId;
    }

    const visitors = await this.prisma.visitor.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return visitors.map((v) => this.decryptVisitor(v));
  }

  /**
   * Retrieve single visitor by ID.
   */
  public async getVisitorById(visitorId: string): Promise<Visitor> {
    const visitor = await this.prisma.visitor.findUnique({
      where: { id: visitorId },
    });
    if (!visitor) {
      throw new NotFoundException(`Visitor not found: ${visitorId}`);
    }
    return this.decryptVisitor(visitor);
  }

  /**
   * Issue an on-chain visitor pass with time bounds.
   */
  public async issuePass(hostId: string, dto: IssuePassDto): Promise<VisitorPass> {
    const visitor = await this.prisma.visitor.findUnique({
      where: { id: dto.visitorId },
    });
    if (!visitor) {
      throw new NotFoundException(`Visitor not found: ${dto.visitorId}`);
    }

    const site = await this.prisma.site.findUnique({
      where: { id: dto.siteId },
    });
    if (!site) {
      throw new NotFoundException(`Site not found: ${dto.siteId}`);
    }

    const validFromDate = new Date(dto.validFrom);
    const validUntilDate = new Date(dto.validUntil);

    if (isNaN(validFromDate.getTime()) || isNaN(validUntilDate.getTime())) {
      throw new BadRequestException('Invalid date format for validFrom or validUntil');
    }

    if (validUntilDate <= validFromDate) {
      throw new BadRequestException('validUntil must be strictly after validFrom');
    }

    // Pass hash and unique 32-byte on-chain ID
    const passNonce = randomBytes(16).toString('hex');
    const passIdHash = createHash('sha256')
      .update(`${visitor.id}:${site.id}:${passNonce}:${Date.now()}`)
      .digest('hex');

    const passHash = createHash('sha256')
      .update(`${visitor.emailEnc}:${site.siteIdHash}:${validFromDate.toISOString()}:${validUntilDate.toISOString()}`)
      .digest('hex');

    const validFromUnix = Math.floor(validFromDate.getTime() / 1000);
    const validUntilUnix = Math.floor(validUntilDate.getTime() / 1000);

    // QR Token containing pass info signed
    const qrPayload = JSON.stringify({
      passIdHash,
      siteId: site.id,
      visitorId: visitor.id,
      validUntil: validUntilUnix,
      nonce: passNonce,
    });
    const qrSignature = createHash('sha256')
      .update(`${qrPayload}:${config.jwtSecret}`)
      .digest('hex');
    const qrToken = Buffer.from(JSON.stringify({ p: qrPayload, s: qrSignature })).toString('base64url');

    // Anchor pass issuance on Stellar Soroban smart contract
    let onchainTxHash: string | undefined;
    try {
      onchainTxHash = await this.stellarClient.issuePass(
        passIdHash,
        passHash,
        site.siteIdHash,
        validFromUnix,
        validUntilUnix
      );
    } catch (err: any) {
      console.warn(`On-chain pass issuance failed: ${err.message}. Proceeding with local pass.`);
      onchainTxHash = `mock_tx_${randomBytes(16).toString('hex')}`;
    }

    const pass = await this.prisma.visitorPass.create({
      data: {
        visitorId: visitor.id,
        hostId,
        siteId: site.id,
        passIdHash,
        passHash,
        validFrom: validFromDate,
        validUntil: validUntilDate,
        status: PassStatus.ISSUED,
        onchainTxHash,
        qrToken,
      },
      include: {
        visitor: true,
        site: true,
      },
    });

    // Update visitor status
    await this.prisma.visitor.update({
      where: { id: visitor.id },
      data: { status: VisitorStatus.APPROVED },
    });

    await this.audit.logAction(hostId, 'PASS_ISSUED', 'VisitorPass', {
      passId: pass.id,
      passIdHash,
      visitorId: visitor.id,
      siteId: site.id,
      onchainTxHash,
    });

    return this.formatVisitorPass(pass);
  }

  /**
   * Retrieve passes with optional filters.
   */
  public async getPasses(hostId?: string, userRole?: string, siteId?: string): Promise<VisitorPass[]> {
    const where: any = {};
    if (userRole === UserRole.Host && hostId) {
      where.hostId = hostId;
    }
    if (siteId) {
      where.siteId = siteId;
    }

    const passes = await this.prisma.visitorPass.findMany({
      where,
      include: {
        visitor: true,
        site: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return passes.map((p) => this.formatVisitorPass(p));
  }

  /**
   * Retrieve pass details by ID.
   */
  public async getPassById(passId: string): Promise<VisitorPass> {
    const pass = await this.prisma.visitorPass.findUnique({
      where: { id: passId },
      include: {
        visitor: true,
        site: true,
      },
    });
    if (!pass) {
      throw new NotFoundException(`Pass not found: ${passId}`);
    }
    return this.formatVisitorPass(pass);
  }

  /**
   * Revoke an active pass.
   */
  public async revokePass(
    callerId: string,
    callerRole: string,
    dto: RevokePassDto
  ): Promise<VisitorPass> {
    const pass = await this.prisma.visitorPass.findUnique({
      where: { id: dto.passId },
      include: { visitor: true, site: true },
    });
    if (!pass) {
      throw new NotFoundException(`Pass not found: ${dto.passId}`);
    }

    if (callerRole !== UserRole.Admin && pass.hostId !== callerId) {
      throw new ForbiddenException('Only the issuing host or an admin can revoke this pass');
    }

    if (pass.status === PassStatus.REVOKED) {
      throw new BadRequestException('Pass is already revoked');
    }

    // Call Soroban contract revoke
    try {
      await this.stellarClient.revokePass(pass.passIdHash);
    } catch (err: any) {
      console.warn(`On-chain pass revocation note: ${err.message}`);
    }

    const updatedPass = await this.prisma.visitorPass.update({
      where: { id: pass.id },
      data: { status: PassStatus.REVOKED },
      include: { visitor: true, site: true },
    });

    await this.audit.logAction(callerId, 'PASS_REVOKED', 'VisitorPass', {
      passId: pass.id,
      passIdHash: pass.passIdHash,
      reason: dto.reason || 'Manual revocation',
    });

    return this.formatVisitorPass(updatedPass);
  }

  /**
   * Verify a scanned pass or QR token at the gate.
   */
  public async verifyGatePass(dto: GateVerifyPassRequestDto): Promise<GateVerifyPassResponseDto> {
    const pass = await this.resolvePass(dto.passIdOrQrToken);
    if (!pass) {
      return {
        valid: false,
        status: PassStatus.EXPIRED,
        message: 'Invalid pass or unknown QR token',
      };
    }

    if (pass.siteId !== dto.siteId) {
      return {
        valid: false,
        status: pass.status as PassStatus,
        message: `Pass is not valid for this site (assigned to ${pass.site?.name || pass.siteId})`,
        pass: this.formatVisitorPass(pass),
        siteName: pass.site?.name,
      };
    }

    if (pass.status === PassStatus.REVOKED) {
      return {
        valid: false,
        status: PassStatus.REVOKED,
        message: 'Pass has been revoked by host or administrator',
        pass: this.formatVisitorPass(pass),
        onchainStatus: 'Revoked',
        siteName: pass.site?.name,
      };
    }

    const now = new Date();
    if (now > pass.validUntil) {
      return {
        valid: false,
        status: PassStatus.EXPIRED,
        message: `Pass expired at ${pass.validUntil.toLocaleTimeString()}`,
        pass: this.formatVisitorPass(pass),
        onchainStatus: 'Expired',
        siteName: pass.site?.name,
      };
    }

    if (now < pass.validFrom) {
      return {
        valid: false,
        status: PassStatus.ISSUED,
        message: `Pass is not yet active (valid from ${pass.validFrom.toLocaleTimeString()})`,
        pass: this.formatVisitorPass(pass),
        onchainStatus: 'NotYetActive',
        siteName: pass.site?.name,
      };
    }

    if (pass.status === PassStatus.EXITED) {
      return {
        valid: false,
        status: PassStatus.EXITED,
        message: 'Pass has already been used and visitor exited',
        pass: this.formatVisitorPass(pass),
        onchainStatus: 'Exited',
        siteName: pass.site?.name,
      };
    }

    // Pass is valid
    return {
      valid: true,
      status: pass.status as PassStatus,
      message: pass.status === PassStatus.ENTERED ? 'Visitor currently on site' : 'Pass valid for entry',
      pass: this.formatVisitorPass(pass),
      onchainStatus: pass.status === PassStatus.ENTERED ? 'Entered' : 'Active',
      siteName: pass.site?.name,
    };
  }

  /**
   * Record visitor entry at the gate.
   */
  public async recordGateEntry(guardId: string, dto: GateRecordEntryDto): Promise<GateLog> {
    const pass = await this.resolvePass(dto.passIdOrQrToken);
    if (!pass) {
      throw new NotFoundException('Pass not found');
    }

    const verifyResult = await this.verifyGatePass({
      passIdOrQrToken: dto.passIdOrQrToken,
      siteId: dto.siteId,
    });

    if (!verifyResult.valid) {
      throw new BadRequestException(`Cannot record entry: ${verifyResult.message}`);
    }

    if (pass.status === PassStatus.ENTERED) {
      throw new BadRequestException('Visitor is already recorded as entered on site');
    }

    // Call Soroban contract record_entry
    try {
      await this.stellarClient.recordEntry(pass.passIdHash);
    } catch (err: any) {
      console.warn(`On-chain entry record note: ${err.message}`);
    }

    const entryTime = new Date();
    const updatedPass = await this.prisma.visitorPass.update({
      where: { id: pass.id },
      data: {
        status: PassStatus.ENTERED,
        entryTime,
      },
      include: { visitor: true, site: true },
    });

    const gateLog = await this.prisma.gateLog.create({
      data: {
        passId: pass.id,
        siteId: dto.siteId,
        guardId,
        type: GateEventType.ENTRY,
        timestamp: entryTime,
        notes: dto.notes,
      },
      include: { pass: { include: { visitor: true, site: true } }, site: true },
    });

    await this.audit.logAction(guardId, 'GATE_ENTRY_RECORDED', 'GateLog', {
      gateLogId: gateLog.id,
      passId: pass.id,
      siteId: dto.siteId,
      time: entryTime.toISOString(),
    });

    return {
      id: gateLog.id,
      passId: gateLog.passId,
      siteId: gateLog.siteId,
      guardId: gateLog.guardId || undefined,
      type: GateEventType.ENTRY,
      timestamp: gateLog.timestamp.toISOString(),
      notes: gateLog.notes || undefined,
      pass: this.formatVisitorPass(updatedPass),
      site: {
        id: pass.site.id,
        name: pass.site.name,
        siteIdHash: pass.site.siteIdHash,
        timezone: pass.site.timezone,
        createdAt: pass.site.createdAt.toISOString(),
        updatedAt: pass.site.updatedAt.toISOString(),
      },
    };
  }

  /**
   * Record visitor exit at the gate.
   */
  public async recordGateExit(guardId: string, dto: GateRecordExitDto): Promise<GateLog> {
    const pass = await this.resolvePass(dto.passIdOrQrToken);
    if (!pass) {
      throw new NotFoundException('Pass not found');
    }

    if (pass.siteId !== dto.siteId) {
      throw new BadRequestException('Pass site does not match current gate site');
    }

    if (pass.status !== PassStatus.ENTERED) {
      throw new BadRequestException(`Cannot record exit: visitor status is ${pass.status}`);
    }

    // Call Soroban contract record_exit
    try {
      await this.stellarClient.recordExit(pass.passIdHash);
    } catch (err: any) {
      console.warn(`On-chain exit record note: ${err.message}`);
    }

    const exitTime = new Date();
    const updatedPass = await this.prisma.visitorPass.update({
      where: { id: pass.id },
      data: {
        status: PassStatus.EXITED,
        exitTime,
      },
      include: { visitor: true, site: true },
    });

    const gateLog = await this.prisma.gateLog.create({
      data: {
        passId: pass.id,
        siteId: dto.siteId,
        guardId,
        type: GateEventType.EXIT,
        timestamp: exitTime,
        notes: dto.notes,
      },
      include: { pass: { include: { visitor: true, site: true } }, site: true },
    });

    await this.audit.logAction(guardId, 'GATE_EXIT_RECORDED', 'GateLog', {
      gateLogId: gateLog.id,
      passId: pass.id,
      siteId: dto.siteId,
      time: exitTime.toISOString(),
    });

    return {
      id: gateLog.id,
      passId: gateLog.passId,
      siteId: gateLog.siteId,
      guardId: gateLog.guardId || undefined,
      type: GateEventType.EXIT,
      timestamp: gateLog.timestamp.toISOString(),
      notes: gateLog.notes || undefined,
      pass: this.formatVisitorPass(updatedPass),
      site: {
        id: pass.site.id,
        name: pass.site.name,
        siteIdHash: pass.site.siteIdHash,
        timezone: pass.site.timezone,
        createdAt: pass.site.createdAt.toISOString(),
        updatedAt: pass.site.updatedAt.toISOString(),
      },
    };
  }

  /**
   * Kiosk walk-in registration with instant pass issuance.
   */
  public async registerWalkIn(
    operatorId: string,
    dto: WalkInRegistrationDto
  ): Promise<VisitorPass> {
    const visitor = await this.createVisitor(dto.hostId, {
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      company: dto.company,
      purpose: dto.purpose,
      hostId: dto.hostId,
    });

    const durationHours = dto.durationHours || 4;
    const now = new Date();
    const validUntil = new Date(now.getTime() + durationHours * 3600 * 1000);

    return this.issuePass(dto.hostId, {
      visitorId: visitor.id,
      siteId: dto.siteId,
      validFrom: now.toISOString(),
      validUntil: validUntil.toISOString(),
      notes: `Walk-in registration via kiosk/guard ${operatorId}`,
    });
  }

  /**
   * List recent gate logs for a site.
   */
  public async getGateLogs(siteId?: string, limit: number = 50): Promise<GateLog[]> {
    const where: any = {};
    if (siteId) where.siteId = siteId;

    const logs = await this.prisma.gateLog.findMany({
      where,
      include: {
        pass: { include: { visitor: true, site: true } },
        site: true,
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return logs.map((log) => ({
      id: log.id,
      passId: log.passId,
      siteId: log.siteId,
      guardId: log.guardId || undefined,
      type: log.type as GateEventType,
      timestamp: log.timestamp.toISOString(),
      notes: log.notes || undefined,
      pass: log.pass ? this.formatVisitorPass(log.pass) : undefined,
      site: log.site
        ? {
            id: log.site.id,
            name: log.site.name,
            siteIdHash: log.site.siteIdHash,
            timezone: log.site.timezone,
            createdAt: log.site.createdAt.toISOString(),
            updatedAt: log.site.updatedAt.toISOString(),
          }
        : undefined,
    }));
  }

  // --- Internal Helpers ---

  private async resolvePass(passIdOrToken: string) {
    // 1. Try finding by ID
    let pass = await this.prisma.visitorPass.findUnique({
      where: { id: passIdOrToken },
      include: { visitor: true, site: true },
    });
    if (pass) return pass;

    // 2. Try finding by passIdHash
    pass = await this.prisma.visitorPass.findUnique({
      where: { passIdHash: passIdOrToken },
      include: { visitor: true, site: true },
    });
    if (pass) return pass;

    // 3. Try parsing base64url QR token
    try {
      const decoded = JSON.parse(Buffer.from(passIdOrToken, 'base64url').toString('utf8'));
      if (decoded && decoded.p) {
        const payload = JSON.parse(decoded.p);
        if (payload.passIdHash) {
          pass = await this.prisma.visitorPass.findUnique({
            where: { passIdHash: payload.passIdHash },
            include: { visitor: true, site: true },
          });
          if (pass) return pass;
        }
      }
    } catch {}

    return null;
  }

  private toIso(date?: Date | string | null): string {
    if (!date) return new Date().toISOString();
    return date instanceof Date ? date.toISOString() : new Date(date).toISOString();
  }

  private decryptVisitor(visitor: any): Visitor {
    return {
      id: visitor.id,
      tenantId: visitor.tenantId || undefined,
      name: this.encryption.decrypt(visitor.nameEnc),
      email: this.encryption.decrypt(visitor.emailEnc),
      phone: visitor.phoneEnc ? this.encryption.decrypt(visitor.phoneEnc) : undefined,
      company: visitor.companyEnc ? this.encryption.decrypt(visitor.companyEnc) : undefined,
      purpose: visitor.purpose,
      hostId: visitor.hostId,
      status: visitor.status as VisitorStatus,
      createdAt: this.toIso(visitor.createdAt),
      updatedAt: this.toIso(visitor.updatedAt),
    };
  }

  private formatVisitorPass(pass: any): VisitorPass {
    return {
      id: pass.id,
      visitorId: pass.visitorId,
      hostId: pass.hostId,
      siteId: pass.siteId,
      passIdHash: pass.passIdHash,
      passHash: pass.passHash,
      validFrom: this.toIso(pass.validFrom),
      validUntil: this.toIso(pass.validUntil),
      status: pass.status as PassStatus,
      onchainTxHash: pass.onchainTxHash || undefined,
      qrToken: pass.qrToken || undefined,
      entryTime: pass.entryTime ? this.toIso(pass.entryTime) : undefined,
      exitTime: pass.exitTime ? this.toIso(pass.exitTime) : undefined,
      visitor: pass.visitor ? this.decryptVisitor(pass.visitor) : undefined,
      site: pass.site
        ? {
            id: pass.site.id,
            name: pass.site.name,
            siteIdHash: pass.site.siteIdHash,
            timezone: pass.site.timezone,
            createdAt: this.toIso(pass.site.createdAt),
            updatedAt: this.toIso(pass.site.updatedAt),
          }
        : undefined,
      createdAt: this.toIso(pass.createdAt),
    };
  }
}
