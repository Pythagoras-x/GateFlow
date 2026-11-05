import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AnchoringService } from './anchoring.service';

@Injectable()
export class AnchoringWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnchoringWorkerService.name);
  private timer?: NodeJS.Timeout;
  private isRunning = false;
  private intervalMs = 60 * 60 * 1000; // Hourly by default

  constructor(
    private readonly prisma: PrismaService,
    private readonly anchoringService: AnchoringService
  ) {}

  onModuleInit() {
    this.startWorker();
  }

  onModuleDestroy() {
    this.stopWorker();
  }

  public startWorker(intervalMs: number = this.intervalMs) {
    this.intervalMs = intervalMs;
    if (this.timer) clearInterval(this.timer);

    this.timer = setInterval(() => {
      this.runBatchAnchoring().catch((err) => {
        this.logger.error(`Periodic anchoring worker encountered an error: ${err.message}`, err.stack);
      });
    }, this.intervalMs);

    this.logger.log(`Anchoring worker scheduled every ${Math.round(this.intervalMs / 1000 / 60)} minutes.`);
  }

  public stopWorker() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
      this.logger.log('Anchoring worker stopped.');
    }
  }

  /**
   * Scans all sites for unanchored attendance events and submits Merkle roots on-chain.
   */
  public async runBatchAnchoring(): Promise<{ processedSites: number; anchoredCount: number }> {
    if (this.isRunning) {
      this.logger.warn('Anchoring batch run already in progress, skipping iteration.');
      return { processedSites: 0, anchoredCount: 0 };
    }

    this.isRunning = true;
    let processedSites = 0;
    let anchoredCount = 0;

    try {
      const sites = await this.prisma.site.findMany();
      for (const site of sites) {
        processedSites++;
        const unanchored = await this.prisma.attendanceEvent.count({
          where: { siteId: site.id, anchorId: null },
        });

        if (unanchored > 0) {
          this.logger.log(
            `Automated anchoring triggered for site "${site.name}" (${unanchored} unanchored events)`
          );
          try {
            await this.anchoringService.runAnchoring(site.id);
            anchoredCount++;
          } catch (err: any) {
            this.logger.error(`Failed anchoring site ${site.name}: ${err.message}`);
          }
        }
      }
    } finally {
      this.isRunning = false;
    }

    return { processedSites, anchoredCount };
  }
}
