import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { EncryptionService } from '../common/encryption.service';
import { AuditService } from '../audit/audit.service';
import { CreateEmployeeDto, BindDeviceDto, Employee } from '@gateflow/shared-types';

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly audit: AuditService
  ) {}

  public async createEmployee(dto: CreateEmployeeDto, actorId: string): Promise<Employee> {
    const existing = await this.prisma.employee.findUnique({
      where: { employeeNo: dto.employeeNo },
    });
    if (existing) {
      throw new ConflictException(`Employee number "${dto.employeeNo}" already exists`);
    }

    const nameEnc = this.encryption.encrypt(dto.name);
    const phoneEnc = dto.phone ? this.encryption.encrypt(dto.phone) : undefined;

    const employee = await this.prisma.employee.create({
      data: {
        employeeNo: dto.employeeNo,
        nameEnc,
        phoneEnc,
        department: dto.department,
        shiftId: dto.shiftId,
      },
      include: { shift: true },
    });

    await this.audit.logAction(actorId, 'CREATE_EMPLOYEE', 'Employee', {
      employeeId: employee.id,
      employeeNo: employee.employeeNo,
      department: employee.department,
    });

    return {
      id: employee.id,
      employeeNo: employee.employeeNo,
      name: dto.name,
      phone: dto.phone,
      department: employee.department,
      shiftId: employee.shiftId || undefined,
      shift: employee.shift
        ? {
            id: employee.shift.id,
            name: employee.shift.name,
            startTime: employee.shift.startTime,
            endTime: employee.shift.endTime,
            graceMinutes: employee.shift.graceMinutes,
          }
        : undefined,
      createdAt: employee.createdAt.toISOString(),
      updatedAt: employee.updatedAt.toISOString(),
    };
  }

  public async getEmployees(): Promise<Employee[]> {
    const employees = await this.prisma.employee.findMany({
      include: { shift: true },
      orderBy: { createdAt: 'desc' },
    });

    return employees.map((emp) => ({
      id: emp.id,
      employeeNo: emp.employeeNo,
      name: this.encryption.decrypt(emp.nameEnc),
      phone: emp.phoneEnc ? this.encryption.decrypt(emp.phoneEnc) : undefined,
      department: emp.department,
      shiftId: emp.shiftId || undefined,
      shift: emp.shift
        ? {
            id: emp.shift.id,
            name: emp.shift.name,
            startTime: emp.shift.startTime,
            endTime: emp.shift.endTime,
            graceMinutes: emp.shift.graceMinutes,
          }
        : undefined,
      createdAt: emp.createdAt.toISOString(),
      updatedAt: emp.updatedAt.toISOString(),
    }));
  }

  public async getEmployeeById(id: string): Promise<Employee> {
    const emp = await this.prisma.employee.findUnique({
      where: { id },
      include: { shift: true },
    });
    if (!emp) {
      throw new NotFoundException(`Employee with id ${id} not found`);
    }

    return {
      id: emp.id,
      employeeNo: emp.employeeNo,
      name: this.encryption.decrypt(emp.nameEnc),
      phone: emp.phoneEnc ? this.encryption.decrypt(emp.phoneEnc) : undefined,
      department: emp.department,
      shiftId: emp.shiftId || undefined,
      shift: emp.shift
        ? {
            id: emp.shift.id,
            name: emp.shift.name,
            startTime: emp.shift.startTime,
            endTime: emp.shift.endTime,
            graceMinutes: emp.shift.graceMinutes,
          }
        : undefined,
      createdAt: emp.createdAt.toISOString(),
      updatedAt: emp.updatedAt.toISOString(),
    };
  }

  public async bindDevice(employeeId: string, dto: BindDeviceDto, actorId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
    });
    if (!employee) {
      throw new NotFoundException(`Employee with id ${employeeId} not found`);
    }

    const device = await this.prisma.device.create({
      data: {
        employeeId,
        publicKey: dto.publicKey,
        platform: dto.platform,
      },
    });

    await this.audit.logAction(actorId, 'BIND_DEVICE', 'Device', {
      deviceId: device.id,
      employeeId,
      platform: dto.platform,
    });

    return device;
  }
}
