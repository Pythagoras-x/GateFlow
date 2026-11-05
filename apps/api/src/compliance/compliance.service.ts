import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface ErasureResult {
  subjectType: 'Employee' | 'Visitor';
  subjectId: string;
  piiPurged: boolean;
  saltsPurged: number;
  auditRecorded: boolean;
  timestamp: string;
}

@Injectable()
export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  /**
   * Executes cryptographic erasure under GDPR Art. 17 / NDPR.
   * Deletes off-chain PII and destroys unique random salts, rendering on-chain Merkle leaves permanently uncorrelatable.
   */
  public async eraseSubjectData(
    subjectType: 'Employee' | 'Visitor',
    subjectId: string,
    operatorId: string,
    reason: string
  ): Promise<ErasureResult> {
    let saltsPurged = 0;

    if (subjectType === 'Employee') {
      const employee = await this.prisma.employee.findUnique({
        where: { id: subjectId },
        include: { events: true },
      });

      if (!employee) {
        throw new NotFoundException(`Employee ${subjectId} not found`);
      }

      // 1. Purge salts for all attendance events tied to this employee
      for (const event of employee.events) {
        await this.prisma.attendanceEvent.update({
          where: { id: event.id },
          data: {
            saltEnc: 'PURGED_GDPR_ERASURE',
            nonce: 'PURGED',
          },
        });
        saltsPurged++;
      }

      // 2. Anonymize employee PII
      await this.prisma.employee.update({
        where: { id: employee.id },
        data: {
          nameEnc: 'ANONYMIZED_GDPR_SUBJECT',
          phoneEnc: null,
          department: 'ANONYMIZED',
        },
      });

      // 3. Remove bound devices
      await this.prisma.device.deleteMany({
        where: { employeeId: employee.id },
      });
    } else {
      const visitor = await this.prisma.visitor.findUnique({
        where: { id: subjectId },
      });

      if (!visitor) {
        throw new NotFoundException(`Visitor ${subjectId} not found`);
      }

      await this.prisma.visitor.update({
        where: { id: visitor.id },
        data: {
          nameEnc: 'ANONYMIZED_VISITOR',
          emailEnc: `anonymized_${Date.now()}@gdpr.purged`,
          phoneEnc: null,
          companyEnc: null,
          purpose: 'ANONYMIZED_PURGED',
        },
      });
    }

    // Log the irreversible compliance purge action in immutable audit log
    await this.audit.logAction(operatorId, 'GDPR_SUBJECT_ERASURE', subjectType, {
      subjectId,
      reason,
      saltsPurged,
    });

    return {
      subjectType,
      subjectId,
      piiPurged: true,
      saltsPurged,
      auditRecorded: true,
      timestamp: new Date().toISOString(),
    };
  }
}
