import { Module } from '@nestjs/common';
import { SitesService } from './sites.service';
import { SitesController } from './sites.controller';
import { PrismaService } from '../common/prisma.service';

@Module({
  providers: [SitesService, PrismaService],
  controllers: [SitesController],
  exports: [SitesService],
})
export class SitesModule {}
