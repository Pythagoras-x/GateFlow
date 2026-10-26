import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VisitorsService } from './visitors.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import {
  UserRole,
  GateVerifyPassRequestDto,
  GateVerifyPassResponseDto,
  GateRecordEntryDto,
  GateRecordExitDto,
  WalkInRegistrationDto,
  GateLog,
  VisitorPass,
} from '@gateflow/shared-types';

@ApiTags('Gate')
@Controller('gate')
export class GateController {
  constructor(private readonly visitorsService: VisitorsService) {}

  @Post('verify')
  @ApiOperation({ summary: 'Verify a scanned QR pass at the physical gate' })
  async verifyGatePass(
    @Body() dto: GateVerifyPassRequestDto
  ): Promise<GateVerifyPassResponseDto> {
    return this.visitorsService.verifyGatePass(dto);
  }

  @Post('entry')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin, UserRole.Security)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Record gate entry for an approved visitor pass' })
  async recordGateEntry(
    @Request() req: any,
    @Body() dto: GateRecordEntryDto
  ): Promise<GateLog> {
    return this.visitorsService.recordGateEntry(req.user.sub, dto);
  }

  @Post('exit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin, UserRole.Security)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Record gate exit for an active visitor pass' })
  async recordGateExit(
    @Request() req: any,
    @Body() dto: GateRecordExitDto
  ): Promise<GateLog> {
    return this.visitorsService.recordGateExit(req.user.sub, dto);
  }

  @Post('walk-in')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin, UserRole.Security, UserRole.Host)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register a walk-in visitor at the kiosk and issue instant pass' })
  async registerWalkIn(
    @Request() req: any,
    @Body() dto: WalkInRegistrationDto
  ): Promise<VisitorPass> {
    return this.visitorsService.registerWalkIn(req.user.sub, dto);
  }

  @Get('logs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin, UserRole.Security, UserRole.HR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List gate access events and audit history' })
  async getGateLogs(@Query('siteId') siteId?: string): Promise<GateLog[]> {
    return this.visitorsService.getGateLogs(siteId);
  }
}
