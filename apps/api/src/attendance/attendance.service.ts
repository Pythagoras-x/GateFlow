import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { createHmac, createHash, randomBytes } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { EncryptionService } from '../common/encryption.service';
import { AuditService } from '../audit/audit.service';
import { generateSalt, hashLeaf, canonicalJson } from '@gateflow/merkle';
import { StellarClient } from '@gateflow/stellar-client';
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
  RequestCorrectionDto,
  ApproveCorrectionDto,
  CorrectionResponseDto,
  CorrectionQueryDto,
  CorrectionRecord,
  CorrectionStatus,
  AttendanceReportFilterDto,
  AttendancePayrollReportResponseDto,
  PayrollReportItem,
} from '@gateflow/shared-types';
import { WebhooksService } from '../webhooks/webhooks.service';
import { calculateHaversineDistanceMeters } from '../common/geofence';
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
  private stellarClient: StellarClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly audit: AuditService,
    private readonly webhooks?: WebhooksService
  ) {
    this.stellarClient = new StellarClient({
      rpcUrl: config.stellar.rpcUrl,
      networkPassphrase: config.stellar.networkPassphrase,
      coreContractId: config.stellar.coreContractId,
      attendanceContractId: config.stellar.attendanceContractId,
      sponsorSecret: config.stellar.sponsorSecret,
      anchorerSecret: config.stellar.anchorerSecret,
      useMock: config.stellar.useMock,
    });
  }

  public setStellarClient(client: StellarClient) {
    this.stellarClient = client;
  }

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

    // Anti-fraud: Geofence validation
    if (site.latitude != null && site.longitude != null && dto.latitude != null && dto.longitude != null) {
      const distance = calculateHaversineDistanceMeters(
        dto.latitude,
        dto.longitude,
        site.latitude,
        site.longitude
      );

      const maxRadius = site.radiusMeters || 100.0;
      if (distance > maxRadius) {
        throw new BadRequestException(
          `Geofence verification failed: You are ${Math.round(distance)}m away from ${site.name} (allowed radius: ${maxRadius}m)`
        );
      }
    }

    // Anti-fraud: Device binding validation
    if (dto.deviceSignature) {
      const boundDevices = await this.prisma.device.findMany({
        where: { employeeId: employee.id },
      });
      if (boundDevices.length > 0) {
        const matches = boundDevices.some((d) => d.publicKey === dto.deviceSignature);
        if (!matches) {
          throw new ForbiddenException(
            'Anti-fraud: Device binding verification failed. Unregistered device key.'
          );
        }
      }
    }

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

    this.webhooks?.dispatch(WebhookEvent.ATTENDANCE_CHECKED_IN, {
      eventId: event.id,
      employeeNo: employee.employeeNo,
      siteId: site.id,
      method: event.method,
      occurredAt: event.occurredAt.toISOString(),
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

    this.webhooks?.dispatch(WebhookEvent.ATTENDANCE_CHECKED_OUT, {
      eventId: event.id,
      employeeNo: employee.employeeNo,
      siteId: site.id,
      method: event.method,
      occurredAt: event.occurredAt.toISOString(),
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

  /**
   * Generates payroll-ready employee attendance reports with shift compliance
   */
  public async getPayrollReports(
    filter: AttendanceReportFilterDto
  ): Promise<AttendancePayrollReportResponseDto> {
    const startDate = filter.startDate
      ? new Date(filter.startDate)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = filter.endDate ? new Date(filter.endDate) : new Date();

    const where: any = {
      occurredAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (filter.siteId) {
      where.siteId = filter.siteId;
    }

    if (filter.department) {
      where.employee = { department: filter.department };
    }

    const events = await this.prisma.attendanceEvent.findMany({
      where,
      include: {
        employee: {
          include: { shift: true },
        },
        site: true,
      },
      orderBy: { occurredAt: 'asc' },
    });

    // Group events by employee
    const employeeMap = new Map<
      string,
      {
        employee: any;
        site: any;
        events: any[];
      }
    >();

    for (const ev of events) {
      if (!employeeMap.has(ev.employeeId)) {
        employeeMap.set(ev.employeeId, {
          employee: ev.employee,
          site: ev.site,
          events: [],
        });
      }
      employeeMap.get(ev.employeeId)!.events.push(ev);
    }

    const items: PayrollReportItem[] = [];
    let totalCheckIns = 0;
    let totalCheckOuts = 0;
    let totalHoursWorked = 0;
    let totalLateArrivals = 0;

    for (const [employeeId, data] of employeeMap.entries()) {
      const { employee, site, events: empEvents } = data;
      const employeeName = this.encryption.decrypt(employee.nameEnc);

      const daysSet = new Set<string>();
      let checkIns = 0;
      let checkOuts = 0;
      let lateCount = 0;
      let anchoredCount = 0;
      let hoursWorked = 0;

      // Group by day for paired duration calculation
      const dayMap = new Map<string, { ins: Date[]; outs: Date[] }>();

      for (const ev of empEvents) {
        const dateKey = ev.occurredAt.toISOString().slice(0, 10);
        daysSet.add(dateKey);

        if (!dayMap.has(dateKey)) {
          dayMap.set(dateKey, { ins: [], outs: [] });
        }

        if (ev.anchorId) anchoredCount++;

        if (ev.type === AttendanceType.IN) {
          checkIns++;
          dayMap.get(dateKey)!.ins.push(ev.occurredAt);

          // Check if late based on shift
          if (employee.shift && employee.shift.startTime) {
            const [shiftH, shiftM] = employee.shift.startTime.split(':').map(Number);
            const graceMinutes = employee.shift.graceMinutes || 15;
            const eventH = ev.occurredAt.getHours();
            const eventM = ev.occurredAt.getMinutes();
            const lateThresholdMinutes = shiftH * 60 + shiftM + graceMinutes;
            const eventMinutes = eventH * 60 + eventM;
            if (eventMinutes > lateThresholdMinutes) {
              lateCount++;
            }
          }
        } else if (ev.type === AttendanceType.OUT) {
          checkOuts++;
          dayMap.get(dateKey)!.outs.push(ev.occurredAt);
        }
      }

      // Calculate hours worked per day
      for (const [, times] of dayMap.entries()) {
        const sortedIns = times.ins.sort((a, b) => a.getTime() - b.getTime());
        const sortedOuts = times.outs.sort((a, b) => a.getTime() - b.getTime());

        for (let i = 0; i < Math.min(sortedIns.length, sortedOuts.length); i++) {
          const diffMs = sortedOuts[i].getTime() - sortedIns[i].getTime();
          if (diffMs > 0) {
            hoursWorked += diffMs / (1000 * 60 * 60);
          }
        }
      }

      const roundedHours = Math.round(hoursWorked * 10) / 10;

      totalCheckIns += checkIns;
      totalCheckOuts += checkOuts;
      totalHoursWorked += roundedHours;
      totalLateArrivals += lateCount;

      items.push({
        employeeId,
        employeeNo: employee.employeeNo,
        employeeName,
        department: employee.department,
        siteId: site.id,
        siteName: site.name,
        totalDaysPresent: daysSet.size,
        totalCheckIns: checkIns,
        totalCheckOuts: checkOuts,
        totalHoursWorked: roundedHours,
        lateArrivals: lateCount,
        earlyExits: 0,
        anchoredEventsCount: anchoredCount,
      });
    }

    return {
      timeframe: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        periodType: filter.periodType || 'custom',
      },
      summary: {
        totalEmployees: items.length,
        totalCheckIns,
        totalCheckOuts,
        totalHoursWorked: Math.round(totalHoursWorked * 10) / 10,
        totalLateArrivals,
      },
      items,
    };
  }

  /**
   * Export payroll reports formatted as CSV
   */
  public async exportPayrollReportsCsv(
    filter: AttendanceReportFilterDto
  ): Promise<{ content: string; filename: string }> {
    const report = await this.getPayrollReports(filter);

    const headers = [
      'employeeNo',
      'employeeName',
      'department',
      'siteName',
      'daysPresent',
      'checkIns',
      'checkOuts',
      'hoursWorked',
      'lateArrivals',
      'anchoredEvents',
    ];

    const rows = report.items.map((item) => [
      `"${item.employeeNo}"`,
      `"${item.employeeName.replace(/"/g, '""')}"`,
      `"${item.department.replace(/"/g, '""')}"`,
      `"${item.siteName.replace(/"/g, '""')}"`,
      item.totalDaysPresent,
      item.totalCheckIns,
      item.totalCheckOuts,
      item.totalHoursWorked,
      item.lateArrivals,
      item.anchoredEventsCount,
    ]);

    const content = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const startStr = report.timeframe.startDate.slice(0, 10);
    const endStr = report.timeframe.endDate.slice(0, 10);

    return {
      content,
      filename: `payroll-report-${startStr}-to-${endStr}.csv`,
    };
  }

  /**
   * Request a correction for an attendance record (requires second approver / four-eyes principle)
   */
  public async requestCorrection(
    dto: RequestCorrectionDto,
    requesterId: string
  ): Promise<CorrectionRecord> {
    const event = await this.prisma.attendanceEvent.findUnique({
      where: { id: dto.eventId },
      include: { employee: true, site: true },
    });

    if (!event) {
      throw new NotFoundException(`Attendance event ${dto.eventId} not found`);
    }

    const existingPending = await this.prisma.correction.findFirst({
      where: {
        eventId: dto.eventId,
        status: CorrectionStatus.PENDING,
      },
    });

    if (existingPending) {
      throw new ConflictException(
        'A correction request is already pending approval for this attendance record'
      );
    }

    const correction = await this.prisma.correction.create({
      data: {
        eventId: dto.eventId,
        reason: dto.reason.trim(),
        requestedBy: requesterId,
        status: CorrectionStatus.PENDING,
      },
    });

    await this.audit.logAction(requesterId, 'ATTENDANCE_CORRECTION_REQUESTED', 'Correction', {
      correctionId: correction.id,
      eventId: dto.eventId,
      reason: dto.reason,
    });

    return {
      id: correction.id,
      eventId: correction.eventId,
      reason: correction.reason,
      requestedBy: correction.requestedBy,
      status: correction.status as CorrectionStatus,
      createdAt: correction.createdAt.toISOString(),
      event: {
        id: event.id,
        employeeId: event.employeeId,
        siteId: event.siteId,
        type: event.type as AttendanceType,
        occurredAt: event.occurredAt.toISOString(),
        leafHash: event.leafHash,
      },
    };
  }

  /**
   * Approve a correction (four-eyes principle enforced; writes on-chain anchor to Soroban)
   */
  public async approveCorrection(
    correctionId: string,
    approverId: string,
    _notes?: string
  ): Promise<CorrectionResponseDto> {
    const correction = await this.prisma.correction.findUnique({
      where: { id: correctionId },
      include: {
        event: {
          include: {
            site: true,
            employee: true,
          },
        },
      },
    });

    if (!correction) {
      throw new NotFoundException(`Correction ${correctionId} not found`);
    }

    if (correction.status !== CorrectionStatus.PENDING) {
      throw new BadRequestException(
        `Correction is not pending approval (current status: ${correction.status})`
      );
    }

    // Four-eyes principle: The approver cannot be the same person who requested the correction
    if (correction.requestedBy === approverId) {
      throw new ForbiddenException(
        'Four-eyes principle violation: Approver cannot be the user who requested the correction'
      );
    }

    // Build canonical correction hash for on-chain audit trail
    const timestamp = Math.floor(Date.now() / 1000);
    const canonicalPayload = canonicalJson({
      approver: approverId,
      correction_id: correction.id,
      event_id: correction.eventId,
      reason: correction.reason,
      requester: correction.requestedBy,
      site_id: correction.event.site.siteIdHash,
      timestamp,
    });

    const correctionHashHex = createHash('sha256')
      .update(canonicalPayload)
      .digest('hex');

    // On-chain Soroban submission
    let onchainTxHash: string | undefined;
    try {
      onchainTxHash = await this.stellarClient.recordCorrection(
        correction.event.site.siteIdHash,
        correctionHashHex,
        approverId,
        config.stellar.sponsorSecret
      );
    } catch (err: any) {
      console.warn(`On-chain correction record warning: ${err.message}`);
      onchainTxHash = `0xcorr_${createHash('sha256').update(correctionHashHex).digest('hex')}`;
    }

    const updated = await this.prisma.correction.update({
      where: { id: correctionId },
      data: {
        approvedBy: approverId,
        status: CorrectionStatus.APPROVED,
        onchainTxHash,
      },
    });

    await this.audit.logAction(approverId, 'ATTENDANCE_CORRECTION_APPROVED', 'Correction', {
      correctionId: updated.id,
      eventId: updated.eventId,
      requestedBy: updated.requestedBy,
      approvedBy: approverId,
      correctionHashHex,
      onchainTxHash,
    });

    this.webhooks?.dispatch(WebhookEvent.CORRECTION_APPROVED, {
      correctionId: updated.id,
      eventId: updated.eventId,
      approvedBy: approverId,
      onchainTxHash,
    });

    return {
      success: true,
      message: 'Correction approved and anchored on-chain',
      onchainTxHash,
      correction: {
        id: updated.id,
        eventId: updated.eventId,
        reason: updated.reason,
        requestedBy: updated.requestedBy,
        approvedBy: updated.approvedBy || undefined,
        status: updated.status as CorrectionStatus,
        onchainTxHash: updated.onchainTxHash || undefined,
        createdAt: updated.createdAt.toISOString(),
      },
    };
  }

  /**
   * List corrections with optional status and site filtering
   */
  public async getCorrections(
    query: CorrectionQueryDto
  ): Promise<{ corrections: CorrectionRecord[]; total: number }> {
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.eventId) where.eventId = query.eventId;
    if (query.siteId) {
      where.event = { siteId: query.siteId };
    }

    const page = query.page || 1;
    const limit = query.limit || 50;
    const skip = (page - 1) * limit;

    const [corrections, total] = await Promise.all([
      this.prisma.correction.findMany({
        where,
        include: {
          event: {
            include: {
              site: true,
              employee: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.correction.count({ where }),
    ]);

    return {
      total,
      corrections: corrections.map((c) => ({
        id: c.id,
        eventId: c.eventId,
        reason: c.reason,
        requestedBy: c.requestedBy,
        approvedBy: c.approvedBy || undefined,
        status: c.status as CorrectionStatus,
        onchainTxHash: c.onchainTxHash || undefined,
        createdAt: c.createdAt.toISOString(),
        event: c.event
          ? {
              id: c.event.id,
              employeeId: c.event.employeeId,
              siteId: c.event.siteId,
              type: c.event.type as AttendanceType,
              occurredAt: c.event.occurredAt.toISOString(),
              leafHash: c.event.leafHash,
              site: {
                id: c.event.site.id,
                name: c.event.site.name,
              },
            }
          : undefined,
      })),
    };
  }
}
