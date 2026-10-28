import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import {
  UserRole,
  GenerateQrTokenDto,
  QrTokenResponseDto,
  CheckInRequestDto,
  CheckOutRequestDto,
  AttendanceResponseDto,
  AttendanceQueryDto,
  AttendanceReportSummaryDto,
  RequestCorrectionDto,
  ApproveCorrectionDto,
  CorrectionResponseDto,
  CorrectionQueryDto,
  CorrectionRecord,
} from '@gateflow/shared-types';

@ApiTags('Attendance')
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('qr-token')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate a short-lived rotating QR token' })
  generateQrToken(@Body() body: GenerateQrTokenDto): QrTokenResponseDto {
    return this.attendanceService.generateQrToken(body);
  }

  @Post('check-in')
  @ApiOperation({ summary: 'Check in via rotating QR or Kiosk' })
  async checkIn(@Body() body: CheckInRequestDto): Promise<AttendanceResponseDto> {
    return this.attendanceService.checkIn(body);
  }

  @Post('check-out')
  @ApiOperation({ summary: 'Check out via rotating QR or Kiosk' })
  async checkOut(@Body() body: CheckOutRequestDto): Promise<AttendanceResponseDto> {
    return this.attendanceService.checkOut(body);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin, UserRole.HR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Query attendance records with filters' })
  async getAttendance(@Query() query: AttendanceQueryDto) {
    return this.attendanceService.getAttendance(query);
  }

  @Get('reports')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin, UserRole.HR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Daily/weekly attendance report summary' })
  async getReports(@Query('siteId') siteId: string): Promise<AttendanceReportSummaryDto> {
    return this.attendanceService.getReports(siteId);
  }

  @Post('corrections')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.HR, UserRole.Admin)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Request an attendance correction' })
  async requestCorrection(
    @Body() body: RequestCorrectionDto,
    @Request() req: any
  ): Promise<CorrectionRecord> {
    return this.attendanceService.requestCorrection(body, req.user.id);
  }

  @Post('corrections/:id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin, UserRole.HR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve a correction and anchor on-chain (four-eyes principle)' })
  async approveCorrection(
    @Param('id') id: string,
    @Body() body: ApproveCorrectionDto,
    @Request() req: any
  ): Promise<CorrectionResponseDto> {
    return this.attendanceService.approveCorrection(id, req.user.id, body?.notes);
  }

  @Get('corrections')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.Admin, UserRole.HR, UserRole.Auditor)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List attendance corrections' })
  async getCorrections(@Query() query: CorrectionQueryDto) {
    return this.attendanceService.getCorrections(query);
  }
}
