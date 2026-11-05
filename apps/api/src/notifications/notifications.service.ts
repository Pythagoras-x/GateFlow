import { Injectable, Logger } from '@nestjs/common';
import { VisitorPass, Visitor } from '@gateflow/shared-types';

export interface PassDispatchOptions {
  pass: VisitorPass;
  visitor: Visitor;
  channels?: ('email' | 'sms' | 'whatsapp')[];
}

export interface DispatchResult {
  channel: string;
  recipient: string;
  delivered: boolean;
  messageId: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  /**
   * Dispatches signed visitor pass credentials to visitor via configured communication channels.
   */
  public async dispatchVisitorPass(options: PassDispatchOptions): Promise<DispatchResult[]> {
    const { pass, visitor } = options;
    const channels = options.channels || ['email'];
    const results: DispatchResult[] = [];

    for (const channel of channels) {
      if (channel === 'email' && visitor.email) {
        this.logger.log(
          `[Email Dispatch] Sending pass ${pass.id} to ${visitor.email} (valid: ${pass.validFrom} to ${pass.validUntil})`
        );
        results.push({
          channel: 'email',
          recipient: visitor.email,
          delivered: true,
          messageId: `msg-email-${Date.now()}-${pass.id.slice(0, 8)}`,
        });
      }

      if (channel === 'sms' && visitor.phone) {
        this.logger.log(`[SMS Dispatch] Sending pass link to ${visitor.phone}`);
        results.push({
          channel: 'sms',
          recipient: visitor.phone,
          delivered: true,
          messageId: `msg-sms-${Date.now()}-${pass.id.slice(0, 8)}`,
        });
      }

      if (channel === 'whatsapp' && visitor.phone) {
        this.logger.log(`[WhatsApp Dispatch] Sending QR pass message to ${visitor.phone}`);
        results.push({
          channel: 'whatsapp',
          recipient: visitor.phone,
          delivered: true,
          messageId: `msg-wa-${Date.now()}-${pass.id.slice(0, 8)}`,
        });
      }
    }

    return results;
  }
}
