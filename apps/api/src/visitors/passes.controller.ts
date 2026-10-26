import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VisitorsService } from './visitors.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole, IssuePassDto, RevokePassDto, VisitorPass } from '@gateflow/shared-types';

@ApiTags('Passes')
@Controller('passes')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class PassesController {
  constructor(private readonly visitorsService: VisitorsService) {}

  @Post()
  @Roles(UserRole.Admin, UserRole.Host, UserRole.HR)
  @ApiOperation({ summary: 'Issue a time-bound visitor pass anchored on Stellar Soroban' })
  async issuePass(@Request() req: any, @Body() dto: IssuePassDto): Promise<VisitorPass> {
    return this.visitorsService.issuePass(req.user.sub, dto);
  }

  @Get()
  @Roles(UserRole.Admin, UserRole.Host, UserRole.HR, UserRole.Security)
  @ApiOperation({ summary: 'List visitor passes' })
  async getPasses(@Request() req: any, @Query('siteId') siteId?: string): Promise<VisitorPass[]> {
    return this.visitorsService.getPasses(req.user.sub, req.user.role, siteId);
  }

  @Get(':id')
  @Roles(UserRole.Admin, UserRole.Host, UserRole.HR, UserRole.Security)
  @ApiOperation({ summary: 'Get pass details and on-chain status' })
  async getPassById(@Param('id') id: string): Promise<VisitorPass> {
    return this.visitorsService.getPassById(id);
  }

  @Post(':id/revoke')
  @Roles(UserRole.Admin, UserRole.Host)
  @ApiOperation({ summary: 'Revoke a pass immediately on-chain' })
  async revokePass(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { reason?: string }
  ): Promise<VisitorPass> {
    return this.visitorsService.revokePass(req.user.sub, req.user.role, {
      passId: id,
      reason: body?.reason,
    });
  }
}
