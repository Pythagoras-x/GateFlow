import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../common/prisma.service';
import { EncryptionService } from '../common/encryption.service';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '@gateflow/shared-types';
import { LoginRequestDto, LoginResponseDto } from '@gateflow/shared-types';
import { config } from '../common/config';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly encryption: EncryptionService,
    private readonly audit: AuditService
  ) {}

  public async login(dto: LoginRequestDto): Promise<LoginResponseDto> {
    const emailHash = this.encryption.hashBlindIndex(dto.email);
    let user = await this.prisma.user.findFirst({
      where: { emailHash },
    });

    if (!user) {
      // Fallback for legacy records without blind index: find and backfill
      const users = await this.prisma.user.findMany();
      user = users.find((u) => {
        try {
          return this.encryption.decrypt(u.emailEnc).toLowerCase() === dto.email.toLowerCase();
        } catch {
          return false;
        }
      }) || null;

      if (user) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { emailHash },
        });
      }
    }

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is suspended');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload = {
      sub: user.id,
      email: dto.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: config.jwtExpiresIn as any,
    });
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: config.refreshTokenExpiresIn as any,
    });

    await this.audit.logAction(user.id, 'USER_LOGIN', 'User', { email: dto.email });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: dto.email,
        role: user.role as UserRole,
      },
    };
  }

  public async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: config.jwtSecret,
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || user.status !== 'ACTIVE') {
        throw new UnauthorizedException('Invalid user session');
      }

      const email = this.encryption.decrypt(user.emailEnc);
      const newAccessToken = this.jwtService.sign(
        { sub: user.id, email, role: user.role },
        { expiresIn: config.jwtExpiresIn as any }
      );

      return { accessToken: newAccessToken };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  public async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      email: this.encryption.decrypt(user.emailEnc),
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
    };
  }

  public async createInitialAdmin(email: string, password: string) {
    const existingUsers = await this.prisma.user.count();
    if (existingUsers > 0) {
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const emailEnc = this.encryption.encrypt(email);
    const emailHash = this.encryption.hashBlindIndex(email);

    return this.prisma.user.create({
      data: {
        emailEnc,
        emailHash,
        passwordHash,
        role: UserRole.Admin,
        status: 'ACTIVE',
      },
    });
  }
}
