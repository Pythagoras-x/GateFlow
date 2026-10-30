import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import { WebhooksService } from '../webhooks.service';
import { WebhookEvent } from '@gateflow/shared-types';

describe('WebhooksService', () => {
  let webhooksService: WebhooksService;
  let mockPrisma: any;
  let mockAudit: any;

  beforeEach(() => {
    mockPrisma = {
      webhook: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      webhookDeliveryLog: {
        create: vi.fn().mockResolvedValue({ id: 'log-1' }),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    mockAudit = {
      logAction: vi.fn().mockResolvedValue(undefined),
    };

    webhooksService = new WebhooksService(mockPrisma, mockAudit);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers a webhook and generates secure HMAC secret', async () => {
    mockPrisma.webhook.create.mockImplementation(({ data }: any) => ({
      id: 'wh-1',
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const result = await webhooksService.registerWebhook(
      {
        url: 'https://example.com/webhook',
        events: [WebhookEvent.ATTENDANCE_CHECKED_IN, WebhookEvent.VISITOR_ARRIVED],
      },
      'admin-1'
    );

    expect(result.id).toBe('wh-1');
    expect(result.url).toBe('https://example.com/webhook');
    expect(result.secret).toMatch(/^gf_sec_[0-9a-f]{48}$/);
    expect(result.events).toContain(WebhookEvent.ATTENDANCE_CHECKED_IN);
    expect(mockAudit.logAction).toHaveBeenCalled();
  });

  it('computes valid HMAC-SHA256 signature for outgoing payload', () => {
    const secret = 'gf_sec_test_secret_12345';
    const payload = JSON.stringify({ hello: 'world' });

    const signatureHeader = webhooksService.signPayload(secret, payload);
    const expected = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;

    expect(signatureHeader).toBe(expected);
  });

  it('dispatches events to subscribed webhooks with HMAC headers and logs delivery', async () => {
    const mockWebhook = {
      id: 'wh-1',
      url: 'https://example.com/webhook',
      secret: 'gf_sec_secret_123',
      events: `${WebhookEvent.ATTENDANCE_CHECKED_IN},${WebhookEvent.PASS_ISSUED}`,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockPrisma.webhook.findMany.mockResolvedValue([mockWebhook]);

    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: vi.fn().mockResolvedValue('{"received":true}'),
    });
    vi.stubGlobal('fetch', mockFetch);

    await webhooksService.dispatch(WebhookEvent.ATTENDANCE_CHECKED_IN, {
      employeeNo: 'EMP001',
      siteId: 'site-hq',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/webhook',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-GateFlow-Event': WebhookEvent.ATTENDANCE_CHECKED_IN,
          'X-GateFlow-Signature': expect.stringMatching(/^sha256=[a-f0-9]{64}$/),
        }),
      })
    );

    expect(mockPrisma.webhookDeliveryLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          webhookId: 'wh-1',
          event: WebhookEvent.ATTENDANCE_CHECKED_IN,
          responseStatus: 200,
          success: true,
        }),
      })
    );
  });

  it('handles delivery errors gracefully without crashing the application', async () => {
    const mockWebhook = {
      id: 'wh-1',
      url: 'https://example.com/broken-endpoint',
      secret: 'gf_sec_secret_123',
      events: WebhookEvent.ATTENDANCE_CHECKED_IN,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockPrisma.webhook.findMany.mockResolvedValue([mockWebhook]);

    const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused'));
    vi.stubGlobal('fetch', mockFetch);

    // Should not throw
    await expect(
      webhooksService.dispatch(WebhookEvent.ATTENDANCE_CHECKED_IN, { eventId: 'ev-1' })
    ).resolves.not.toThrow();

    expect(mockPrisma.webhookDeliveryLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          webhookId: 'wh-1',
          success: false,
        }),
      })
    );
  });
});
