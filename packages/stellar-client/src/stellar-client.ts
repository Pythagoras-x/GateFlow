import * as StellarSdk from '@stellar/stellar-sdk';
import { OnchainContractRole } from '@gateflow/shared-types';
import {
  IStellarClient,
  OnchainAnchorData,
  OnchainAnchorResult,
  OnchainPassData,
  StellarConfig,
} from './types';
import { MockStellarClient } from './mock-stellar-client';
import { hexToBytes, normalizeBytes32Hex } from './utils';
import { SponsorshipSpendingGuard } from './sponsorship-guard';

export class StellarClient implements IStellarClient {
  private config: StellarConfig;
  private server?: StellarSdk.rpc.Server;
  private mockFallback?: MockStellarClient;
  private sponsorshipGuard: SponsorshipSpendingGuard;

  constructor(config: StellarConfig = {}) {
    this.config = config;

    const allowedContracts = [
      config.coreContractId,
      config.attendanceContractId,
      config.visitorsContractId,
    ].filter(Boolean) as string[];

    this.sponsorshipGuard = new SponsorshipSpendingGuard(
      {
        allowedContracts: allowedContracts.length > 0 ? allowedContracts : undefined,
        ...config.sponsorshipGuardConfig,
      },
      config.networkPassphrase
    );

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

  public isMock(): boolean {
    return !!this.mockFallback;
  }

  private getKeypair(secret?: string): StellarSdk.Keypair {
    const key =
      secret ||
      this.config.adminSecret ||
      this.config.sponsorSecret ||
      this.config.anchorerSecret;
    if (!key) {
      throw new Error('No private key / secret provided for on-chain Soroban transaction signing');
    }
    return StellarSdk.Keypair.fromSecret(key);
  }

  private getNetworkPassphrase(): string {
    return this.config.networkPassphrase || StellarSdk.Networks.TESTNET;
  }

  private bytes32ToScVal(hexString: string): StellarSdk.xdr.ScVal {
    const normalized = normalizeBytes32Hex(hexString);
    return StellarSdk.xdr.ScVal.scvBytes(Buffer.from(normalized, 'hex'));
  }

  private addressToScVal(addressStr: string): StellarSdk.xdr.ScVal {
    return new StellarSdk.Address(addressStr).toScVal();
  }

  private roleToScVal(role: OnchainContractRole): StellarSdk.xdr.ScVal {
    const roleMap: Record<OnchainContractRole, number> = {
      [OnchainContractRole.Admin]: 1,
      [OnchainContractRole.HR]: 2,
      [OnchainContractRole.Security]: 3,
      [OnchainContractRole.Host]: 4,
      [OnchainContractRole.Anchorer]: 5,
    };
    const roleNum = roleMap[role] || 1;
    return StellarSdk.nativeToScVal(roleNum, { type: 'u32' });
  }

  /**
   * Submits a state-changing transaction to a Soroban contract via RPC.
   */
  private async submitContractTx(
    contractId: string,
    method: string,
    args: StellarSdk.xdr.ScVal[],
    signerSecret?: string
  ): Promise<string> {
    if (this.isMock() || !this.server) {
      throw new Error('Cannot execute live Soroban transaction in mock mode');
    }

    const signer = this.getKeypair(signerSecret);
    const contract = new StellarSdk.Contract(contractId);
    const operation = contract.call(method, ...args);

    const sourceAccount = await this.server.getAccount(signer.publicKey());
    let tx = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: '100000',
      networkPassphrase: this.getNetworkPassphrase(),
    })
      .addOperation(operation)
      .setTimeout(60)
      .build();

    const sim = await this.server.simulateTransaction(tx);
    if (StellarSdk.rpc.Api.isSimulationError(sim)) {
      throw new Error(`Soroban simulation failed for ${method}: ${sim.error}`);
    }

    tx = StellarSdk.rpc.assembleTransaction(tx, sim).build();
    tx.sign(signer);

    // If sponsor secret exists and is distinct, wrap with guarded fee-bump
    if (this.config.sponsorSecret && this.config.sponsorSecret !== signer.secret()) {
      const sponsorKeypair = StellarSdk.Keypair.fromSecret(this.config.sponsorSecret);
      const feeBump = this.wrapWithGuardedFeeBump(tx, sponsorKeypair, {
        targetContract: contractId,
        operationType: method,
      });
      const sendRes = await this.server.sendTransaction(feeBump);
      return this.waitForConfirmation(sendRes.hash);
    }

    const sendRes = await this.server.sendTransaction(tx);
    if (sendRes.status === 'ERROR') {
      throw new Error(`Failed to submit transaction: ${JSON.stringify(sendRes.errorResult)}`);
    }

    return this.waitForConfirmation(sendRes.hash);
  }

  /**
   * Executes a read-only contract simulation to query contract state without submitting to ledger.
   */
  private async queryContractReadOnly(
    contractId: string,
    method: string,
    args: StellarSdk.xdr.ScVal[]
  ): Promise<any> {
    if (this.isMock() || !this.server) {
      throw new Error('Cannot execute live Soroban query in mock mode');
    }

    const contract = new StellarSdk.Contract(contractId);
    const operation = contract.call(method, ...args);
    const dummyAccount = new StellarSdk.Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0');

    const tx = new StellarSdk.TransactionBuilder(dummyAccount, {
      fee: '100',
      networkPassphrase: this.getNetworkPassphrase(),
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    const sim = await this.server.simulateTransaction(tx);
    if (StellarSdk.rpc.Api.isSimulationSuccess(sim) && sim.result) {
      return StellarSdk.scValToNative(sim.result.retval);
    }
    return null;
  }

  private async waitForConfirmation(txHash: string, maxAttempts = 12): Promise<string> {
    if (!this.server) return txHash;

    for (let i = 0; i < maxAttempts; i++) {
      const res = await this.server.getTransaction(txHash);
      if (res.status === 'SUCCESS') {
        return txHash;
      }
      if (res.status === 'FAILED') {
        throw new Error(`Transaction failed on Stellar ledger: ${txHash}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return txHash;
  }

  public async initializeCore(adminSecret: string): Promise<string> {
    if (this.isMock()) return this.mockFallback!.initializeCore(adminSecret);
    const adminKey = this.getKeypair(adminSecret);
    const adminAddressVal = this.addressToScVal(adminKey.publicKey());
    return this.submitContractTx(
      this.config.coreContractId!,
      'initialize',
      [adminAddressVal],
      adminSecret
    );
  }

  public async registerSite(siteIdHex: string, adminSecret?: string): Promise<string> {
    if (this.isMock()) return this.mockFallback!.registerSite(siteIdHex, adminSecret);
    const caller = this.getKeypair(adminSecret);
    const callerVal = this.addressToScVal(caller.publicKey());
    const siteVal = this.bytes32ToScVal(siteIdHex);

    return this.submitContractTx(
      this.config.coreContractId!,
      'register_site',
      [callerVal, siteVal],
      adminSecret
    );
  }

  public async isSiteRegistered(siteIdHex: string): Promise<boolean> {
    if (this.isMock()) return this.mockFallback!.isSiteRegistered(siteIdHex);
    try {
      const siteVal = this.bytes32ToScVal(siteIdHex);
      const res = await this.queryContractReadOnly(
        this.config.coreContractId!,
        'is_site_registered',
        [siteVal]
      );
      return Boolean(res);
    } catch {
      return false;
    }
  }

  public async addRole(
    targetAddress: string,
    role: OnchainContractRole,
    adminSecret?: string
  ): Promise<string> {
    if (this.isMock()) return this.mockFallback!.addRole(targetAddress, role, adminSecret);
    const caller = this.getKeypair(adminSecret);
    const callerVal = this.addressToScVal(caller.publicKey());
    const targetVal = this.addressToScVal(targetAddress);
    const roleVal = this.roleToScVal(role);

    return this.submitContractTx(
      this.config.coreContractId!,
      'add_role',
      [callerVal, targetVal, roleVal],
      adminSecret
    );
  }

  public async hasRole(targetAddress: string, role: OnchainContractRole): Promise<boolean> {
    if (this.isMock()) return this.mockFallback!.hasRole(targetAddress, role);
    try {
      const targetVal = this.addressToScVal(targetAddress);
      const roleVal = this.roleToScVal(role);
      const res = await this.queryContractReadOnly(
        this.config.coreContractId!,
        'has_role',
        [targetVal, roleVal]
      );
      return Boolean(res);
    } catch {
      return false;
    }
  }

  public async initializeAttendance(adminSecret: string, coreContractId: string): Promise<string> {
    if (this.isMock()) return this.mockFallback!.initializeAttendance(adminSecret, coreContractId);
    const admin = this.getKeypair(adminSecret);
    const adminVal = this.addressToScVal(admin.publicKey());
    const coreVal = this.addressToScVal(coreContractId);

    return this.submitContractTx(
      this.config.attendanceContractId!,
      'initialize',
      [adminVal, coreVal],
      adminSecret
    );
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

    const anchorer = this.getKeypair(anchorerSecret || this.config.anchorerSecret);
    const anchorerVal = this.addressToScVal(anchorer.publicKey());
    const siteVal = this.bytes32ToScVal(siteIdHex);
    const periodVal = StellarSdk.nativeToScVal(BigInt(period), { type: 'u64' });
    const rootVal = this.bytes32ToScVal(merkleRootHex);

    const txHash = await this.submitContractTx(
      this.config.attendanceContractId!,
      'anchor_attendance',
      [anchorerVal, siteVal, periodVal, rootVal],
      anchorerSecret || this.config.anchorerSecret
    );

    return {
      txHash,
      siteId: normalizeBytes32Hex(siteIdHex),
      period,
      merkleRoot: merkleRootHex,
      ledgerTime: Math.floor(Date.now() / 1000),
    };
  }

  public async getAnchor(siteIdHex: string, period: number): Promise<OnchainAnchorData | null> {
    if (this.isMock()) return this.mockFallback!.getAnchor(siteIdHex, period);
    try {
      const siteVal = this.bytes32ToScVal(siteIdHex);
      const periodVal = StellarSdk.nativeToScVal(BigInt(period), { type: 'u64' });
      const record = await this.queryContractReadOnly(
        this.config.attendanceContractId!,
        'get_anchor',
        [siteVal, periodVal]
      );
      if (!record) return null;

      return {
        merkleRoot: Buffer.isBuffer(record.merkle_root)
          ? record.merkle_root.toString('hex')
          : String(record.merkle_root),
        submittedBy: String(record.submitted_by),
        ledgerTime: Number(record.ledger_time || 0),
      };
    } catch {
      return null;
    }
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

    const hr = this.getKeypair(hrSecret);
    const hrVal = this.addressToScVal(hr.publicKey());
    const siteVal = this.bytes32ToScVal(siteIdHex);
    const correctionVal = this.bytes32ToScVal(correctionHashHex);
    const approverVal = this.addressToScVal(approverAddress);

    return this.submitContractTx(
      this.config.attendanceContractId!,
      'record_correction',
      [hrVal, siteVal, correctionVal, approverVal],
      hrSecret
    );
  }

  public async initializeVisitors(adminSecret: string, coreContractId: string): Promise<string> {
    if (this.isMock()) return this.mockFallback!.initializeVisitors(adminSecret, coreContractId);
    const admin = this.getKeypair(adminSecret);
    const adminVal = this.addressToScVal(admin.publicKey());
    const coreVal = this.addressToScVal(coreContractId);

    return this.submitContractTx(
      this.config.visitorsContractId!,
      'initialize',
      [adminVal, coreVal],
      adminSecret
    );
  }

  public async issuePass(
    passIdHex: string,
    passHashHex: string,
    siteIdHex: string,
    validFrom: number,
    validUntil: number,
    hostSecret?: string
  ): Promise<string> {
    if (this.isMock()) {
      return this.mockFallback!.issuePass(
        passIdHex,
        passHashHex,
        siteIdHex,
        validFrom,
        validUntil,
        hostSecret
      );
    }

    const host = this.getKeypair(hostSecret);
    const hostVal = this.addressToScVal(host.publicKey());
    const passIdVal = this.bytes32ToScVal(passIdHex);
    const passHashVal = this.bytes32ToScVal(passHashHex);
    const siteVal = this.bytes32ToScVal(siteIdHex);
    const validFromVal = StellarSdk.nativeToScVal(BigInt(validFrom), { type: 'u64' });
    const validUntilVal = StellarSdk.nativeToScVal(BigInt(validUntil), { type: 'u64' });

    return this.submitContractTx(
      this.config.visitorsContractId!,
      'issue_pass',
      [hostVal, passIdVal, passHashVal, siteVal, validFromVal, validUntilVal],
      hostSecret
    );
  }

  public async recordEntry(passIdHex: string, guardSecret?: string): Promise<string> {
    if (this.isMock()) return this.mockFallback!.recordEntry(passIdHex, guardSecret);
    const guard = this.getKeypair(guardSecret);
    const guardVal = this.addressToScVal(guard.publicKey());
    const passIdVal = this.bytes32ToScVal(passIdHex);

    return this.submitContractTx(
      this.config.visitorsContractId!,
      'record_entry',
      [guardVal, passIdVal],
      guardSecret
    );
  }

  public async recordExit(passIdHex: string, guardSecret?: string): Promise<string> {
    if (this.isMock()) return this.mockFallback!.recordExit(passIdHex, guardSecret);
    const guard = this.getKeypair(guardSecret);
    const guardVal = this.addressToScVal(guard.publicKey());
    const passIdVal = this.bytes32ToScVal(passIdHex);

    return this.submitContractTx(
      this.config.visitorsContractId!,
      'record_exit',
      [guardVal, passIdVal],
      guardSecret
    );
  }

  public async revokePass(passIdHex: string, callerSecret?: string): Promise<string> {
    if (this.isMock()) return this.mockFallback!.revokePass(passIdHex, callerSecret);
    const caller = this.getKeypair(callerSecret);
    const callerVal = this.addressToScVal(caller.publicKey());
    const passIdVal = this.bytes32ToScVal(passIdHex);

    return this.submitContractTx(
      this.config.visitorsContractId!,
      'revoke_pass',
      [callerVal, passIdVal],
      callerSecret
    );
  }

  public async verifyPass(passIdHex: string): Promise<OnchainPassData | null> {
    if (this.isMock()) return this.mockFallback!.verifyPass(passIdHex);
    try {
      const passIdVal = this.bytes32ToScVal(passIdHex);
      const record = await this.queryContractReadOnly(
        this.config.visitorsContractId!,
        'get_pass',
        [passIdVal]
      );
      if (!record) return null;

      const statusMap: Record<number, 'Active' | 'Entered' | 'Exited' | 'Revoked'> = {
        1: 'Active',
        2: 'Entered',
        3: 'Exited',
        4: 'Revoked',
      };

      return {
        passId: normalizeBytes32Hex(passIdHex),
        passHash: Buffer.isBuffer(record.pass_hash)
          ? record.pass_hash.toString('hex')
          : String(record.pass_hash),
        host: String(record.host),
        siteId: Buffer.isBuffer(record.site_id)
          ? record.site_id.toString('hex')
          : String(record.site_id),
        validFrom: Number(record.valid_from || 0),
        validUntil: Number(record.valid_until || 0),
        status: statusMap[Number(record.status)] || 'Active',
        entryTime: Number(record.entry_time || 0),
        exitTime: Number(record.exit_time || 0),
      };
    } catch {
      return null;
    }
  }

  public getSponsorshipGuard(): SponsorshipSpendingGuard {
    if (this.mockFallback) return this.mockFallback.getSponsorshipGuard();
    return this.sponsorshipGuard;
  }

  /**
   * Wraps an inner transaction with fee-bump after evaluating spending guards.
   */
  public wrapWithGuardedFeeBump(
    innerTx: StellarSdk.Transaction,
    sponsorKeypair: StellarSdk.Keypair,
    options?: {
      maxFeeStroops?: number;
      targetContract?: string;
      operationType?: string;
    }
  ) {
    return this.getSponsorshipGuard().wrapWithGuardedFeeBump(innerTx, sponsorKeypair, options);
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
      this.getNetworkPassphrase()
    );
    feeBump.sign(sponsorKeypair);
    return feeBump;
  }
}
