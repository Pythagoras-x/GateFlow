import * as StellarSdk from '@stellar/stellar-sdk';
import {
  SponsorshipGuardConfig,
  SponsorshipEvaluationResult,
  SponsorshipGuardCode,
  SponsorshipHealthStatus,
  SponsorshipDailyMetrics,
  SponsoredTxRecord,
  SponsorAccountBalance,
} from '@gateflow/shared-types';

export const DEFAULT_GUARD_CONFIG: SponsorshipGuardConfig = {
  maxFeeStroopsPerTx: 500_000, // 0.05 XLM max fee per single transaction
  hourlySpendCapStroops: 5_000_000, // 0.5 XLM per hour rolling limit
  dailySpendCapStroops: 25_000_000, // 2.5 XLM per day rolling limit
  minBalanceAlertXlm: 10.0, // Alert threshold when sponsor has < 10 XLM
  allowedContracts: [], // Whitelist; if empty, all contracts allowed
  enabled: true,
};

const STROOPS_PER_XLM = 10_000_000;

export class SponsorshipSpendingGuard {
  private config: SponsorshipGuardConfig;
  private records: SponsoredTxRecord[] = [];
  private sponsorBalanceXlm: number = 100.0; // default initial/mock balance
  private networkPassphrase: string;

  constructor(
    config: Partial<SponsorshipGuardConfig> = {},
    networkPassphrase: string = StellarSdk.Networks.TESTNET
  ) {
    this.config = { ...DEFAULT_GUARD_CONFIG, ...config };
    this.networkPassphrase = networkPassphrase;
  }

  public getConfig(): SponsorshipGuardConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<SponsorshipGuardConfig>): SponsorshipGuardConfig {
    this.config = { ...this.config, ...newConfig };
    return this.getConfig();
  }

  public updateBalance(balanceXlm: number): void {
    this.sponsorBalanceXlm = Math.max(0, balanceXlm);
  }

  public getBalance(sponsorPublicKey: string): SponsorAccountBalance {
    return {
      publicKey: sponsorPublicKey,
      balanceXlm: this.sponsorBalanceXlm,
      minBalanceThresholdXlm: this.config.minBalanceAlertXlm,
      isLowBalance: this.sponsorBalanceXlm < this.config.minBalanceAlertXlm,
    };
  }

  /**
   * Evaluate whether a prospective transaction is allowed under active spending guards.
   */
  public evaluateTransaction(options: {
    feeStroops: number;
    targetContract?: string;
  }): SponsorshipEvaluationResult {
    const feeStroops = options.feeStroops;

    if (!this.config.enabled) {
      return {
        allowed: true,
        code: SponsorshipGuardCode.ALLOWED,
        feeStroops,
        projectedDailySpendStroops: feeStroops,
        projectedHourlySpendStroops: feeStroops,
      };
    }

    // 1. Max fee per single transaction guard
    if (feeStroops > this.config.maxFeeStroopsPerTx) {
      return {
        allowed: false,
        code: SponsorshipGuardCode.FEE_EXCEEDS_MAX_TX,
        reason: `Transaction fee of ${feeStroops} stroops exceeds per-tx ceiling of ${this.config.maxFeeStroopsPerTx} stroops`,
        feeStroops,
        projectedDailySpendStroops: this.getRollingSpend(24 * 3600 * 1000) + feeStroops,
        projectedHourlySpendStroops: this.getRollingSpend(3600 * 1000) + feeStroops,
      };
    }

    // 2. Allowed contract target guard
    if (
      this.config.allowedContracts &&
      this.config.allowedContracts.length > 0 &&
      options.targetContract
    ) {
      const isAllowed = this.config.allowedContracts.some(
        (allowed) => allowed.toLowerCase() === options.targetContract!.toLowerCase()
      );
      if (!isAllowed) {
        return {
          allowed: false,
          code: SponsorshipGuardCode.CONTRACT_NOT_ALLOWED,
          reason: `Target contract ${options.targetContract} is not in the sponsor allowance whitelist`,
          feeStroops,
          projectedDailySpendStroops: this.getRollingSpend(24 * 3600 * 1000) + feeStroops,
          projectedHourlySpendStroops: this.getRollingSpend(3600 * 1000) + feeStroops,
        };
      }
    }

    const currentHourlySpend = this.getRollingSpend(3600 * 1000);
    const projectedHourly = currentHourlySpend + feeStroops;

    // 3. Hourly budget cap guard
    if (projectedHourly > this.config.hourlySpendCapStroops) {
      return {
        allowed: false,
        code: SponsorshipGuardCode.HOURLY_CAP_EXCEEDED,
        reason: `Projected hourly fee spend (${projectedHourly} stroops) exceeds hourly budget cap (${this.config.hourlySpendCapStroops} stroops)`,
        feeStroops,
        projectedDailySpendStroops: this.getRollingSpend(24 * 3600 * 1000) + feeStroops,
        projectedHourlySpendStroops: projectedHourly,
      };
    }

    const currentDailySpend = this.getRollingSpend(24 * 3600 * 1000);
    const projectedDaily = currentDailySpend + feeStroops;

    // 4. Daily budget cap guard
    if (projectedDaily > this.config.dailySpendCapStroops) {
      return {
        allowed: false,
        code: SponsorshipGuardCode.DAILY_CAP_EXCEEDED,
        reason: `Projected daily fee spend (${projectedDaily} stroops) exceeds daily budget cap (${this.config.dailySpendCapStroops} stroops)`,
        feeStroops,
        projectedDailySpendStroops: projectedDaily,
        projectedHourlySpendStroops: projectedHourly,
      };
    }

    // 5. Sponsor account balance sufficiency
    const feeXlm = feeStroops / STROOPS_PER_XLM;
    if (this.sponsorBalanceXlm < feeXlm) {
      return {
        allowed: false,
        code: SponsorshipGuardCode.INSUFFICIENT_SPONSOR_BALANCE,
        reason: `Sponsor account balance (${this.sponsorBalanceXlm} XLM) insufficient for fee (${feeXlm} XLM)`,
        feeStroops,
        projectedDailySpendStroops: projectedDaily,
        projectedHourlySpendStroops: projectedHourly,
      };
    }

    return {
      allowed: true,
      code: SponsorshipGuardCode.ALLOWED,
      feeStroops,
      projectedDailySpendStroops: projectedDaily,
      projectedHourlySpendStroops: projectedHourly,
    };
  }

  /**
   * Wrap an inner transaction with fee-bump after evaluating spending guards.
   */
  public wrapWithGuardedFeeBump(
    innerTx: StellarSdk.Transaction,
    sponsorKeypair: StellarSdk.Keypair,
    options: {
      maxFeeStroops?: number;
      targetContract?: string;
      operationType?: string;
    } = {}
  ): {
    feeBumpTx: StellarSdk.FeeBumpTransaction;
    record: SponsoredTxRecord;
  } {
    const feeStroops = options.maxFeeStroops ?? 100_000;
    const evaluation = this.evaluateTransaction({
      feeStroops,
      targetContract: options.targetContract,
    });

    if (!evaluation.allowed) {
      throw new Error(`Fee sponsorship guard rejected transaction: ${evaluation.reason} (${evaluation.code})`);
    }

    const feeBumpTx = StellarSdk.TransactionBuilder.buildFeeBumpTransaction(
      sponsorKeypair,
      feeStroops.toString(),
      innerTx,
      this.networkPassphrase
    );
    feeBumpTx.sign(sponsorKeypair);

    // Calculate hashes
    const innerHash = Buffer.from(innerTx.hash()).toString('hex');
    const feeBumpHash = Buffer.from(feeBumpTx.hash()).toString('hex');

    // Record the spend
    const record = this.recordSpend({
      txHash: feeBumpHash,
      innerTxHash: innerHash,
      feeStroops,
      feeXlm: feeStroops / STROOPS_PER_XLM,
      operationType: options.operationType || 'SOROBAN_INVOCATION',
      targetContract: options.targetContract,
      sponsorAddress: sponsorKeypair.publicKey(),
      status: 'CONFIRMED',
    });

    return { feeBumpTx, record };
  }

  /**
   * Record a sponsored transaction spend.
   */
  public recordSpend(
    params: Omit<SponsoredTxRecord, 'id' | 'timestamp'> & { timestamp?: string }
  ): SponsoredTxRecord {
    const record: SponsoredTxRecord = {
      ...params,
      id: `sp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: params.timestamp || new Date().toISOString(),
    };

    this.records.unshift(record);

    // Keep up to 10,000 historical records in memory
    if (this.records.length > 10000) {
      this.records = this.records.slice(0, 10000);
    }

    // Deduct from in-memory balance tracker
    this.sponsorBalanceXlm = Math.max(0, this.sponsorBalanceXlm - record.feeXlm);

    return record;
  }

  /**
   * Get rolling spend for the given window in milliseconds.
   */
  public getRollingSpend(windowMs: number): number {
    const cutoff = Date.now() - windowMs;
    return this.records
      .filter((r) => r.status === 'CONFIRMED' && new Date(r.timestamp).getTime() >= cutoff)
      .reduce((acc, r) => acc + r.feeStroops, 0);
  }

  /**
   * Return comprehensive metrics and health status.
   */
  public getMetrics(sponsorPublicKey: string): SponsorshipDailyMetrics {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    const todayRecords = this.records.filter(
      (r) => r.status === 'CONFIRMED' && new Date(r.timestamp).getTime() >= startOfDay
    );

    const totalSpendStroops = todayRecords.reduce((acc, r) => acc + r.feeStroops, 0);
    const hourlySpendStroops = this.getRollingSpend(3600 * 1000);

    const dailyBudgetRemainingStroops = Math.max(
      0,
      this.config.dailySpendCapStroops - totalSpendStroops
    );
    const hourlyBudgetRemainingStroops = Math.max(
      0,
      this.config.hourlySpendCapStroops - hourlySpendStroops
    );

    let healthStatus: SponsorshipHealthStatus = SponsorshipHealthStatus.HEALTHY;
    if (
      totalSpendStroops >= this.config.dailySpendCapStroops ||
      hourlySpendStroops >= this.config.hourlySpendCapStroops ||
      this.sponsorBalanceXlm <= 0
    ) {
      healthStatus = SponsorshipHealthStatus.CRITICAL_BUDGET_EXHAUSTED;
    } else if (this.sponsorBalanceXlm < this.config.minBalanceAlertXlm) {
      healthStatus = SponsorshipHealthStatus.WARNING_LOW_BALANCE;
    }

    return {
      date: now.toISOString().split('T')[0],
      totalSpendStroops,
      totalSpendXlm: totalSpendStroops / STROOPS_PER_XLM,
      txCount: todayRecords.length,
      hourlySpendStroops,
      hourlySpendXlm: hourlySpendStroops / STROOPS_PER_XLM,
      dailyBudgetRemainingStroops,
      dailyBudgetRemainingXlm: dailyBudgetRemainingStroops / STROOPS_PER_XLM,
      hourlyBudgetRemainingStroops,
      hourlyBudgetRemainingXlm: hourlyBudgetRemainingStroops / STROOPS_PER_XLM,
      sponsorBalanceXlm: this.sponsorBalanceXlm,
      sponsorPublicKey,
      healthStatus,
      guardConfig: this.getConfig(),
    };
  }

  public getHistory(limit: number = 50, offset: number = 0): { records: SponsoredTxRecord[]; total: number } {
    const total = this.records.length;
    const records = this.records.slice(offset, offset + limit);
    return { records, total };
  }
}
