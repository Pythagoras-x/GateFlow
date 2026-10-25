import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from '../auth.service';
import { JwtService } from '@nestjs/jwt';
import { EncryptionService } from '../../common/encryption.service';
import { AuditService } from '../../audit/audit.service';
import { UserRole } from '@gateflow/shared-types';

describe('AuthService', () => {
  let authService: AuthService;
  let mockPrisma: any;
  let jwtService: JwtService;
  let encryptionService: EncryptionService;
  let auditService: AuditService;

  beforeEach(() => {
    encryptionService = new EncryptionService();
    jwtService = new JwtService({ secret: 'test-secret' });
    mockPrisma = {
      user: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
      },
      auditLog: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
    };
    auditService = new AuditService(mockPrisma);
    authService = new AuthService(mockPrisma, jwtService, encryptionService, auditService);
  });

  it('rejects login with unknown email', async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);

    await expect(
      authService.login({ email: 'nobody@example.com', password: 'password' })
    ).rejects.toThrow('Invalid email or password');
  });

  it('generates new access token on valid refresh token', async () => {
    const userId = 'user-123';
    const email = 'user@example.com';
    const emailEnc = encryptionService.encrypt(email);

    mockPrisma.user.findUnique.mockResolvedValue({
      id: userId,
      emailEnc,
      role: UserRole.Security,
      status: 'ACTIVE',
    });

    const refreshToken = jwtService.sign(
      { sub: userId, email, role: UserRole.Security },
      { secret: 'gateflow-default-development-secret-jwt-key!' }
    );

    const result = await authService.refresh(refreshToken);
    expect(result.accessToken).toBeDefined();

    const decoded = jwtService.decode(result.accessToken) as any;
    expect(decoded.sub).toBe(userId);
    expect(decoded.email).toBe(email);
  });
});
