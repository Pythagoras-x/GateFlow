import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ComplianceService, ErasureResult } from './compliance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@gateflow/shared-types';

export class SubjectErasureDto {
  subjectType: 'Employee' | 'Visitor';
  subjectId: string;
  reason: string;
}

@ApiTags('Compliance')
@Controller('compliance')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Post('erasure')
  @Roles(UserRole.Admin, UserRole.HR)
  @ApiOperation({
    summary: 'Execute GDPR Art. 17 / NDPR cryptographic erasure (purges PII and salts)',
  })
  async eraseSubject(
    @Body() body: SubjectErasureDto,
    @Request() req: any
  ): Promise<ErasureResult> {
    return this.complianceService.eraseSubjectData(
      body.subjectType,
      body.subjectId,
      req.user.id,
      body.reason
    );
  }
}
