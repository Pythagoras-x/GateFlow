import { Module } from '@nestjs/common';
import { SponsorshipService } from './sponsorship.service';
import { SponsorshipController } from './sponsorship.controller';
import { AuditModule } from '../audit/audit.module';
import { PrismaService } from '../common/prisma.service';

@Module({
  imports: [AuditModule],
  controllers: [SponsorshipController],
  providers: [SponsorshipService, PrismaService],
  exports: [SponsorshipService],
})
export class SponsorshipModule {}
