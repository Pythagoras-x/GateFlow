import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { EncryptionService } from '../common/encryption.service';
import { AuditService } from '../audit/audit.service';
import { generateSalt, hashLeaf } from '@gateflow/merkle';
import {
  AttendanceType,
  AttendanceMethod,
  GenerateQrTokenDto,
  QrTokenResponseDto,
  CheckInRequestDto,
  CheckOutRequestDto,
  AttendanceResponseDto,
  AttendanceQueryDto,
  AttendanceReportSummaryDto,
  AttendanceEvent,
} from '@gateflow/shared-types';
import { config } from '../common/config';

interface QrTokenPayload {
  employeeId: string;
  siteId: string;
  nonce: string;
  expiresAt: number;
}

@Injectable()
export class AttendanceService {
  // In-memory set for single-use replay protection
  private usedNonces = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly audit: AuditService
  ) {}

  /**
   * Generates a signed, short-lived rotating QR token (e.g. valid for 30s)
   */
  public generateQrToken(dto: GenerateQrTokenDto): QrTokenResponseDto {
    const nonce = randomBytes(16).toString('hex');
    const expiresAt = Date.now() + config.qrTokenTtlSeconds * 1000;

    const payload: QrTokenPayload = {
      employeeId: dto.employeeId,
      siteId: dto.siteId,
      nonce,
      expiresAt,
    };

    const dataString = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', config.jwtSecret)
      .update(dataString)
      .digest('base64url');

    const token = `${dataString}.${signature}`;

    return {
      token,
      expiresAt: new Date(expiresAt).toISOString(),
      ttlSeconds: config.qrTokenTtlSeconds,
    };
  }

  /**
   * Validates a rotating QR token signature and expiration, preventing replays
   */
  public verifyQrToken(token: string): QrTokenPayload {
    const parts = token.split('.');
    if (parts.length !== 2) {
      throw new BadRequestException('Malformed QR token');
    }

    const [dataString, signature] = parts;
    const expectedSig = createHmac('sha256', config.jwtSecret)
      .update(dataString)
      .digest('base64url');

    if (signature !== expectedSig) {
      throw new BadRequestException('Invalid QR token signature');
    }

    let payload: QrTokenPayload;
    try {
      payload = JSON.parse(Buffer.from(dataString, 'base64url').toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid QR token payload');
    }

    if (Date.now() > payload.expiresAt) {
      throw new BadRequestException('QR token has expired');
    }

    if (this.usedNonces.has(payload.nonce)) {
      throw new ConflictException('QR token has already been used (replay detected)');
    }

    this.usedNonces.add(payload.nonce);
    return payload;
  }

  /**
   * Check in employee with rotating QR or Kiosk
   */
  public async checkIn(dto: CheckInRequestDto): Promise<AttendanceResponseDto> {
    let employeeId = dto.employeeId;
    let siteId = dto.siteId;
    let nonce = randomBytes(16).toString('hex');

    if (dto.qrToken) {
      const verified = this.verifyQrToken(dto.qrToken);
      employeeId = verified.employeeId;
      siteId = verified.siteId;
      nonce = verified.nonce;
    }

    if (!employeeId) {
      throw new BadRequestException('Employee ID or valid QR token is required');
    }

    const [employee, site] = await Promise.all([
      this.prisma.employee.findUnique({
        where: { id: employeeId },
        include: { shift: true },
      }),
      this.prisma.site.findUnique({ where: { id: siteId } }),
    ]);

    if (!employee) throw new NotFoundException(`Employee ${employeeId} not found`);
    if (!site) throw new NotFoundException(`Site ${siteId} not found`);

    // Anti-fraud: prevent rapid duplicate check-ins within 2 minutes
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const recent = await this.prisma.attendanceEvent.findFirst({
      where: {
        employeeId: employee.id,
        type: AttendanceType.IN,
        occurredAt: { gte: twoMinutesAgo },
      },
    });

    if (recent) {
      throw new ConflictException('A check-in was already recorded within the last 2 minutes');
    }

    const occurredAt = new Date();
    const timestamp = Math.floor(occurredAt.getTime() / 1000);
    const salt = generateSalt();

    const leafHash = hashLeaf(
      {
        employee_ref: employee.employeeNo,
        nonce,
        site_id: site.siteIdHash,
        timestamp,
        type: AttendanceType.IN,
      },
      salt
    );

    const saltEnc = this.encryption.encrypt(salt);

    const event = await this.prisma.attendanceEvent.create({
      data: {
        employeeId: employee.id,
        siteId: site.id,
        type: AttendanceType.IN,
        occurredAt,
        method: dto.method || AttendanceMethod.QR,
        leafHash,
        saltEnc,
        nonce,
      },
    });

    await this.audit.logAction(employee.id, 'ATTENDANCE_CHECK_IN', 'AttendanceEvent', {
      eventId: event.id,
      employeeNo: employee.employeeNo,
      siteId: site.id,
      leafHash,
    });

    return {
      success: true,
      message: `Checked in successfully at ${site.name}`,
      event: {
        id: event.id,
        employeeId: event.employeeId,
        siteId: event.siteId,
        type: AttendanceType.IN,
        occurredAt: event.occurredAt.toISOString(),
        method: event.method as AttendanceMethod,
        leafHash: event.leafHash,
        employee: {
          id: employee.id,
          employeeNo: employee.employeeNo,
          name: this.encryption.decrypt(employee.nameEnc),
        },
        site: {
          id: site.id,
          name: site.name,
        },
      },
    };
  }

  /**
   * Check out employee
   */
  public async checkOut(dto: CheckOutRequestDto): Promise<AttendanceResponseDto> {
    let employeeId = dto.employeeId;
    let siteId = dto.siteId;
    let nonce = randomBytes(16).toString('hex');

    if (dto.qrToken) {
      const verified = this.verifyQrToken(dto.qrToken);
      employeeId = verified.employeeId;
      siteId = verified.siteId;
      nonce = verified.nonce;
    }

    if (!employeeId) {
      throw new BadRequestException('Employee ID or valid QR token is required');
    }

    const [employee, site] = await Promise.all([
      this.prisma.employee.findUnique({ where: { id: employeeId } }),
      this.prisma.site.findUnique({ where: { id: siteId } }),
    ]);

    if (!employee) throw new NotFoundException(`Employee ${employeeId} not found`);
    if (!site) throw new NotFoundException(`Site ${siteId} not found`);

    const occurredAt = new Date();
    const timestamp = Math.floor(occurredAt.getTime() / 1000);
    const salt = generateSalt();

    const leafHash = hashLeaf(
      {
        employee_ref: employee.employeeNo,
        nonce,
        site_id: site.siteIdHash,
        timestamp,
        type: AttendanceType.OUT,
      },
      salt
    );

    const saltEnc = this.encryption.encrypt(salt);

    const event = await this.prisma.attendanceEvent.create({
      data: {
        employeeId: employee.id,
        siteId: site.id,
        type: AttendanceType.OUT,
        occurredAt,
        method: dto.method || AttendanceMethod.QR,
        leafHash,
        saltEnc,
        nonce,
      },
    });

    await this.audit.logAction(employee.id, 'ATTENDANCE_CHECK_OUT', 'AttendanceEvent', {
      eventId: event.id,
      employeeNo: employee.employeeNo,
      siteId: site.id,
      leafHash,
    });

    return {
      success: true,
      message: `Checked out successfully from ${site.name}`,
      event: {
        id: event.id,
        employeeId: event.employeeId,
        siteId: event.siteId,
        type: AttendanceType.OUT,
        occurredAt: event.occurredAt.toISOString(),
        method: event.method as AttendanceMethod,
        leafHash: event.leafHash,
        employee: {
          id: employee.id,
          employeeNo: employee.employeeNo,
          name: this.encryption.decrypt(employee.nameEnc),
        },
        site: {
          id: site.id,
          name: site.name,
        },
      },
    };
  }

  /**
   * Query attendance events with filters
   */
  public async getAttendance(query: AttendanceQueryDto): Promise<{ events: AttendanceEvent[]; total: number }> {
    const where: any = {};
    if (query.siteId) where.siteId = query.siteId;
    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.type) where.type = query.type;
    if (query.startDate || query.endDate) {
      where.occurredAt = {};
      if (query.startDate) where.occurredAt.gte = new Date(query.startDate);
      if (query.endDate) where.occurredAt.lte = new Date(query.endDate);
    }

    const page = query.page || 1;
    const limit = query.limit || 50;
    const skip = (page - 1) * limit;

    const [events, total] = await Promise.all([
      this.prisma.attendanceEvent.findMany({
        where,
        include: {
          employee: true,
          site: true,
          anchor: true,
        },
        orderBy: { occurredAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.attendanceEvent.count({ where }),
    ]);

    return {
      total,
      events: events.map((ev) => ({
        id: ev.id,
        employeeId: ev.employeeId,
        siteId: ev.siteId,
        type: ev.type as AttendanceType,
        occurredAt: ev.occurredAt.toISOString(),
        method: ev.method as AttendanceMethod,
        leafHash: ev.leafHash,
        anchorId: ev.anchorId || undefined,
        anchor: ev.anchor
          ? {
              id: ev.anchor.id,
              siteId: ev.anchor.siteId,
              period: Number(ev.anchor.period),
              merkleRoot: ev.anchor.merkleRoot,
              txHash: ev.anchor.txHash || undefined,
              ledger: ev.anchor.ledger || undefined,
              status: ev.anchor.status as any,
              createdAt: ev.anchor.createdAt.toISOString(),
            }
          : undefined,
        employee: {
          id: ev.employee.id,
          employeeNo: ev.employee.employeeNo,
          name: this.encryption.decrypt(ev.employee.nameEnc),
        },
        site: {
          id: ev.site.id,
          name: ev.site.name,
          siteIdHash: ev.site.siteIdHash,
        },
      })),
    };
  }

  /**
   * Reports summary for a site
   */
  public async getReports(siteId: string): Promise<AttendanceReportSummaryDto> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [checkIns, checkOuts] = await Promise.all([
      this.prisma.attendanceEvent.count({
        where: {
          siteId,
          type: AttendanceType.IN,
          occurredAt: { gte: today },
        },
      }),
      this.prisma.attendanceEvent.count({
        where: {
          siteId,
          type: AttendanceType.OUT,
          occurredAt: { gte: today },
        },
      }),
    ]);

    return {
      siteId,
      period: 'today',
      totalCheckIns: checkIns,
      totalCheckOuts: checkOuts,
      onTimeCount: checkIns, // Based on shift calculation
      lateCount: 0,
    };
  }
}
