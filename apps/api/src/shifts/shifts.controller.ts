import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ShiftsService } from './shifts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole, Shift } from '@gateflow/shared-types';

@ApiTags('Shifts')
@Controller('shifts')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Get()
  @Roles(UserRole.Admin, UserRole.HR)
  @ApiOperation({ summary: 'List all shifts' })
  async getShifts(): Promise<Shift[]> {
    return this.shiftsService.getShifts();
  }

  @Post()
  @Roles(UserRole.Admin, UserRole.HR)
  @ApiOperation({ summary: 'Create a new shift' })
  async createShift(
    @Body() body: { name: string; startTime: string; endTime: string; graceMinutes?: number }
  ): Promise<Shift> {
    return this.shiftsService.createShift(body);
  }
}
