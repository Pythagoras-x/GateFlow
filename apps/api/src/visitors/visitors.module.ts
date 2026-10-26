import { Module } from '@nestjs/common';
import { VisitorsService } from './visitors.service';
import { VisitorsController } from './visitors.controller';
import { PassesController } from './passes.controller';
import { GateController } from './gate.controller';
import { PrismaService } from '../common/prisma.service';
import { EncryptionService } from '../common/encryption.service';
import { AuditService } from '../audit/audit.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [VisitorsController, PassesController, GateController],
  providers: [VisitorsService, PrismaService, EncryptionService, AuditService],
  exports: [VisitorsService],
})
export class VisitorsModule {}
