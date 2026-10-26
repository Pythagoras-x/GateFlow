import { OnchainContractRole } from '@gateflow/shared-types';

export interface StellarConfig {
  networkPassphrase?: string;
  rpcUrl?: string;
  horizonUrl?: string;
  coreContractId?: string;
  attendanceContractId?: string;
  visitorsContractId?: string;
  sponsorSecret?: string;
  anchorerSecret?: string;
  adminSecret?: string;
  useMock?: boolean;
}

export interface OnchainAnchorResult {
  txHash: string;
  siteId: string;
  period: number;
  merkleRoot: string;
  ledgerTime: number;
}

export interface OnchainAnchorData {
  merkleRoot: string;
  submittedBy: string;
  ledgerTime: number;
}

export interface OnchainPassData {
  passId: string;
  passHash: string;
  host: string;
  siteId: string;
  validFrom: number;
  validUntil: number;
  status: 'Active' | 'Entered' | 'Exited' | 'Revoked';
  entryTime: number;
  exitTime: number;
}

export interface IStellarClient {
  initializeCore(adminSecret: string): Promise<string>;
  registerSite(siteIdHex: string, adminSecret?: string): Promise<string>;
  isSiteRegistered(siteIdHex: string): Promise<boolean>;
  addRole(targetAddress: string, role: OnchainContractRole, adminSecret?: string): Promise<string>;
  hasRole(targetAddress: string, role: OnchainContractRole): Promise<boolean>;
  
  initializeAttendance(adminSecret: string, coreContractId: string): Promise<string>;
  anchorAttendance(
    siteIdHex: string,
    period: number,
    merkleRootHex: string,
    anchorerSecret?: string
  ): Promise<OnchainAnchorResult>;
  getAnchor(siteIdHex: string, period: number): Promise<OnchainAnchorData | null>;
  
  recordCorrection(
    siteIdHex: string,
    correctionHashHex: string,
    approverAddress: string,
    hrSecret?: string
  ): Promise<string>;

  initializeVisitors(adminSecret: string, coreContractId: string): Promise<string>;
  issuePass(
    passIdHex: string,
    passHashHex: string,
    siteIdHex: string,
    validFrom: number,
    validUntil: number,
    hostSecret?: string
  ): Promise<string>;
  recordEntry(passIdHex: string, guardSecret?: string): Promise<string>;
  recordExit(passIdHex: string, guardSecret?: string): Promise<string>;
  revokePass(passIdHex: string, callerSecret?: string): Promise<string>;
  verifyPass(passIdHex: string): Promise<OnchainPassData | null>;
}
