import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VisitorsService } from './visitors.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole, CreateVisitorDto, Visitor } from '@gateflow/shared-types';

@ApiTags('Visitors')
@Controller('visitors')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class VisitorsController {
  constructor(private readonly visitorsService: VisitorsService) {}

  @Post()
  @Roles(UserRole.Admin, UserRole.Host, UserRole.HR)
  @ApiOperation({ summary: 'Pre-register a visitor with encrypted personal data' })
  async createVisitor(@Request() req: any, @Body() dto: CreateVisitorDto): Promise<Visitor> {
    return this.visitorsService.createVisitor(req.user.sub, dto);
  }

  @Get()
  @Roles(UserRole.Admin, UserRole.Host, UserRole.HR, UserRole.Security)
  @ApiOperation({ summary: 'List pre-registered visitors' })
  async getVisitors(@Request() req: any): Promise<Visitor[]> {
    return this.visitorsService.getVisitors(req.user.sub, req.user.role);
  }

  @Get(':id')
  @Roles(UserRole.Admin, UserRole.Host, UserRole.HR, UserRole.Security)
  @ApiOperation({ summary: 'Get visitor profile details' })
  async getVisitorById(@Param('id') id: string): Promise<Visitor> {
    return this.visitorsService.getVisitorById(id);
  }
}
