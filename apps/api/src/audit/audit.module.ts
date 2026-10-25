import { Module, Global } from '@nestjs/common';
import { AuditService } from './audit.service';
import { PrismaService } from '../common/prisma.service';

@Global()
@Module({
  providers: [AuditService, PrismaService],
  exports: [AuditService],
})
export class AuditModule {}
