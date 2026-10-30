export enum UserRole {
  Admin = 'Admin',
  HR = 'HR',
  Security = 'Security',
  Host = 'Host',
  Auditor = 'Auditor',
}

export enum OnchainContractRole {
  Admin = 1,
  HR = 2,
  Security = 3,
  Host = 4,
  Anchorer = 5,
}

export enum AttendanceType {
  IN = 'IN',
  OUT = 'OUT',
}

export enum AttendanceMethod {
  QR = 'QR',
  NFC = 'NFC',
  BLE = 'BLE',
  KIOSK = 'KIOSK',
  MANUAL = 'MANUAL',
}

export enum AnchorStatus {
  PENDING = 'PENDING',
  SUBMITTED = 'SUBMITTED',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
}

export enum PassStatus {
  ISSUED = 'ISSUED',
  ENTERED = 'ENTERED',
  EXITED = 'EXITED',
  REVOKED = 'REVOKED',
  EXPIRED = 'EXPIRED',
}

export enum GateEventType {
  ENTRY = 'ENTRY',
  EXIT = 'EXIT',
}

export enum VisitorStatus {
  PRE_REGISTERED = 'PRE_REGISTERED',
  APPROVED = 'APPROVED',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  BLACKLISTED = 'BLACKLISTED',
}

export enum WebhookEvent {
  ATTENDANCE_CHECKED_IN = 'attendance.checked_in',
  ATTENDANCE_CHECKED_OUT = 'attendance.checked_out',
  VISITOR_ARRIVED = 'visitor.arrived',
  VISITOR_DEPARTED = 'visitor.departed',
  PASS_ISSUED = 'pass.issued',
  PASS_REVOKED = 'pass.revoked',
  ANCHOR_CONFIRMED = 'anchor.confirmed',
  CORRECTION_APPROVED = 'correction.approved',
}

export enum AuditVerificationStatus {
  VALID = 'VALID',
  CORRUPTED = 'CORRUPTED',
  EMPTY = 'EMPTY',
}

export enum CorrectionStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum SponsorshipGuardCode {
  ALLOWED = 'ALLOWED',
  FEE_EXCEEDS_MAX_TX = 'FEE_EXCEEDS_MAX_TX',
  HOURLY_CAP_EXCEEDED = 'HOURLY_CAP_EXCEEDED',
  DAILY_CAP_EXCEEDED = 'DAILY_CAP_EXCEEDED',
  CONTRACT_NOT_ALLOWED = 'CONTRACT_NOT_ALLOWED',
  INSUFFICIENT_SPONSOR_BALANCE = 'INSUFFICIENT_SPONSOR_BALANCE',
}

export enum SponsorshipHealthStatus {
  HEALTHY = 'HEALTHY',
  WARNING_LOW_BALANCE = 'WARNING_LOW_BALANCE',
  CRITICAL_BUDGET_EXHAUSTED = 'CRITICAL_BUDGET_EXHAUSTED',
}

