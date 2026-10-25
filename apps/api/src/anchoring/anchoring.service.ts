import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { EncryptionService } from '../common/encryption.service';
import { AuditService } from '../audit/audit.service';
import { GateFlowMerkleTree, verifyMerkleProof, computeRootFromProof, hashLeaf } from '@gateflow/merkle';
import { StellarClient, normalizeBytes32Hex } from '@gateflow/stellar-client';
import {
  AnchorRecord,
  AnchorStatus,
  MerkleProofBundle,
  VerifyProofRequestDto,
  VerifyProofResponseDto,
  AttendanceType,
} from '@gateflow/shared-types';
import { config } from '../common/config';

@Injectable()
export class AnchoringService {
  private stellarClient: StellarClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
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

  /**
   * Builds the Merkle tree for unanchored site events and submits the root on-chain.
   */
  public async runAnchoring(siteId: string, customPeriod?: number): Promise<AnchorRecord> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
    });
    if (!site) {
      throw new NotFoundException(`Site with id ${siteId} not found`);
    }

    // Default period: start of current day in seconds
    const now = new Date();
    const period = customPeriod || Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000);

    // Check if this (site, period) has already been anchored
    const existingAnchor = await this.prisma.anchor.findUnique({
      where: {
        siteId_period: {
          siteId: site.id,
          period: BigInt(period),
        },
      },
    });

    if (existingAnchor && existingAnchor.status === 'CONFIRMED') {
      return {
        id: existingAnchor.id,
        siteId: existingAnchor.siteId,
        period: Number(existingAnchor.period),
        merkleRoot: existingAnchor.merkleRoot,
        txHash: existingAnchor.txHash || undefined,
        ledger: existingAnchor.ledger || undefined,
        status: existingAnchor.status as AnchorStatus,
        createdAt: existingAnchor.createdAt.toISOString(),
      };
    }

    // Find all unanchored events for this site
    const events = await this.prisma.attendanceEvent.findMany({
      where: {
        siteId: site.id,
        anchorId: null,
      },
      orderBy: { occurredAt: 'asc' },
    });

    if (events.length === 0) {
      throw new BadRequestException(`No unanchored events found for site "${site.name}"`);
    }

    // Deterministic leaf sorting
    const leafHashes = events.map((e) => e.leafHash).sort();
    const tree = new GateFlowMerkleTree(leafHashes);
    const merkleRoot = tree.getRoot();

    // Call Soroban contract to anchor Merkle root
    const onchainResult = await this.stellarClient.anchorAttendance(
      site.siteIdHash,
      period,
      merkleRoot
    );

    // Save anchor record
    const anchor = await this.prisma.anchor.upsert({
      where: {
        siteId_period: {
          siteId: site.id,
          period: BigInt(period),
        },
      },
      update: {
        merkleRoot,
        txHash: onchainResult.txHash,
        status: 'CONFIRMED',
        confirmedAt: new Date(),
      },
      create: {
        siteId: site.id,
        period: BigInt(period),
        merkleRoot,
        txHash: onchainResult.txHash,
        status: 'CONFIRMED',
        confirmedAt: new Date(),
      },
    });

    // Save individual proofs for fast auditing and mark events as anchored
    for (const event of events) {
      const proof = tree.getProof(event.leafHash);

      await this.prisma.merkleProof.upsert({
        where: { eventId: event.id },
        update: { proofJson: JSON.stringify(proof) },
        create: {
          eventId: event.id,
          proofJson: JSON.stringify(proof),
        },
      });

      await this.prisma.attendanceEvent.update({
        where: { id: event.id },
        data: { anchorId: anchor.id },
      });
    }

    await this.audit.logAction('SYSTEM_WORKER', 'ANCHOR_ATTENDANCE', 'Anchor', {
      anchorId: anchor.id,
      siteId: site.id,
      period,
      merkleRoot,
      txHash: onchainResult.txHash,
      eventsCount: events.length,
    });

    return {
      id: anchor.id,
      siteId: anchor.siteId,
      period: Number(anchor.period),
      merkleRoot: anchor.merkleRoot,
      txHash: anchor.txHash || undefined,
      ledger: anchor.ledger || undefined,
      status: anchor.status as AnchorStatus,
      createdAt: anchor.createdAt.toISOString(),
      confirmedAt: anchor.confirmedAt?.toISOString(),
    };
  }

  /**
   * Get all anchors with site info
   */
  public async getAnchors(): Promise<AnchorRecord[]> {
    const anchors = await this.prisma.anchor.findMany({
      orderBy: { createdAt: 'desc' },
      include: { site: true },
    });

    return anchors.map((a) => ({
      id: a.id,
      siteId: a.siteId,
      period: Number(a.period),
      merkleRoot: a.merkleRoot,
      txHash: a.txHash || undefined,
      ledger: a.ledger || undefined,
      status: a.status as AnchorStatus,
      createdAt: a.createdAt.toISOString(),
      confirmedAt: a.confirmedAt?.toISOString(),
    }));
  }

  /**
   * Get anchor by ID
   */
  public async getAnchorById(id: string): Promise<AnchorRecord> {
    const a = await this.prisma.anchor.findUnique({
      where: { id },
      include: { site: true },
    });
    if (!a) throw new NotFoundException(`Anchor ${id} not found`);

    return {
      id: a.id,
      siteId: a.siteId,
      period: Number(a.period),
      merkleRoot: a.merkleRoot,
      txHash: a.txHash || undefined,
      ledger: a.ledger || undefined,
      status: a.status as AnchorStatus,
      createdAt: a.createdAt.toISOString(),
      confirmedAt: a.confirmedAt?.toISOString(),
    };
  }

  /**
   * Generates a complete cryptographic proof bundle for an individual event
   */
  public async getProofBundleForEvent(eventId: string): Promise<MerkleProofBundle> {
    const event = await this.prisma.attendanceEvent.findUnique({
      where: { id: eventId },
      include: {
        employee: true,
        site: true,
        anchor: true,
        proof: true,
      },
    });

    if (!event) throw new NotFoundException(`Event ${eventId} not found`);
    if (!event.anchor || !event.proof) {
      throw new BadRequestException(`Event ${eventId} has not yet been anchored on-chain`);
    }

    const proof = JSON.parse(event.proof.proofJson);
    const salt = this.encryption.decrypt(event.saltEnc);

    return {
      leaf: event.leafHash,
      proof,
      root: event.anchor.merkleRoot,
      period: Number(event.anchor.period),
      siteId: event.site.siteIdHash,
      txHash: event.anchor.txHash || undefined,
      ledger: event.anchor.ledger || undefined,
      rawEvent: {
        employeeRef: event.employee.employeeNo,
        siteId: event.site.siteIdHash,
        type: event.type as AttendanceType,
        timestamp: Math.floor(event.occurredAt.getTime() / 1000),
        nonce: event.nonce,
        salt,
      },
    };
  }

  /**
   * Public independent proof verification:
   * 1. Recomputes leaf if rawEvent is provided
   * 2. Recomputes root from leaf & proof
   * 3. Queries on-chain contract to check if on-chain stored root matches
   */
  public async verifyProof(dto: VerifyProofRequestDto): Promise<VerifyProofResponseDto> {
    const bundle = dto.proofBundle;
    if (!bundle || !bundle.leaf || !bundle.proof || !bundle.root) {
      throw new BadRequestException('Malformed proof bundle');
    }

    // 1. If raw event is present, verify leaf integrity
    if (bundle.rawEvent) {
      const computedLeaf = hashLeaf(
        {
          employee_ref: bundle.rawEvent.employeeRef,
          nonce: bundle.rawEvent.nonce,
          site_id: bundle.rawEvent.siteId,
          timestamp: bundle.rawEvent.timestamp,
          type: bundle.rawEvent.type,
        },
        bundle.rawEvent.salt
      );

      if (computedLeaf.toLowerCase() !== bundle.leaf.toLowerCase()) {
        return {
          valid: false,
          rootMatchesOnchain: false,
          computedRoot: '',
          status: 'LEAF_MISMATCH',
          message: 'Computed leaf hash from raw event does not match bundle leaf hash (data tampered)',
        };
      }
    }

    // 2. Recompute Merkle root from proof path
    const computedRoot = computeRootFromProof(bundle.leaf, bundle.proof);
    const isTreeValid = computedRoot.toLowerCase() === bundle.root.toLowerCase();

    if (!isTreeValid) {
      return {
        valid: false,
        rootMatchesOnchain: false,
        computedRoot,
        status: 'TAMPERED_PROOF',
        message: 'Computed root from proof path does not match expected bundle root',
      };
    }

    // 3. Query on-chain smart contract
    let onchainAnchor = null;
    try {
      onchainAnchor = await this.stellarClient.getAnchor(bundle.siteId, bundle.period);
    } catch {
      onchainAnchor = null;
    }

    const onchainRoot = onchainAnchor?.merkleRoot;
    const rootMatchesOnchain =
      !!onchainRoot && onchainRoot.toLowerCase() === bundle.root.toLowerCase();

    if (!rootMatchesOnchain) {
      return {
        valid: true,
        rootMatchesOnchain: false,
        computedRoot,
        onchainRoot: onchainRoot || undefined,
        status: 'NOT_ANCHORED',
        message: 'Merkle proof is cryptographically sound, but root does not match on-chain record for that period',
      };
    }

    return {
      valid: true,
      rootMatchesOnchain: true,
      computedRoot,
      onchainRoot,
      ledgerTimestamp: onchainAnchor?.ledgerTime,
      status: 'VERIFIED',
      message: 'Record cryptographically proven and anchored on the Stellar blockchain',
    };
  }
}
