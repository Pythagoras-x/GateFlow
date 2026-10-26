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
