import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../common/prisma.service';

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
}
