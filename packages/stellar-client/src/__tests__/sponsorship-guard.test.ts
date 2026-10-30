import { describe, it, expect, beforeEach } from 'vitest';
import * as StellarSdk from '@stellar/stellar-sdk';
import {
  SponsorshipSpendingGuard,
  DEFAULT_GUARD_CONFIG,
} from '../sponsorship-guard';
import {
  SponsorshipGuardCode,
  SponsorshipHealthStatus,
} from '@gateflow/shared-types';

describe('SponsorshipSpendingGuard', () => {
  let guard: SponsorshipSpendingGuard;
  const sponsorKeypair = StellarSdk.Keypair.random();
  const callerKeypair = StellarSdk.Keypair.random();
  const contractId = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

  beforeEach(() => {
    guard = new SponsorshipSpendingGuard({
      maxFeeStroopsPerTx: 200_000, // 0.02 XLM
      hourlySpendCapStroops: 1_000_000, // 0.1 XLM
      dailySpendCapStroops: 3_000_000, // 0.3 XLM
      minBalanceAlertXlm: 5.0,
      allowedContracts: [contractId],
      enabled: true,
    });
    guard.updateBalance(50.0);
  });

  function createDummyInnerTx(): StellarSdk.Transaction {
    const account = new StellarSdk.Account(callerKeypair.publicKey(), '100');
    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: StellarSdk.Networks.TESTNET,
    })
      .addOperation(
        StellarSdk.Operation.payment({
          destination: callerKeypair.publicKey(),
          asset: StellarSdk.Asset.native(),
          amount: '0.00001',
        })
      )
      .setTimeout(30)
      .build();
    tx.sign(callerKeypair);
    return tx;
  }

  it('allows transaction when within fee, budget, and contract limits', () => {
    const evalResult = guard.evaluateTransaction({
      feeStroops: 100_000,
      targetContract: contractId,
    });

    expect(evalResult.allowed).toBe(true);
    expect(evalResult.code).toBe(SponsorshipGuardCode.ALLOWED);
    expect(evalResult.feeStroops).toBe(100_000);
  });

  it('rejects transaction when fee exceeds max fee per transaction', () => {
    const evalResult = guard.evaluateTransaction({
      feeStroops: 250_000, // Exceeds 200_000 limit
      targetContract: contractId,
    });

    expect(evalResult.allowed).toBe(false);
    expect(evalResult.code).toBe(SponsorshipGuardCode.FEE_EXCEEDS_MAX_TX);
    expect(evalResult.reason).toContain('exceeds per-tx ceiling');
  });

  it('rejects transaction when contract is not in allowed contracts whitelist', () => {
    const evalResult = guard.evaluateTransaction({
      feeStroops: 50_000,
      targetContract: 'CUNAUTHORIZEDCONTRACT0000000000000000000000000000000000',
    });

    expect(evalResult.allowed).toBe(false);
    expect(evalResult.code).toBe(SponsorshipGuardCode.CONTRACT_NOT_ALLOWED);
    expect(evalResult.reason).toContain('whitelist');
  });

  it('rejects transaction when hourly spend cap is exceeded', () => {
    // Record spends to reach near hourly limit (1,000,000 stroops)
    guard.recordSpend({
      txHash: 'hash1',
      feeStroops: 900_000,
      feeXlm: 0.09,
      operationType: 'TEST',
      sponsorAddress: sponsorKeypair.publicKey(),
      status: 'CONFIRMED',
    });

    // Next tx of 150_000 would push to 1,050_000 > 1,000_000
    const evalResult = guard.evaluateTransaction({
      feeStroops: 150_000,
      targetContract: contractId,
    });

    expect(evalResult.allowed).toBe(false);
    expect(evalResult.code).toBe(SponsorshipGuardCode.HOURLY_CAP_EXCEEDED);
    expect(evalResult.reason).toContain('hourly budget cap');
  });

  it('rejects transaction when daily spend cap is exceeded', () => {
    // Record spend 2 hours ago (within daily window, outside 1-hour window)
    guard.recordSpend({
      txHash: 'hash1',
      feeStroops: 2_900_000,
      feeXlm: 0.29,
      operationType: 'TEST',
      sponsorAddress: sponsorKeypair.publicKey(),
      status: 'CONFIRMED',
      timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    });

    const evalResult = guard.evaluateTransaction({
      feeStroops: 150_000,
      targetContract: contractId,
    });

    expect(evalResult.allowed).toBe(false);
    expect(evalResult.code).toBe(SponsorshipGuardCode.DAILY_CAP_EXCEEDED);
    expect(evalResult.reason).toContain('daily budget cap');
  });

  it('evaluates health status and triggers low-balance alert', () => {
    // Healthy state
    let metrics = guard.getMetrics(sponsorKeypair.publicKey());
    expect(metrics.healthStatus).toBe(SponsorshipHealthStatus.HEALTHY);

    // Warning low balance
    guard.updateBalance(3.0); // Below 5.0 threshold
    metrics = guard.getMetrics(sponsorKeypair.publicKey());
    expect(metrics.healthStatus).toBe(SponsorshipHealthStatus.WARNING_LOW_BALANCE);

    // Critical exhausted state
    guard.updateBalance(0);
    metrics = guard.getMetrics(sponsorKeypair.publicKey());
    expect(metrics.healthStatus).toBe(SponsorshipHealthStatus.CRITICAL_BUDGET_EXHAUSTED);
  });

  it('successfully wraps inner transaction with guarded fee-bump and records spend', () => {
    const innerTx = createDummyInnerTx();
    const { feeBumpTx, record } = guard.wrapWithGuardedFeeBump(innerTx, sponsorKeypair, {
      maxFeeStroops: 120_000,
      targetContract: contractId,
      operationType: 'ANCHOR_ATTENDANCE',
    });

    expect(feeBumpTx).toBeDefined();
    expect(feeBumpTx.feeSource).toBe(sponsorKeypair.publicKey());
    expect(record.feeStroops).toBe(120_000);
    expect(record.operationType).toBe('ANCHOR_ATTENDANCE');

    const history = guard.getHistory();
    expect(history.total).toBe(1);
    expect(history.records[0].txHash).toBe(Buffer.from(feeBumpTx.hash()).toString('hex'));
  });

  it('allows all transactions when guard is disabled in config', () => {
    guard.updateConfig({ enabled: false });

    const evalResult = guard.evaluateTransaction({
      feeStroops: 5_000_000, // Massive fee
      targetContract: 'CRANDOMCONTRACT',
    });

    expect(evalResult.allowed).toBe(true);
    expect(evalResult.code).toBe(SponsorshipGuardCode.ALLOWED);
  });
});
