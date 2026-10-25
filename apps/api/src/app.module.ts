import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { SitesModule } from './sites/sites.module';
import { PrismaService } from './common/prisma.service';
import { EncryptionService } from './common/encryption.service';

@Module({
  imports: [AuthModule, AuditModule, SitesModule],
  providers: [PrismaService, EncryptionService],
})
export class AppModule {}
