import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SitesService } from '../sites.service';
import { AuditService } from '../../audit/audit.service';

describe('SitesService', () => {
  let sitesService: SitesService;
  let mockPrisma: any;
  let auditService: AuditService;

  beforeEach(() => {
    mockPrisma = {
      site: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      auditLog: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
    };
    auditService = new AuditService(mockPrisma);
    sitesService = new SitesService(mockPrisma, auditService);
  });

  it('creates and registers a site', async () => {
    mockPrisma.site.findFirst.mockResolvedValue(null);
    mockPrisma.site.create.mockImplementation(({ data }: any) => ({
      id: 'site-uuid-1',
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const result = await sitesService.createSite(
      {
        name: 'London Branch',
        timezone: 'Europe/London',
        latitude: 51.5074,
        longitude: -0.1278,
      },
      'admin-id'
    );

    expect(result.site.name).toBe('London Branch');
    expect(result.site.siteIdHash).toHaveLength(64);
    expect(result.onchainRegistered).toBe(true);
  });
});
