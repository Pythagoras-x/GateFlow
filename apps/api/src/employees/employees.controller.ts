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
import { EmployeesService } from './employees.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole, CreateEmployeeDto, BindDeviceDto, Employee } from '@gateflow/shared-types';

@ApiTags('Employees')
@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @Roles(UserRole.Admin, UserRole.HR)
  @ApiOperation({ summary: 'Enrol a new employee (PII encrypted)' })
  async createEmployee(
    @Body() body: CreateEmployeeDto,
    @Request() req: any
  ): Promise<Employee> {
    return this.employeesService.createEmployee(body, req.user.id);
  }

  @Get()
  @Roles(UserRole.Admin, UserRole.HR, UserRole.Security)
  @ApiOperation({ summary: 'List all employees' })
  async getEmployees(): Promise<Employee[]> {
    return this.employeesService.getEmployees();
  }

  @Get(':id')
  @Roles(UserRole.Admin, UserRole.HR, UserRole.Security)
  @ApiOperation({ summary: 'Get employee details by ID' })
  async getEmployeeById(@Param('id') id: string): Promise<Employee> {
    return this.employeesService.getEmployeeById(id);
  }

  @Post(':id/devices')
  @Roles(UserRole.Admin, UserRole.HR)
  @ApiOperation({ summary: 'Bind a trusted device public key' })
  async bindDevice(
    @Param('id') id: string,
    @Body() body: BindDeviceDto,
    @Request() req: any
  ) {
    return this.employeesService.bindDevice(id, body, req.user.id);
  }
}
