import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { PrismaService } from '../common/prisma.service';
import { EncryptionService } from '../common/encryption.service';

@Module({
  providers: [AttendanceService, PrismaService, EncryptionService],
  controllers: [AttendanceController],
  exports: [AttendanceService],
})
export class AttendanceModule {}
