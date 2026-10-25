import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Shift } from '@gateflow/shared-types';

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  public async getShifts(): Promise<Shift[]> {
    const shifts = await this.prisma.shift.findMany();
    return shifts.map((s) => ({
      id: s.id,
      name: s.name,
      startTime: s.startTime,
      endTime: s.endTime,
      graceMinutes: s.graceMinutes,
    }));
  }

  public async createShift(dto: {
    name: string;
    startTime: string;
    endTime: string;
    graceMinutes?: number;
  }): Promise<Shift> {
    const shift = await this.prisma.shift.create({
      data: {
        name: dto.name,
        startTime: dto.startTime,
        endTime: dto.endTime,
        graceMinutes: dto.graceMinutes ?? 15,
      },
    });

    return {
      id: shift.id,
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      graceMinutes: shift.graceMinutes,
    };
  }
}
