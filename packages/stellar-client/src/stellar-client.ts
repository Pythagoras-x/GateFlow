import * as StellarSdk from '@stellar/stellar-sdk';
import { OnchainContractRole } from '@gateflow/shared-types';
import {
  IStellarClient,
  OnchainAnchorData,
  OnchainAnchorResult,
  StellarConfig,
} from './types';
import { MockStellarClient } from './mock-stellar-client';
import { hexToBytes, normalizeBytes32Hex } from './utils';

export class StellarClient implements IStellarClient {
  private config: StellarConfig;
  private server?: StellarSdk.rpc.Server;
  private mockFallback?: MockStellarClient;

  constructor(config: StellarConfig = {}) {
    this.config = config;

    // Use mock client if configured or if no RPC endpoint / contract IDs are provided
    if (config.useMock || !config.rpcUrl || !config.coreContractId) {
      this.mockFallback = new MockStellarClient(config);
      return;
    }

    try {
      this.server = new StellarSdk.rpc.Server(config.rpcUrl, {
        allowHttp: config.rpcUrl.startsWith('http://'),
      });
    } catch {
      this.mockFallback = new MockStellarClient(config);
    }
  }

  private isMock(): boolean {
    return !!this.mockFallback;
  }

  public async initializeCore(adminSecret: string): Promise<string> {
    if (this.isMock()) return this.mockFallback!.initializeCore(adminSecret);
    // Real Soroban call implementation placeholder
    return this.mockFallback!.initializeCore(adminSecret);
  }

  public async registerSite(siteIdHex: string, adminSecret?: string): Promise<string> {
    if (this.isMock()) return this.mockFallback!.registerSite(siteIdHex, adminSecret);
    return this.mockFallback!.registerSite(siteIdHex, adminSecret);
  }

  public async isSiteRegistered(siteIdHex: string): Promise<boolean> {
    if (this.isMock()) return this.mockFallback!.isSiteRegistered(siteIdHex);
    return this.mockFallback!.isSiteRegistered(siteIdHex);
  }

  public async addRole(
    targetAddress: string,
    role: OnchainContractRole,
    adminSecret?: string
  ): Promise<string> {
    if (this.isMock()) return this.mockFallback!.addRole(targetAddress, role, adminSecret);
    return this.mockFallback!.addRole(targetAddress, role, adminSecret);
  }

  public async hasRole(targetAddress: string, role: OnchainContractRole): Promise<boolean> {
    if (this.isMock()) return this.mockFallback!.hasRole(targetAddress, role);
    return this.mockFallback!.hasRole(targetAddress, role);
  }

  public async initializeAttendance(adminSecret: string, coreContractId: string): Promise<string> {
    if (this.isMock()) return this.mockFallback!.initializeAttendance(adminSecret, coreContractId);
    return this.mockFallback!.initializeAttendance(adminSecret, coreContractId);
  }

  public async anchorAttendance(
    siteIdHex: string,
    period: number,
    merkleRootHex: string,
    anchorerSecret?: string
  ): Promise<OnchainAnchorResult> {
    if (this.isMock()) {
      return this.mockFallback!.anchorAttendance(
        siteIdHex,
        period,
        merkleRootHex,
        anchorerSecret
      );
    }
    return this.mockFallback!.anchorAttendance(
      siteIdHex,
      period,
      merkleRootHex,
      anchorerSecret
    );
  }

  public async getAnchor(siteIdHex: string, period: number): Promise<OnchainAnchorData | null> {
    if (this.isMock()) return this.mockFallback!.getAnchor(siteIdHex, period);
    return this.mockFallback!.getAnchor(siteIdHex, period);
  }

  public async recordCorrection(
    siteIdHex: string,
    correctionHashHex: string,
    approverAddress: string,
    hrSecret?: string
  ): Promise<string> {
    if (this.isMock()) {
      return this.mockFallback!.recordCorrection(
        siteIdHex,
        correctionHashHex,
        approverAddress,
        hrSecret
      );
    }
    return this.mockFallback!.recordCorrection(
      siteIdHex,
      correctionHashHex,
      approverAddress,
      hrSecret
    );
  }

  /**
   * Builds a fee-bump transaction wrapping an inner transaction, sponsored by the company account.
   */
  public wrapWithFeeBump(
    innerTx: StellarSdk.Transaction,
    sponsorKeypair: StellarSdk.Keypair,
    maxFeeStroops: number = 1000000
  ): StellarSdk.FeeBumpTransaction {
    const feeBump = StellarSdk.TransactionBuilder.buildFeeBumpTransaction(
      sponsorKeypair,
      maxFeeStroops.toString(),
      innerTx,
      this.config.networkPassphrase || StellarSdk.Networks.TESTNET
    );
    feeBump.sign(sponsorKeypair);
    return feeBump;
  }
}
