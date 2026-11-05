import { Module } from '@nestjs/common';
import { AnchoringService } from './anchoring.service';
import { AnchoringWorkerService } from './anchoring-worker.service';
import { AnchoringController } from './anchoring.controller';
import { PrismaService } from '../common/prisma.service';
import { EncryptionService } from '../common/encryption.service';

@Module({
  providers: [AnchoringService, AnchoringWorkerService, PrismaService, EncryptionService],
  controllers: [AnchoringController],
  exports: [AnchoringService, AnchoringWorkerService],
})
export class AnchoringModule {}
