import {
  UserRole,
  AttendanceType,
  AttendanceMethod,
  AnchorStatus,
  PassStatus,
  GateEventType,
  VisitorStatus,
} from './enums';
import {
  Site,
  Employee,
  AttendanceEvent,
  AnchorRecord,
  MerkleProofBundle,
  Visitor,
  VisitorPass,
  GateLog,
} from './models';

// Auth
export interface LoginRequestDto {
  email: string;
  password: string;
}

export interface LoginResponseDto {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    role: UserRole;
  };
}

// Sites
export interface CreateSiteDto {
  name: string;
  timezone?: string;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
}

export interface SiteResponseDto {
  site: Site;
  onchainRegistered?: boolean;
}

// Employees
export interface CreateEmployeeDto {
  employeeNo: string;
  name: string;
  phone?: string;
  department: string;
  shiftId?: string;
}

export interface BindDeviceDto {
  publicKey: string;
  platform: 'ios' | 'android' | 'web';
}

// Attendance
export interface GenerateQrTokenDto {
  employeeId: string;
  siteId: string;
}

export interface QrTokenResponseDto {
  token: string;
  expiresAt: string;
  ttlSeconds: number;
}

export interface CheckInRequestDto {
  qrToken?: string;
  employeeId?: string;
  siteId: string;
  method: AttendanceMethod;
  latitude?: number;
  longitude?: number;
  deviceSignature?: string;
}

export interface CheckOutRequestDto {
  qrToken?: string;
  employeeId?: string;
  siteId: string;
  method: AttendanceMethod;
}

export interface AttendanceResponseDto {
  success: boolean;
  event: AttendanceEvent;
  message: string;
}

export interface AttendanceQueryDto {
  siteId?: string;
  employeeId?: string;
  type?: AttendanceType;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface AttendanceReportSummaryDto {
  totalCheckIns: number;
  totalCheckOuts: number;
  onTimeCount: number;
  lateCount: number;
  period: string;
  siteId: string;
}

// Anchoring
export interface TriggerAnchorDto {
  siteId: string;
  period?: number;
}

export interface AnchorResponseDto {
  anchor: AnchorRecord;
  leavesCount: number;
  merkleRoot: string;
}

export interface VerifyProofRequestDto {
  proofBundle: MerkleProofBundle;
}

export interface VerifyProofResponseDto {
  valid: boolean;
  rootMatchesOnchain: boolean;
  computedRoot: string;
  onchainRoot?: string;
  ledgerTimestamp?: number;
  status: 'VERIFIED' | 'TAMPERED_PROOF' | 'NOT_ANCHORED' | 'LEAF_MISMATCH';
  message: string;
}

// Visitors and Passes
export interface CreateVisitorDto {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  purpose: string;
  hostId?: string;
}

export interface IssuePassDto {
  visitorId: string;
  siteId: string;
  validFrom: string; // ISO string
  validUntil: string; // ISO string
  notes?: string;
}

export interface RevokePassDto {
  passId: string;
  reason?: string;
}

export interface GateVerifyPassRequestDto {
  passIdOrQrToken: string;
  siteId: string;
}

export interface GateVerifyPassResponseDto {
  valid: boolean;
  status: PassStatus;
  message: string;
  pass?: VisitorPass;
  onchainStatus?: string;
  siteName?: string;
}

export interface GateRecordEntryDto {
  passIdOrQrToken: string;
  siteId: string;
  guardId?: string;
  notes?: string;
}

export interface GateRecordExitDto {
  passIdOrQrToken: string;
  siteId: string;
  guardId?: string;
  notes?: string;
}

export interface WalkInRegistrationDto {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  purpose: string;
  hostId: string;
  siteId: string;
  durationHours?: number;
}

export interface VisitorPassQueryDto {
  siteId?: string;
  hostId?: string;
  status?: PassStatus;
  page?: number;
  limit?: number;
}
