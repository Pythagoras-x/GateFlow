import { Module } from '@nestjs/common';
import { AnchoringService } from './anchoring.service';
import { AnchoringController } from './anchoring.controller';
import { PrismaService } from '../common/prisma.service';
import { EncryptionService } from '../common/encryption.service';

@Module({
  providers: [AnchoringService, PrismaService, EncryptionService],
  controllers: [AnchoringController],
  exports: [AnchoringService],
})
export class AnchoringModule {}
