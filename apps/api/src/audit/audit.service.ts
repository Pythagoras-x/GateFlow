import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import {
  AuditLog,
  AuditVerificationResult,
  AuditVerificationStatus,
  AuditLogQueryDto,
  AuditLogResponseDto,
  AuditExportQueryDto,
} from '@gateflow/shared-types';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  public async logAction(
    actorId: string,
    action: string,
    entity: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const lastLog = await this.prisma.auditLog.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    const prevHash = lastLog ? lastLog.entryHash : '0'.repeat(64);
    const payloadStr = JSON.stringify(payload);

    const entryHash = createHash('sha256')
      .update(`${prevHash}:${actorId}:${action}:${entity}:${payloadStr}`)
      .digest('hex');

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action,
        entity,
        payload: payloadStr,
        prevHash,
        entryHash,
      },
    });
  }

  /**
   * Query paginated audit logs with optional filters
   */
  public async getAuditLogs(query: AuditLogQueryDto): Promise<AuditLogResponseDto> {
    const where: any = {};
    if (query.actorId) where.actorId = query.actorId;
    if (query.action) where.action = query.action;
    if (query.entity) where.entity = query.entity;
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const page = query.page || 1;
    const limit = query.limit || 50;
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      total,
      page,
      limit,
      logs: logs.map((l) => ({
        id: l.id,
        actorId: l.actorId,
        action: l.action,
        entity: l.entity,
        payload: JSON.parse(l.payload || '{}'),
        prevHash: l.prevHash || undefined,
        entryHash: l.entryHash,
        createdAt: l.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Cryptographically verifies the integrity of the audit log hash chain
   * from genesis to the most recent entry. Detects any modified, inserted,
   * or deleted records.
   */
  public async verifyAuditChain(): Promise<AuditVerificationResult> {
    const logs = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'asc' },
    });

    if (logs.length === 0) {
      return {
        valid: true,
        status: AuditVerificationStatus.EMPTY,
        totalEntries: 0,
        message: 'Audit log chain is empty; nothing to verify',
      };
    }

    const genesisPrevHash = '0'.repeat(64);

    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      const expectedPrevHash = i === 0 ? genesisPrevHash : logs[i - 1].entryHash;

      // 1. Verify previous hash chain linkage
      if (log.prevHash !== expectedPrevHash) {
        return {
          valid: false,
          status: AuditVerificationStatus.CORRUPTED,
          totalEntries: logs.length,
          brokenAtIndex: i,
          brokenEntryId: log.id,
          expectedHash: expectedPrevHash,
          actualHash: log.prevHash || undefined,
          message: `Broken chain linkage at record #${i} (ID: ${log.id}). Expected prevHash ${expectedPrevHash.slice(0, 16)}..., found ${log.prevHash?.slice(0, 16) || 'none'}.`,
        };
      }

      // 2. Recompute the entry hash from record components
      const computedHash = createHash('sha256')
        .update(`${log.prevHash}:${log.actorId}:${log.action}:${log.entity}:${log.payload}`)
        .digest('hex');

      if (log.entryHash !== computedHash) {
        return {
          valid: false,
          status: AuditVerificationStatus.CORRUPTED,
          totalEntries: logs.length,
          brokenAtIndex: i,
          brokenEntryId: log.id,
          expectedHash: computedHash,
          actualHash: log.entryHash,
          message: `Tampered payload detected at record #${i} (ID: ${log.id}). Recomputed hash does not match stored hash.`,
        };
      }
    }

    return {
      valid: true,
      status: AuditVerificationStatus.VALID,
      totalEntries: logs.length,
      message: `Cryptographic audit chain intact across all ${logs.length} entries`,
    };
  }

  /**
   * Export audit trail in JSON or CSV for external compliance reviews
   */
  public async exportAuditLogs(
    query: AuditExportQueryDto
  ): Promise<{ format: string; content: string; filename: string }> {
    const where: any = {};
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const logs = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');

    if (query.format === 'csv') {
      const headers = ['id', 'actorId', 'action', 'entity', 'prevHash', 'entryHash', 'createdAt', 'payload'];
      const rows = logs.map((l) => [
        `"${l.id}"`,
        `"${l.actorId}"`,
        `"${l.action}"`,
        `"${l.entity}"`,
        `"${l.prevHash || ''}"`,
        `"${l.entryHash}"`,
        `"${l.createdAt.toISOString()}"`,
        `"${l.payload.replace(/"/g, '""')}"`,
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      return {
        format: 'csv',
        content: csvContent,
        filename: `audit-trail-${timestampStr}.csv`,
      };
    }

    const formattedLogs = logs.map((l) => ({
      id: l.id,
      actorId: l.actorId,
      action: l.action,
      entity: l.entity,
      prevHash: l.prevHash,
      entryHash: l.entryHash,
      createdAt: l.createdAt.toISOString(),
      payload: JSON.parse(l.payload || '{}'),
    }));

    return {
      format: 'json',
      content: JSON.stringify(formattedLogs, null, 2),
      filename: `audit-trail-${timestampStr}.json`,
    };
  }
}
