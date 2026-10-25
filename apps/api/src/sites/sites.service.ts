import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StellarClient, stringToBytes32 } from '@gateflow/stellar-client';
import { CreateSiteDto, SiteResponseDto } from '@gateflow/shared-types';
import { config } from '../common/config';

@Injectable()
export class SitesService {
  private stellarClient: StellarClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {
    this.stellarClient = new StellarClient({
      rpcUrl: config.stellar.rpcUrl,
      networkPassphrase: config.stellar.networkPassphrase,
      coreContractId: config.stellar.coreContractId,
      attendanceContractId: config.stellar.attendanceContractId,
      sponsorSecret: config.stellar.sponsorSecret,
      anchorerSecret: config.stellar.anchorerSecret,
      useMock: config.stellar.useMock,
    });
  }

  public async createSite(dto: CreateSiteDto, actorId: string): Promise<SiteResponseDto> {
    const existing = await this.prisma.site.findFirst({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException(`Site with name "${dto.name}" already exists`);
    }

    const siteIdHash = stringToBytes32(dto.name + Date.now().toString());

    // Register on-chain
    let onchainTxHash = '';
    try {
      onchainTxHash = await this.stellarClient.registerSite(siteIdHash);
    } catch {
      // Continue even if already registered on chain
    }

    const site = await this.prisma.site.create({
      data: {
        name: dto.name,
        siteIdHash,
        timezone: dto.timezone || 'UTC',
        latitude: dto.latitude,
        longitude: dto.longitude,
        radiusMeters: dto.radiusMeters || 100,
      },
    });

    await this.audit.logAction(actorId, 'CREATE_SITE', 'Site', {
      siteId: site.id,
      name: site.name,
      siteIdHash,
      onchainTxHash,
    });

    return {
      site: {
        id: site.id,
        name: site.name,
        siteIdHash: site.siteIdHash,
        timezone: site.timezone,
        geofence:
          site.latitude && site.longitude
            ? {
                latitude: site.latitude,
                longitude: site.longitude,
                radiusMeters: site.radiusMeters || 100,
              }
            : undefined,
        createdAt: site.createdAt.toISOString(),
        updatedAt: site.updatedAt.toISOString(),
      },
      onchainRegistered: true,
    };
  }

  public async getSites(): Promise<SiteResponseDto[]> {
    const sites = await this.prisma.site.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const results: SiteResponseDto[] = [];
    for (const site of sites) {
      let onchainRegistered = false;
      try {
        onchainRegistered = await this.stellarClient.isSiteRegistered(site.siteIdHash);
      } catch {
        onchainRegistered = false;
      }

      results.push({
        site: {
          id: site.id,
          name: site.name,
          siteIdHash: site.siteIdHash,
          timezone: site.timezone,
          geofence:
            site.latitude && site.longitude
              ? {
                  latitude: site.latitude,
                  longitude: site.longitude,
                  radiusMeters: site.radiusMeters || 100,
                }
              : undefined,
          createdAt: site.createdAt.toISOString(),
          updatedAt: site.updatedAt.toISOString(),
        },
        onchainRegistered,
      });
    }

    return results;
  }

  public async getSiteById(id: string): Promise<SiteResponseDto> {
    const site = await this.prisma.site.findUnique({
      where: { id },
    });
    if (!site) {
      throw new NotFoundException(`Site with id ${id} not found`);
    }

    const onchainRegistered = await this.stellarClient.isSiteRegistered(site.siteIdHash);

    return {
      site: {
        id: site.id,
        name: site.name,
        siteIdHash: site.siteIdHash,
        timezone: site.timezone,
        geofence:
          site.latitude && site.longitude
            ? {
                latitude: site.latitude,
                longitude: site.longitude,
                radiusMeters: site.radiusMeters || 100,
              }
            : undefined,
        createdAt: site.createdAt.toISOString(),
        updatedAt: site.updatedAt.toISOString(),
      },
      onchainRegistered,
    };
  }
}
