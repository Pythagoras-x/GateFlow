import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import {
  UserRole,
  CreateWebhookDto,
  UpdateWebhookDto,
  TestWebhookDto,
  Webhook,
  WebhookDeliveryLog,
} from '@gateflow/shared-types';

@ApiTags('Webhooks')
@Controller('webhooks')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post()
  @Roles(UserRole.Admin)
  @ApiOperation({ summary: 'Register an outbound webhook subscription' })
  async registerWebhook(
    @Body() body: CreateWebhookDto,
    @Request() req: any
  ): Promise<Webhook> {
    return this.webhooksService.registerWebhook(body, req.user.id, req.user.tenantId);
  }

  @Get()
  @Roles(UserRole.Admin)
  @ApiOperation({ summary: 'List all registered outbound webhooks' })
  async listWebhooks(@Request() req: any): Promise<Webhook[]> {
    return this.webhooksService.listWebhooks(req.user.tenantId);
  }

  @Get(':id')
  @Roles(UserRole.Admin)
  @ApiOperation({ summary: 'Get details for a registered webhook' })
  async getWebhookById(@Param('id') id: string): Promise<Webhook> {
    return this.webhooksService.getWebhookById(id);
  }

  @Patch(':id')
  @Roles(UserRole.Admin)
  @ApiOperation({ summary: 'Update webhook URL, event triggers, or active state' })
  async updateWebhook(
    @Param('id') id: string,
    @Body() body: UpdateWebhookDto,
    @Request() req: any
  ): Promise<Webhook> {
    return this.webhooksService.updateWebhook(id, body, req.user.id);
  }

  @Delete(':id')
  @Roles(UserRole.Admin)
  @ApiOperation({ summary: 'Delete a registered webhook' })
  async deleteWebhook(@Param('id') id: string, @Request() req: any): Promise<{ success: boolean }> {
    await this.webhooksService.deleteWebhook(id, req.user.id);
    return { success: true };
  }

  @Get(':id/deliveries')
  @Roles(UserRole.Admin)
  @ApiOperation({ summary: 'Get recent delivery attempt history for a webhook' })
  async getDeliveries(@Param('id') id: string): Promise<WebhookDeliveryLog[]> {
    return this.webhooksService.getDeliveryLogs(id);
  }

  @Post(':id/test')
  @Roles(UserRole.Admin)
  @ApiOperation({ summary: 'Send an immediate test ping event to verify webhook URL and HMAC signature' })
  async testWebhook(
    @Param('id') id: string,
    @Body() body: TestWebhookDto
  ) {
    return this.webhooksService.testWebhook(id, body?.event);
  }
}
