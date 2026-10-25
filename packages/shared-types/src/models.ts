import {
  UserRole,
  AttendanceType,
  AttendanceMethod,
  AnchorStatus,
  PassStatus,
} from './enums';

export interface Tenant {
  id: string;
  name: string;
  plan: string;
  createdAt: string;
  updatedAt: string;
}

export interface Site {
  id: string;
  tenantId?: string;
  name: string;
  siteIdHash: string; // 32-byte hex hash used on-chain
  timezone: string;
  geofence?: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  tenantId?: string;
  email: string;
  role: UserRole;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
  updatedAt: string;
}

export interface Shift {
  id: string;
  name: string;
  startTime: string; // "09:00"
  endTime: string;   // "17:00"
  graceMinutes: number;
}

export interface Employee {
  id: string;
  tenantId?: string;
  employeeNo: string;
  name: string;
  phone?: string;
  department: string;
  shiftId?: string;
  shift?: Shift;
  createdAt: string;
  updatedAt: string;
}

export interface Device {
  id: string;
  employeeId: string;
  publicKey: string;
  platform: 'ios' | 'android' | 'web';
  boundAt: string;
}

/**
 * The canonical payload used to compute the Merkle leaf.
 * SHA-256(canonical_json({ employee_ref, site_id, type, timestamp, nonce }) || salt)
 */
export interface AttendanceLeafPayload {
  employee_ref: string;
  nonce: string;
  site_id: string;
  timestamp: number;
  type: AttendanceType;
}

export interface AttendanceEvent {
  id: string;
  employeeId: string;
  siteId: string;
  type: AttendanceType;
  occurredAt: string;
  method: AttendanceMethod;
  leafHash: string;
  anchorId?: string;
  anchor?: AnchorRecord;
  employee?: Partial<Employee>;
  site?: Partial<Site>;
}

export interface AnchorRecord {
  id: string;
  siteId: string;
  period: number; // Unix timestamp period (e.g. day start)
  merkleRoot: string;
  txHash?: string;
  ledger?: number;
  status: AnchorStatus;
  createdAt: string;
  confirmedAt?: string;
}

export interface MerkleProofPathItem {
  position: 'left' | 'right';
  data: string; // 32-byte hex string
}

export interface MerkleProofBundle {
  leaf: string;
  proof: MerkleProofPathItem[];
  root: string;
  period: number;
  siteId: string;
  txHash?: string;
  ledger?: number;
  rawEvent?: {
    employeeRef: string;
    siteId: string;
    type: AttendanceType;
    timestamp: number;
    nonce: string;
    salt: string;
  };
}

export interface CorrectionRecord {
  id: string;
  eventId: string;
  reason: string;
  requestedBy: string;
  approvedBy: string;
  onchainTxHash?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  action: string;
  entity: string;
  payload: Record<string, unknown>;
  prevHash?: string;
  entryHash: string;
  createdAt: string;
}
