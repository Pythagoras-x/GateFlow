import {
  UserRole,
  AttendanceType,
  AttendanceMethod,
  AnchorStatus,
  PassStatus,
  GateEventType,
  VisitorStatus,
  WebhookEvent,
  AuditVerificationStatus,
  CorrectionStatus,
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
  approvedBy?: string;
  status?: CorrectionStatus;
  onchainTxHash?: string;
  createdAt: string;
  event?: Partial<AttendanceEvent>;
  requestedByUser?: Partial<User>;
  approvedByUser?: Partial<User>;
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

export interface AuditVerificationResult {
  valid: boolean;
  status: AuditVerificationStatus;
  totalEntries: number;
  brokenAtIndex?: number;
  brokenEntryId?: string;
  expectedHash?: string;
  actualHash?: string;
  message: string;
}

export interface Webhook {
  id: string;
  tenantId?: string;
  url: string;
  secret: string;
  events: WebhookEvent[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDeliveryLog {
  id: string;
  webhookId: string;
  event: WebhookEvent;
  payload: string;
  responseStatus?: number;
  responseBody?: string;
  success: boolean;
  attempt: number;
  deliveredAt: string;
}

export interface PayrollReportItem {
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  department: string;
  siteId: string;
  siteName: string;
  totalDaysPresent: number;
  totalCheckIns: number;
  totalCheckOuts: number;
  totalHoursWorked: number;
  lateArrivals: number;
  earlyExits: number;
  anchoredEventsCount: number;
}

export interface Visitor {
  id: string;
  tenantId?: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  purpose: string;
  hostId: string;
  status: VisitorStatus;
  createdAt: string;
  updatedAt: string;
}

export interface VisitorPass {
  id: string;
  visitorId: string;
  hostId: string;
  siteId: string;
  passIdHash: string; // 32-byte hex ID on Soroban
  passHash: string;   // 32-byte cryptographic hash
  validFrom: string;  // ISO timestamp
  validUntil: string;
  status: PassStatus;
  onchainTxHash?: string;
  qrToken?: string;
  entryTime?: string;
  exitTime?: string;
  visitor?: Partial<Visitor>;
  site?: Partial<Site>;
  createdAt: string;
}

export interface GateLog {
  id: string;
  passId: string;
  siteId: string;
  guardId?: string;
  type: GateEventType;
  timestamp: string;
  notes?: string;
  pass?: Partial<VisitorPass>;
  site?: Partial<Site>;
}
