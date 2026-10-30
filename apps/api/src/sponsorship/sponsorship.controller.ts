import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SponsorshipService } from './sponsorship.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import {
  UserRole,
  SponsorshipStatusResponseDto,
  SponsoredTxListResponseDto,
  WrapSponsoredTxRequestDto,
  WrapSponsoredTxResponseDto,
  UpdateSponsorshipConfigDto,
  SponsorshipGuardConfig,
} from '@gateflow/shared-types';

@ApiTags('Sponsorship')
@Controller('sponsorship')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class SponsorshipController {
  constructor(private readonly sponsorshipService: SponsorshipService) {}

  @Get('status')
  @Roles(UserRole.Admin, UserRole.Auditor, UserRole.HR)
  @ApiOperation({ summary: 'Get sponsor account balance, health status, and velocity spending metrics' })
  async getStatus(): Promise<SponsorshipStatusResponseDto> {
    return this.sponsorshipService.getStatus();
  }

  @Get('history')
  @Roles(UserRole.Admin, UserRole.Auditor, UserRole.HR)
  @ApiOperation({ summary: 'Get paginated list of sponsored fee-bump transactions' })
  async getHistory(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ): Promise<SponsoredTxListResponseDto> {
    const lim = limit ? parseInt(limit, 10) : 50;
    const off = offset ? parseInt(offset, 10) : 0;
    return this.sponsorshipService.getHistory(lim, off);
  }

  @Post('wrap')
  @Roles(UserRole.Admin, UserRole.Security)
  @ApiOperation({ summary: 'Evaluate and wrap an inner transaction with sponsor fee bump' })
  async wrapTransaction(
    @Body() body: WrapSponsoredTxRequestDto
  ): Promise<WrapSponsoredTxResponseDto> {
    return this.sponsorshipService.wrapTransaction(body);
  }

  @Patch('config')
  @Roles(UserRole.Admin)
  @ApiOperation({ summary: 'Update fee sponsorship spending guard limits and whitelists' })
  async updateConfig(
    @Body() body: UpdateSponsorshipConfigDto,
    @Req() req: any
  ): Promise<SponsorshipGuardConfig> {
    const actorId = req.user?.id || 'admin';
    return this.sponsorshipService.updateConfig(body, actorId);
  }
}
