import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { SitesModule } from './sites/sites.module';
import { EmployeesModule } from './employees/employees.module';
import { ShiftsModule } from './shifts/shifts.module';
import { AttendanceModule } from './attendance/attendance.module';
import { AnchoringModule } from './anchoring/anchoring.module';
import { VisitorsModule } from './visitors/visitors.module';
import { PrismaService } from './common/prisma.service';
import { EncryptionService } from './common/encryption.service';

@Module({
  imports: [
    AuthModule,
    AuditModule,
    SitesModule,
    EmployeesModule,
    ShiftsModule,
    AttendanceModule,
    AnchoringModule,
    VisitorsModule,
  ],
  providers: [PrismaService, EncryptionService],
})
export class AppModule {}
