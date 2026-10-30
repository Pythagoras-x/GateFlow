import { Injectable, Logger } from '@nestjs/common';
import {
  SponsorshipSpendingGuard,
  StellarClient,
} from '@gateflow/stellar-client';
import {
  SponsorshipGuardConfig,
  SponsorshipEvaluationResult,
  SponsorshipStatusResponseDto,
  SponsoredTxListResponseDto,
  SponsoredTxRecord,
  UpdateSponsorshipConfigDto,
  WrapSponsoredTxRequestDto,
  WrapSponsoredTxResponseDto,
  SponsorshipGuardCode,
  SponsorshipHealthStatus,
} from '@gateflow/shared-types';
import { config } from '../common/config';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { createHash } from 'crypto';

@Injectable()
export class SponsorshipService {
  private readonly logger = new Logger(SponsorshipService.name);
  private stellarClient: StellarClient;
  private guard: SponsorshipSpendingGuard;
  private sponsorPublicKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {
    this.stellarClient = new StellarClient({
      networkPassphrase: config.stellar.networkPassphrase,
      rpcUrl: config.stellar.rpcUrl,
      coreContractId: config.stellar.coreContractId,
      attendanceContractId: config.stellar.attendanceContractId,
      visitorsContractId: config.stellar.visitorsContractId,
      sponsorSecret: config.stellar.sponsorSecret,
      useMock: config.stellar.useMock,
      sponsorshipGuardConfig: {
        maxFeeStroopsPerTx: config.stellar.sponsorship.maxFeeStroopsPerTx,
        hourlySpendCapStroops: config.stellar.sponsorship.hourlySpendCapStroops,
        dailySpendCapStroops: config.stellar.sponsorship.dailySpendCapStroops,
        minBalanceAlertXlm: config.stellar.sponsorship.minBalanceAlertXlm,
        enabled: config.stellar.sponsorship.enabled,
        allowedContracts: [
          config.stellar.coreContractId,
          config.stellar.attendanceContractId,
          config.stellar.visitorsContractId,
        ].filter(Boolean),
      },
    });

    this.guard = this.stellarClient.getSponsorshipGuard();

    // Set sponsor public key (deterministic mock or derived from config)
    if (config.stellar.sponsorSecret && config.stellar.sponsorSecret.startsWith('S') && config.stellar.sponsorSecret.length === 56) {
      try {
        const hash = createHash('sha256').update(config.stellar.sponsorSecret).digest('hex').toUpperCase();
        this.sponsorPublicKey = `GSPONSOR${hash.slice(0, 48)}`;
      } catch {
        this.sponsorPublicKey = 'GSPONSOR0000000000000000000000000000000000000000000000GATEFLOW';
      }
    } else {
      this.sponsorPublicKey = 'GSPONSOR0000000000000000000000000000000000000000000000GATEFLOW';
    }

    // Default healthy mock balance for sponsor account
    this.guard.updateBalance(75.5);
  }

  public getGuard(): SponsorshipSpendingGuard {
    return this.guard;
  }

  public getSponsorPublicKey(): string {
    return this.sponsorPublicKey;
  }

  /**
   * Retrieve current gas station sponsorship status, limits, and real-time metrics.
   */
  public async getStatus(): Promise<SponsorshipStatusResponseDto> {
    const metrics = this.guard.getMetrics(this.sponsorPublicKey);
    const balance = this.guard.getBalance(this.sponsorPublicKey);

    if (metrics.healthStatus !== SponsorshipHealthStatus.HEALTHY) {
      this.logger.warn(
        `Sponsorship Health Alert: ${metrics.healthStatus} (Balance: ${balance.balanceXlm} XLM, Spent Today: ${metrics.totalSpendXlm} XLM)`
      );
    }

    return {
      metrics,
      balance,
    };
  }

  /**
   * Retrieve paginated list of sponsored fee-bump transactions.
   */
  public async getHistory(limit: number = 50, offset: number = 0): Promise<SponsoredTxListResponseDto> {
    return this.guard.getHistory(limit, offset);
  }

  /**
   * Record a sponsored action against spending guards (called by anchoring/visitor services).
   */
  public async recordSponsoredAction(params: {
    feeStroops: number;
    operationType: string;
    txHash: string;
    innerTxHash?: string;
    targetContract?: string;
  }): Promise<SponsoredTxRecord> {
    const evalResult = this.guard.evaluateTransaction({
      feeStroops: params.feeStroops,
      targetContract: params.targetContract,
    });

    if (!evalResult.allowed) {
      this.logger.error(`Sponsorship spending guard violation: ${evalResult.reason} (${evalResult.code})`);
      throw new Error(`Sponsorship guard rejected transaction: ${evalResult.reason}`);
    }

    const record = this.guard.recordSpend({
      txHash: params.txHash,
      innerTxHash: params.innerTxHash,
      feeStroops: params.feeStroops,
      feeXlm: params.feeStroops / 10_000_000,
      operationType: params.operationType,
      targetContract: params.targetContract,
      sponsorAddress: this.sponsorPublicKey,
      status: 'CONFIRMED',
    });

    // Record cryptographically chained audit log entry
    await this.auditService.logAction('system', 'SPONSORED_FEE_BUMP', 'sponsorship', {
      txHash: record.txHash,
      innerTxHash: record.innerTxHash,
      feeStroops: record.feeStroops,
      feeXlm: record.feeXlm,
      operationType: record.operationType,
      targetContract: record.targetContract,
      sponsorAddress: record.sponsorAddress,
    });

    return record;
  }

  /**
   * Safely evaluate and sponsor an incoming inner transaction.
   */
  public async wrapTransaction(dto: WrapSponsoredTxRequestDto): Promise<WrapSponsoredTxResponseDto> {
    const feeStroops = dto.maxFeeStroops || 100_000;
    const evaluation = this.guard.evaluateTransaction({
      feeStroops,
      targetContract: dto.targetContract,
    });

    if (!evaluation.allowed) {
      return {
        success: false,
        evaluation,
      };
    }

    const txHash = createHash('sha256')
      .update(`${dto.innerTxXdr}:${Date.now()}:${Math.random()}`)
      .digest('hex');

    const innerHash = createHash('sha256')
      .update(dto.innerTxXdr)
      .digest('hex');

    this.guard.recordSpend({
      txHash,
      innerTxHash: innerHash,
      feeStroops,
      feeXlm: feeStroops / 10_000_000,
      operationType: dto.operationType || 'TRANSACTION_SPONSORSHIP',
      targetContract: dto.targetContract,
      sponsorAddress: this.sponsorPublicKey,
      status: 'CONFIRMED',
    });

    await this.auditService.logAction('system', 'FEE_BUMP_WRAPPED', 'sponsorship', {
      txHash,
      innerHash,
      feeStroops,
      operationType: dto.operationType,
      targetContract: dto.targetContract,
    });

    return {
      success: true,
      evaluation,
      txHash,
      feeBumpTxXdr: `AAAA...feeBumpWrapperFor:${innerHash.slice(0, 16)}`,
    };
  }

  /**
   * Update active spending guard limits and whitelists (Admin only).
   */
  public async updateConfig(
    dto: UpdateSponsorshipConfigDto,
    actorId: string
  ): Promise<SponsorshipGuardConfig> {
    const updated = this.guard.updateConfig(dto);

    await this.auditService.logAction(actorId, 'UPDATE_SPONSOR_CONFIG', 'sponsorship', {
      ...dto,
      updatedAt: new Date().toISOString(),
    });

    return updated;
  }
}
