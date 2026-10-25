import { Module } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';
import { PrismaService } from '../common/prisma.service';
import { EncryptionService } from '../common/encryption.service';

@Module({
  providers: [EmployeesService, PrismaService, EncryptionService],
  controllers: [EmployeesController],
  exports: [EmployeesService],
})
export class EmployeesModule {}
