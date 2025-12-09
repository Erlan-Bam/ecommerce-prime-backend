import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../shared/services/prisma.service';
import { RegisterUserDto, LoginUserDto, LoginAdminDto } from './dto';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async registerUser(dto: RegisterUserDto) {
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.email }, { phone: dto.phone }],
      },
    });

    if (existingUser) {
      if (existingUser.email === dto.email) {
        throw new ConflictException('Email already exists');
      }
      throw new ConflictException('Phone already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        phone: dto.phone,
        name: dto.name,
        password: hashedPassword,
        role: 'USER',
      },
    });

    const tokens = await this.generateTokens(user.id, user.role);

    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        role: user.role,
      },
      ...tokens,
    };
  }

  async loginUser(dto: LoginUserDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.isBanned) {
      throw new ForbiddenException('User is banned');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.generateTokens(user.id, user.role);

    return {
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        role: user.role,
      },
      ...tokens,
    };
  }

  async loginAdmin(dto: LoginAdminDto) {
    const admin = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (admin.role !== 'ADMIN') {
      throw new ForbiddenException('Access denied: Admins only');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, admin.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.generateTokens(admin.id, admin.role);

    return {
      user: {
        id: admin.id,
        email: admin.email,
        phone: admin.phone,
        name: admin.name,
        role: admin.role,
      },
      ...tokens,
    };
  }

  async refreshTokens(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.id },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      if (user.isBanned) {
        throw new ForbiddenException('User is banned');
      }

      const tokens = await this.generateTokens(user.id, user.role);

      return tokens;
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private async generateTokens(userId: string, role: string) {
    const payload = { id: userId, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: '7d',
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }
}
