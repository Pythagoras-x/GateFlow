import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SitesService } from './sites.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@gateflow/shared-types';
import { CreateSiteDto, SiteResponseDto } from '@gateflow/shared-types';

@ApiTags('Sites')
@Controller('sites')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class SitesController {
  constructor(private readonly sitesService: SitesService) {}

  @Post()
  @Roles(UserRole.Admin)
  @ApiOperation({ summary: 'Register a new site (also registers on-chain)' })
  async createSite(
    @Body() body: CreateSiteDto,
    @Request() req: any
  ): Promise<SiteResponseDto> {
    return this.sitesService.createSite(body, req.user.id);
  }

  @Get()
  @Roles(UserRole.Admin, UserRole.HR, UserRole.Security)
  @ApiOperation({ summary: 'List all sites with on-chain status' })
  async getSites(): Promise<SiteResponseDto[]> {
    return this.sitesService.getSites();
  }

  @Get(':id')
  @Roles(UserRole.Admin, UserRole.HR, UserRole.Security)
  @ApiOperation({ summary: 'Get site by ID' })
  async getSiteById(@Param('id') id: string): Promise<SiteResponseDto> {
    return this.sitesService.getSiteById(id);
  }
}
