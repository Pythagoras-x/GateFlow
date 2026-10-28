import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { createHmac, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  Webhook,
  WebhookDeliveryLog,
  WebhookEvent,
  CreateWebhookDto,
  UpdateWebhookDto,
} from '@gateflow/shared-types';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  /**
   * Generates HMAC-SHA256 signature string in format: "sha256=<hex>"
   */
  public signPayload(secret: string, payload: string): string {
    const signature = createHmac('sha256', secret).update(payload).digest('hex');
    return `sha256=${signature}`;
  }

  /**
   * Register a new webhook subscription
   */
  public async registerWebhook(
    dto: CreateWebhookDto,
    creatorId?: string,
    tenantId?: string
  ): Promise<Webhook> {
    if (!dto.url || !dto.url.startsWith('http')) {
      throw new BadRequestException('Webhook URL must be a valid HTTP or HTTPS endpoint');
    }

    if (!dto.events || dto.events.length === 0) {
      throw new BadRequestException('At least one event must be selected for subscription');
    }

    const secret = dto.secret || `whsec_${randomBytes(24).toString('hex')}`;
    const eventsStr = dto.events.join(',');

    const record = await this.prisma.webhook.create({
      data: {
        tenantId,
        url: dto.url.trim(),
        secret,
        events: eventsStr,
        isActive: true,
      },
    });

    if (creatorId) {
      await this.audit.logAction(creatorId, 'WEBHOOK_REGISTERED', 'Webhook', {
        webhookId: record.id,
        url: record.url,
        events: dto.events,
      });
    }

    return this.mapWebhook(record);
  }

  /**
   * List all registered webhooks
   */
  public async listWebhooks(tenantId?: string): Promise<Webhook[]> {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;

    const webhooks = await this.prisma.webhook.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return webhooks.map((w) => this.mapWebhook(w));
  }

  /**
   * Get single webhook by ID
   */
  public async getWebhookById(id: string): Promise<Webhook> {
    const webhook = await this.prisma.webhook.findUnique({ where: { id } });
    if (!webhook) {
      throw new NotFoundException(`Webhook ${id} not found`);
    }
    return this.mapWebhook(webhook);
  }

  /**
   * Update an existing webhook
   */
  public async updateWebhook(
    id: string,
    dto: UpdateWebhookDto,
    actorId?: string
  ): Promise<Webhook> {
    const existing = await this.prisma.webhook.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Webhook ${id} not found`);
    }

    const data: any = {};
    if (dto.url) data.url = dto.url.trim();
    if (dto.events) data.events = dto.events.join(',');
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const updated = await this.prisma.webhook.update({
      where: { id },
      data,
    });

    if (actorId) {
      await this.audit.logAction(actorId, 'WEBHOOK_UPDATED', 'Webhook', {
        webhookId: id,
        updates: dto,
      });
    }

    return this.mapWebhook(updated);
  }

  /**
   * Delete a webhook
   */
  public async deleteWebhook(id: string, actorId?: string): Promise<void> {
    const existing = await this.prisma.webhook.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Webhook ${id} not found`);
    }

    await this.prisma.webhook.delete({ where: { id } });

    if (actorId) {
      await this.audit.logAction(actorId, 'WEBHOOK_DELETED', 'Webhook', { webhookId: id });
    }
  }

  /**
   * Retrieve delivery logs for a given webhook
   */
  public async getDeliveryLogs(webhookId: string): Promise<WebhookDeliveryLog[]> {
    const logs = await this.prisma.webhookDeliveryLog.findMany({
      where: { webhookId },
      orderBy: { deliveredAt: 'desc' },
      take: 50,
    });

    return logs.map((l) => ({
      id: l.id,
      webhookId: l.webhookId,
      event: l.event as WebhookEvent,
      payload: l.payload,
      responseStatus: l.responseStatus || undefined,
      responseBody: l.responseBody || undefined,
      success: l.success,
      attempt: l.attempt,
      deliveredAt: l.deliveredAt.toISOString(),
    }));
  }

  /**
   * Dispatches an event to all active matching webhook endpoints asynchronously.
   * Signs payload with HMAC-SHA256 and records delivery audit logs.
   */
  public async dispatch(
    event: WebhookEvent,
    data: Record<string, unknown>,
    tenantId?: string
  ): Promise<void> {
    try {
      const where: any = { isActive: true };
      if (tenantId) where.tenantId = tenantId;

      const webhooks = await this.prisma.webhook.findMany({ where });

      const subscribedWebhooks = webhooks.filter((w) => {
        const eventsList = w.events.split(',').map((e) => e.trim());
        return eventsList.includes(event) || eventsList.includes('*');
      });

      if (subscribedWebhooks.length === 0) return;

      const envelope = {
        id: randomUUID(),
        event,
        timestamp: new Date().toISOString(),
        data,
      };
      const payloadString = JSON.stringify(envelope);

      await Promise.allSettled(
        subscribedWebhooks.map(async (webhook) => {
          const signature = this.signPayload(webhook.secret, payloadString);

          let responseStatus: number | undefined;
          let responseBody: string | undefined;
          let success = false;

          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const res = await fetch(webhook.url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'GateFlow-Webhook-Dispatcher/1.0',
                'X-GateFlow-Signature': signature,
                'X-GateFlow-Event': event,
                'X-GateFlow-Delivery': envelope.id,
              },
              body: payloadString,
              signal: controller.signal,
            });

            clearTimeout(timeoutId);
            responseStatus = res.status;
            success = res.ok;
            const text = await res.text();
            responseBody = text.slice(0, 1000); // truncate response body
          } catch (err: any) {
            this.logger.warn(`Webhook delivery failed for ${webhook.url}: ${err.message}`);
            responseBody = `Error: ${err.message}`;
            success = false;
          }

          try {
            await this.prisma.webhookDeliveryLog.create({
              data: {
                webhookId: webhook.id,
                event,
                payload: payloadString,
                responseStatus,
                responseBody,
                success,
                attempt: 1,
              },
            });
          } catch (logErr: any) {
            this.logger.error(`Failed to record webhook delivery log: ${logErr.message}`);
          }
        })
      );
    } catch (err: any) {
      this.logger.error(`Error during webhook dispatch for ${event}: ${err.message}`);
    }
  }

  /**
   * Send a test ping event to verify connectivity and signature
   */
  public async testWebhook(
    webhookId: string,
    event: WebhookEvent = WebhookEvent.ATTENDANCE_CHECKED_IN
  ): Promise<{ success: boolean; status?: number; signature: string; payload: any }> {
    const webhook = await this.prisma.webhook.findUnique({ where: { id: webhookId } });
    if (!webhook) {
      throw new NotFoundException(`Webhook ${webhookId} not found`);
    }

    const envelope = {
      id: randomUUID(),
      event,
      timestamp: new Date().toISOString(),
      data: {
        test: true,
        message: 'GateFlow test webhook ping',
        webhookId,
      },
    };

    const payloadString = JSON.stringify(envelope);
    const signature = this.signPayload(webhook.secret, payloadString);

    let status: number | undefined;
    let success = false;
    let responseBody = '';

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'GateFlow-Webhook-Dispatcher/1.0',
          'X-GateFlow-Signature': signature,
          'X-GateFlow-Event': event,
          'X-GateFlow-Delivery': envelope.id,
        },
        body: payloadString,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      status = res.status;
      success = res.ok;
      responseBody = (await res.text()).slice(0, 1000);
    } catch (err: any) {
      responseBody = `Delivery error: ${err.message}`;
    }

    await this.prisma.webhookDeliveryLog.create({
      data: {
        webhookId,
        event,
        payload: payloadString,
        responseStatus: status,
        responseBody,
        success,
        attempt: 1,
      },
    });

    return {
      success,
      status,
      signature,
      payload: envelope,
    };
  }

  private mapWebhook(raw: any): Webhook {
    return {
      id: raw.id,
      tenantId: raw.tenantId || undefined,
      url: raw.url,
      secret: raw.secret,
      events: raw.events.split(',') as WebhookEvent[],
      isActive: raw.isActive,
      createdAt: raw.createdAt.toISOString(),
      updatedAt: raw.updatedAt.toISOString(),
    };
  }
}
