import {
  Controller,
  Get,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import {
  UserRole,
  AuditLogQueryDto,
  AuditLogResponseDto,
  AuditVerificationResult,
  AuditExportQueryDto,
} from '@gateflow/shared-types';

@ApiTags('Audit')
@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles(UserRole.Admin, UserRole.Auditor)
  @ApiOperation({ summary: 'Query paginated immutable audit logs' })
  async getAuditLogs(@Query() query: AuditLogQueryDto): Promise<AuditLogResponseDto> {
    return this.auditService.getAuditLogs(query);
  }

  @Get('verify')
  @Roles(UserRole.Admin, UserRole.Auditor)
  @ApiOperation({ summary: 'Cryptographically verify the entire audit log SHA-256 hash chain' })
  async verifyAuditChain(): Promise<AuditVerificationResult> {
    return this.auditService.verifyAuditChain();
  }

  @Get('export')
  @Roles(UserRole.Admin, UserRole.Auditor)
  @ApiOperation({ summary: 'Export audit logs as JSON or CSV file' })
  async exportAuditLogs(
    @Query() query: AuditExportQueryDto,
    @Res() res: Response
  ) {
    const result = await this.auditService.exportAuditLogs(query);

    if (query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      return res.send(result.content);
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    return res.send(result.content);
  }
}
