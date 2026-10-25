import { createHash, randomBytes } from 'crypto';
import { OnchainContractRole } from '@gateflow/shared-types';
import {
  IStellarClient,
  OnchainAnchorData,
  OnchainAnchorResult,
  StellarConfig,
} from './types';
import { normalizeBytes32Hex } from './utils';

export class MockStellarClient implements IStellarClient {
  private adminAddress: string = 'GADMIN0000000000000000000000000000000000000000000000GATEFLOW';
  private coreContractId: string = 'CCOR0000000000000000000000000000000000000000000000GATEFLOW';
  private attendanceContractId: string = 'CATT0000000000000000000000000000000000000000000000GATEFLOW';

  private registeredSites = new Set<string>();
  private roles = new Map<string, Set<OnchainContractRole>>();
  private anchors = new Map<string, OnchainAnchorData>(); // key: `${siteIdHex}:${period}`
  private corrections = new Map<string, boolean>();

  constructor(config: StellarConfig = {}) {
    if (config.coreContractId) this.coreContractId = config.coreContractId;
    if (config.attendanceContractId) this.attendanceContractId = config.attendanceContractId;

    // Grant Admin & Anchorer role to default mock accounts
    this.addRoleInternal(this.adminAddress, OnchainContractRole.Admin);
    this.addRoleInternal(this.adminAddress, OnchainContractRole.Anchorer);
  }

  private generateTxHash(): string {
    return createHash('sha256').update(randomBytes(32)).digest('hex');
  }

  private addRoleInternal(address: string, role: OnchainContractRole): void {
    if (!this.roles.has(address)) {
      this.roles.set(address, new Set());
    }
    this.roles.get(address)!.add(role);
  }

  public async initializeCore(adminSecret: string): Promise<string> {
    return this.generateTxHash();
  }

  public async registerSite(siteIdHex: string, _adminSecret?: string): Promise<string> {
    const normalized = normalizeBytes32Hex(siteIdHex);
    if (this.registeredSites.has(normalized)) {
      throw new Error(`Site already registered: ${normalized}`);
    }
    this.registeredSites.add(normalized);
    return this.generateTxHash();
  }

  public async isSiteRegistered(siteIdHex: string): Promise<boolean> {
    return this.registeredSites.has(normalizeBytes32Hex(siteIdHex));
  }

  public async addRole(
    targetAddress: string,
    role: OnchainContractRole,
    _adminSecret?: string
  ): Promise<string> {
    this.addRoleInternal(targetAddress, role);
    return this.generateTxHash();
  }

  public async hasRole(targetAddress: string, role: OnchainContractRole): Promise<boolean> {
    return this.roles.get(targetAddress)?.has(role) ?? false;
  }

  public async initializeAttendance(_adminSecret: string, _coreContractId: string): Promise<string> {
    return this.generateTxHash();
  }

  public async anchorAttendance(
    siteIdHex: string,
    period: number,
    merkleRootHex: string,
    _anchorerSecret?: string
  ): Promise<OnchainAnchorResult> {
    const normSite = normalizeBytes32Hex(siteIdHex);
    const normRoot = normalizeBytes32Hex(merkleRootHex);

    if (!this.registeredSites.has(normSite)) {
      throw new Error(`Site not registered on-chain: ${normSite}`);
    }

    const key = `${normSite}:${period}`;
    if (this.anchors.has(key)) {
      throw new Error(`Anchor already exists for site ${normSite} and period ${period}`);
    }

    const ledgerTime = Math.floor(Date.now() / 1000);
    const anchorData: OnchainAnchorData = {
      merkleRoot: normRoot,
      submittedBy: this.adminAddress,
      ledgerTime,
    };
    this.anchors.set(key, anchorData);

    const txHash = this.generateTxHash();
    return {
      txHash,
      siteId: normSite,
      period,
      merkleRoot: normRoot,
      ledgerTime,
    };
  }

  public async getAnchor(siteIdHex: string, period: number): Promise<OnchainAnchorData | null> {
    const normSite = normalizeBytes32Hex(siteIdHex);
    const key = `${normSite}:${period}`;
    return this.anchors.get(key) || null;
  }

  public async recordCorrection(
    siteIdHex: string,
    correctionHashHex: string,
    _approverAddress: string,
    _hrSecret?: string
  ): Promise<string> {
    const normSite = normalizeBytes32Hex(siteIdHex);
    const normCorr = normalizeBytes32Hex(correctionHashHex);

    if (!this.registeredSites.has(normSite)) {
      throw new Error(`Site not registered on-chain: ${normSite}`);
    }

    if (this.corrections.has(normCorr)) {
      throw new Error(`Correction already exists: ${normCorr}`);
    }

    this.corrections.set(normCorr, true);
    return this.generateTxHash();
  }
}
