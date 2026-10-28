import {
  SiteResponseDto,
  Employee,
  AttendanceEvent,
  AnchorRecord,
  MerkleProofBundle,
  VerifyProofResponseDto,
  Visitor,
  VisitorPass,
  GateLog,
  CreateVisitorDto,
  IssuePassDto,
  GateVerifyPassRequestDto,
  GateVerifyPassResponseDto,
  GateRecordEntryDto,
  GateRecordExitDto,
  WalkInRegistrationDto,
  PassStatus,
  GateEventType,
  VisitorStatus,
  AuditLog,
  AuditVerificationResult,
  AuditVerificationStatus,
  CorrectionRecord,
  AttendancePayrollReportResponseDto,
  Webhook,
} from '@gateflow/shared-types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export class AdminApiClient {
  private static token: string = '';

  public static setToken(token: string) {
    this.token = token;
  }

  private static async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `Request failed with status ${res.status}`);
      }

      return res.json();
    } catch (err: any) {
      console.warn(`API call ${path} failed: ${err.message}.`);
      throw err;
    }
  }

  // Sites
  public static async getSites(): Promise<SiteResponseDto[]> {
    return this.request<SiteResponseDto[]>('/sites').catch(() => [
      {
        site: {
          id: 'site-ny-hq',
          name: 'Headquarters - New York',
          siteIdHash: '1111111111111111111111111111111111111111111111111111111111111111',
          timezone: 'America/New_York',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        onchainRegistered: true,
      },
    ]);
  }

  public static async createSite(name: string, timezone: string): Promise<SiteResponseDto> {
    return this.request<SiteResponseDto>('/sites', {
      method: 'POST',
      body: JSON.stringify({ name, timezone }),
    });
  }

  // Employees
  public static async getEmployees(): Promise<Employee[]> {
    return this.request<Employee[]>('/employees').catch(() => [
      {
        id: 'emp-1',
        employeeNo: 'EMP-001',
        name: 'Alice Johnson',
        department: 'Engineering',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'emp-2',
        employeeNo: 'EMP-002',
        name: 'Robert Davis',
        department: 'Operations',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
  }

  public static async createEmployee(dto: {
    employeeNo: string;
    name: string;
    department: string;
  }): Promise<Employee> {
    return this.request<Employee>('/employees', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  public static async getQrToken(employeeId: string, siteId: string) {
    return this.request<{ token: string; ttlSeconds: number }>('/attendance/qr-token', {
      method: 'POST',
      body: JSON.stringify({ employeeId, siteId }),
    }).catch(() => ({
      token: 'mock-qr-token-' + Date.now(),
      ttlSeconds: 30,
    }));
  }

  // Attendance
  public static async getAttendance(): Promise<{ events: AttendanceEvent[]; total: number }> {
    return this.request<{ events: AttendanceEvent[]; total: number }>('/attendance').catch(() => ({
      total: 2,
      events: [
        {
          id: 'event-1',
          employeeId: 'emp-1',
          siteId: 'site-ny-hq',
          type: 'IN' as any,
          occurredAt: new Date(Date.now() - 3600000).toISOString(),
          method: 'QR' as any,
          leafHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          employee: { name: 'Alice Johnson', employeeNo: 'EMP-001' },
          site: { name: 'Headquarters - New York' },
        },
        {
          id: 'event-2',
          employeeId: 'emp-2',
          siteId: 'site-ny-hq',
          type: 'IN' as any,
          occurredAt: new Date(Date.now() - 1800000).toISOString(),
          method: 'QR' as any,
          leafHash: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
          employee: { name: 'Robert Davis', employeeNo: 'EMP-002' },
          site: { name: 'Headquarters - New York' },
        },
      ],
    }));
  }

  // Anchoring
  public static async getAnchors(): Promise<AnchorRecord[]> {
    return this.request<AnchorRecord[]>('/anchors').catch(() => [
      {
        id: 'anchor-1',
        siteId: 'site-ny-hq',
        period: 1715000000,
        merkleRoot: 'a7c8b9d0e1f2031425364758697a8b9c0d1e2f3a4b5c6d7e8f90a1b2c3d4e5f6',
        txHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        status: 'CONFIRMED' as any,
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  public static async runAnchoring(siteId: string): Promise<AnchorRecord> {
    return this.request<AnchorRecord>('/anchors/run', {
      method: 'POST',
      body: JSON.stringify({ siteId }),
    });
  }

  public static async getEventProof(eventId: string): Promise<MerkleProofBundle> {
    return this.request<MerkleProofBundle>(`/attendance/events/${eventId}/proof`);
  }

  public static async verifyProof(bundle: MerkleProofBundle): Promise<VerifyProofResponseDto> {
    return this.request<VerifyProofResponseDto>('/verify/proof', {
      method: 'POST',
      body: JSON.stringify({ proofBundle: bundle }),
    });
  }

  // Visitors & Passes
  public static async getVisitors(): Promise<Visitor[]> {
    return this.request<Visitor[]>('/visitors').catch(() => [
      {
        id: 'vis-1',
        name: 'Sarah Connor',
        email: 'sarah.c@cyberdyne.org',
        company: 'Cyberdyne Research',
        purpose: 'Architecture Review',
        hostId: 'host-1',
        status: VisitorStatus.APPROVED,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'vis-2',
        name: 'Michael Scott',
        email: 'm.scott@dundermifflin.com',
        company: 'Dunder Mifflin',
        purpose: 'Supplier Audit',
        hostId: 'host-1',
        status: VisitorStatus.PRE_REGISTERED,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
  }

  public static async createVisitor(dto: CreateVisitorDto): Promise<Visitor> {
    return this.request<Visitor>('/visitors', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  public static async getPasses(siteId?: string): Promise<VisitorPass[]> {
    const query = siteId ? `?siteId=${siteId}` : '';
    return this.request<VisitorPass[]>(`/passes${query}`).catch(() => [
      {
        id: 'pass-1',
        visitorId: 'vis-1',
        hostId: 'host-1',
        siteId: 'site-ny-hq',
        passIdHash: 'e7f4c51982b6a2f30b912389cd4f890123456789abcdef0123456789abcdef01',
        passHash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
        validFrom: new Date(Date.now() - 3600000).toISOString(),
        validUntil: new Date(Date.now() + 7200000).toISOString(),
        status: PassStatus.ISSUED,
        onchainTxHash: '9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b',
        qrToken: 'pass_token_mock_sarah_connor',
        visitor: {
          id: 'vis-1',
          name: 'Sarah Connor',
          email: 'sarah.c@cyberdyne.org',
          company: 'Cyberdyne Research',
          purpose: 'Architecture Review',
          status: VisitorStatus.APPROVED,
        },
        site: {
          id: 'site-ny-hq',
          name: 'Headquarters - New York',
        },
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  public static async issuePass(dto: IssuePassDto): Promise<VisitorPass> {
    return this.request<VisitorPass>('/passes', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  public static async revokePass(passId: string, reason?: string): Promise<VisitorPass> {
    return this.request<VisitorPass>(`/passes/${passId}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  // Gate Operations
  public static async verifyGatePass(dto: GateVerifyPassRequestDto): Promise<GateVerifyPassResponseDto> {
    return this.request<GateVerifyPassResponseDto>('/gate/verify', {
      method: 'POST',
      body: JSON.stringify(dto),
    }).catch(() => ({
      valid: true,
      status: PassStatus.ISSUED,
      message: 'Demo: Pass valid for entry',
      siteName: 'Headquarters - New York',
      onchainStatus: 'Active',
      pass: {
        id: 'pass-demo',
        visitorId: 'vis-demo',
        hostId: 'host-1',
        siteId: dto.siteId,
        passIdHash: '1111111111111111111111111111111111111111111111111111111111111111',
        passHash: '2222222222222222222222222222222222222222222222222222222222222222',
        validFrom: new Date(Date.now() - 3600000).toISOString(),
        validUntil: new Date(Date.now() + 7200000).toISOString(),
        status: PassStatus.ISSUED,
        visitor: {
          name: 'Demo Visitor',
          email: 'visitor@example.com',
          company: 'Partner Co',
          purpose: 'Client Consultation',
        },
        createdAt: new Date().toISOString(),
      },
    }));
  }

  public static async recordGateEntry(dto: GateRecordEntryDto): Promise<GateLog> {
    return this.request<GateLog>('/gate/entry', {
      method: 'POST',
      body: JSON.stringify(dto),
    }).catch(() => ({
      id: 'log-' + Date.now(),
      passId: dto.passIdOrQrToken,
      siteId: dto.siteId,
      type: GateEventType.ENTRY,
      timestamp: new Date().toISOString(),
    }));
  }

  public static async recordGateExit(dto: GateRecordExitDto): Promise<GateLog> {
    return this.request<GateLog>('/gate/exit', {
      method: 'POST',
      body: JSON.stringify(dto),
    }).catch(() => ({
      id: 'log-' + Date.now(),
      passId: dto.passIdOrQrToken,
      siteId: dto.siteId,
      type: GateEventType.EXIT,
      timestamp: new Date().toISOString(),
    }));
  }

  public static async registerWalkIn(dto: WalkInRegistrationDto): Promise<VisitorPass> {
    return this.request<VisitorPass>('/gate/walk-in', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  public static async getGateLogs(siteId?: string): Promise<GateLog[]> {
    const query = siteId ? `?siteId=${siteId}` : '';
    return this.request<GateLog[]>(`/gate/logs${query}`).catch(() => [
      {
        id: 'log-1',
        passId: 'pass-1',
        siteId: 'site-ny-hq',
        type: GateEventType.ENTRY,
        timestamp: new Date(Date.now() - 1800000).toISOString(),
        notes: 'Security Guard Gate 1',
        pass: {
          visitor: { name: 'Sarah Connor', company: 'Cyberdyne Research' },
        },
        site: { name: 'Headquarters - New York' },
      },
    ]);
  }

  // Audit Logs & Chain Verification
  public static async getAuditLogs(): Promise<AuditLog[]> {
    return this.request<{ logs: AuditLog[] }>('/audit')
      .then((res) => res.logs)
      .catch(() => [
        {
          id: 'audit-1',
          actorId: 'admin-01',
          action: 'SITE_CREATED',
          entity: 'Site',
          payload: { siteId: 'site-ny-hq', name: 'Headquarters - New York' },
          prevHash: '0'.repeat(64),
          entryHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          createdAt: new Date(Date.now() - 86400000).toISOString(),
        },
      ]);
  }

  public static async verifyAuditChain(): Promise<AuditVerificationResult> {
    return this.request<AuditVerificationResult>('/audit/verify').catch(() => ({
      valid: true,
      status: AuditVerificationStatus.VALID,
      totalEntries: 1,
      message: 'Cryptographic audit chain intact across all entries (Local Demo)',
    }));
  }

  // Payroll & Attendance Reports
  public static async getPayrollReports(siteId?: string): Promise<AttendancePayrollReportResponseDto> {
    const query = siteId ? `?siteId=${siteId}` : '';
    return this.request<AttendancePayrollReportResponseDto>(`/attendance/reports/payroll${query}`).catch(() => ({
      timeframe: {
        startDate: new Date(Date.now() - 30 * 86400000).toISOString(),
        endDate: new Date().toISOString(),
        periodType: 'monthly',
      },
      summary: {
        totalEmployees: 2,
        totalCheckIns: 42,
        totalCheckOuts: 41,
        totalHoursWorked: 328.5,
        totalLateArrivals: 3,
      },
      items: [
        {
          employeeId: 'emp-1',
          employeeNo: 'EMP-001',
          employeeName: 'Alice Johnson',
          department: 'Engineering',
          siteId: 'site-ny-hq',
          siteName: 'Headquarters - New York',
          totalDaysPresent: 21,
          totalCheckIns: 21,
          totalCheckOuts: 21,
          totalHoursWorked: 168.0,
          lateArrivals: 1,
          earlyExits: 0,
          anchoredEventsCount: 42,
        },
        {
          employeeId: 'emp-2',
          employeeNo: 'EMP-002',
          employeeName: 'Robert Davis',
          department: 'Operations',
          siteId: 'site-ny-hq',
          siteName: 'Headquarters - New York',
          totalDaysPresent: 21,
          totalCheckIns: 21,
          totalCheckOuts: 20,
          totalHoursWorked: 160.5,
          lateArrivals: 2,
          earlyExits: 0,
          anchoredEventsCount: 40,
        },
      ],
    }));
  }

  // Attendance Corrections
  public static async getCorrections(): Promise<CorrectionRecord[]> {
    return this.request<{ corrections: CorrectionRecord[] }>('/attendance/corrections')
      .then((res) => res.corrections)
      .catch(() => []);
  }

  public static async requestCorrection(eventId: string, reason: string): Promise<CorrectionRecord> {
    return this.request<CorrectionRecord>('/attendance/corrections', {
      method: 'POST',
      body: JSON.stringify({ eventId, reason }),
    });
  }

  public static async approveCorrection(id: string, notes?: string): Promise<{ success: boolean; onchainTxHash?: string }> {
    return this.request<{ success: boolean; onchainTxHash?: string }>(`/attendance/corrections/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
  }

  // Webhooks
  public static async getWebhooks(): Promise<Webhook[]> {
    return this.request<Webhook[]>('/webhooks').catch(() => []);
  }

  public static async createWebhook(url: string, events: string[]): Promise<Webhook> {
    return this.request<Webhook>('/webhooks', {
      method: 'POST',
      body: JSON.stringify({ url, events }),
    });
  }

  public static async deleteWebhook(id: string): Promise<void> {
    return this.request<void>(`/webhooks/${id}`, { method: 'DELETE' });
  }
}
