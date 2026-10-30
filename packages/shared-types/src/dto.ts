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
import {
  Site,
  Employee,
  AttendanceEvent,
  AnchorRecord,
  MerkleProofBundle,
  Visitor,
  VisitorPass,
  GateLog,
  CorrectionRecord,
  AuditLog,
  AuditVerificationResult,
  Webhook,
  WebhookDeliveryLog,
  PayrollReportItem,
  SponsorshipGuardConfig,
  SponsorshipEvaluationResult,
  SponsorAccountBalance,
  SponsoredTxRecord,
  SponsorshipDailyMetrics,
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

// Attendance Corrections
export interface RequestCorrectionDto {
  eventId: string;
  reason: string;
}

export interface ApproveCorrectionDto {
  notes?: string;
}

export interface CorrectionResponseDto {
  success: boolean;
  message: string;
  correction: CorrectionRecord;
  onchainTxHash?: string;
}

export interface CorrectionQueryDto {
  siteId?: string;
  eventId?: string;
  status?: CorrectionStatus;
  page?: number;
  limit?: number;
}

// Audit Logs
export interface AuditLogQueryDto {
  actorId?: string;
  action?: string;
  entity?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface AuditExportQueryDto {
  format?: 'json' | 'csv';
  startDate?: string;
  endDate?: string;
}

export interface AuditLogResponseDto {
  logs: AuditLog[];
  total: number;
  page: number;
  limit: number;
}

// Webhooks
export interface CreateWebhookDto {
  url: string;
  events: WebhookEvent[];
  secret?: string;
}

export interface UpdateWebhookDto {
  url?: string;
  events?: WebhookEvent[];
  isActive?: boolean;
}

export interface WebhookResponseDto {
  webhook: Webhook;
}

export interface WebhookDeliveryResponseDto {
  logs: WebhookDeliveryLog[];
  total: number;
}

export interface TestWebhookDto {
  event?: WebhookEvent;
}

// Reports & Payroll Export
export interface AttendanceReportFilterDto {
  siteId?: string;
  department?: string;
  startDate?: string;
  endDate?: string;
  periodType?: 'daily' | 'weekly' | 'monthly' | 'custom';
}

export interface AttendancePayrollReportResponseDto {
  timeframe: {
    startDate: string;
    endDate: string;
    periodType: string;
  };
  summary: {
    totalEmployees: number;
    totalCheckIns: number;
    totalCheckOuts: number;
    totalHoursWorked: number;
    totalLateArrivals: number;
  };
  items: PayrollReportItem[];
}

// Sponsorship & Gas Station
export interface SponsorshipStatusResponseDto {
  metrics: SponsorshipDailyMetrics;
  balance: SponsorAccountBalance;
}

export interface SponsoredTxListResponseDto {
  records: SponsoredTxRecord[];
  total: number;
}

export interface UpdateSponsorshipConfigDto {
  maxFeeStroopsPerTx?: number;
  hourlySpendCapStroops?: number;
  dailySpendCapStroops?: number;
  minBalanceAlertXlm?: number;
  allowedContracts?: string[];
  enabled?: boolean;
}

export interface WrapSponsoredTxRequestDto {
  innerTxXdr: string;
  operationType: string;
  targetContract?: string;
  maxFeeStroops?: number;
}

export interface WrapSponsoredTxResponseDto {
  success: boolean;
  evaluation: SponsorshipEvaluationResult;
  feeBumpTxXdr?: string;
  txHash?: string;
}

