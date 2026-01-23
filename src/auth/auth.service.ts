import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../shared/services/prisma.service';
import {
  RegisterUserDto,
  LoginUserDto,
  LoginAdminDto,
  GuestAuthDto,
} from './dto';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async registerUser(dto: RegisterUserDto) {
    try {
      this.logger.log(`Registering user with email: ${dto.email}`);

      const existingUser = await this.prisma.user.findFirst({
        where: {
          OR: [{ email: dto.email }, { phone: dto.phone }],
        },
      });

      if (existingUser) {
        if (existingUser.email === dto.email) {
          throw new HttpException('Email already exists', HttpStatus.CONFLICT);
        }
        throw new HttpException('Phone already exists', HttpStatus.CONFLICT);
      }

      const hashedPassword = await bcrypt.hash(dto.password, 10);

      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          phone: dto.phone,
          name: dto.name,
          password: hashedPassword,
          role: Role.USER,
        },
      });

      const tokens = await this.generateTokens(user.id, user.role);

      this.logger.log(`User registered successfully: ${user.id}`);

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
    } catch (error) {
      this.logger.error(
        `Error registering user: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to register user',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async loginUser(dto: LoginUserDto) {
    try {
      this.logger.log(`User login attempt: ${dto.email}`);

      const user = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });

      if (!user) {
        throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
      }

      if (user.isBanned) {
        throw new HttpException('User is banned', HttpStatus.FORBIDDEN);
      }

      const isPasswordValid = await bcrypt.compare(dto.password, user.password);

      if (!isPasswordValid) {
        throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
      }

      const tokens = await this.generateTokens(user.id, user.role);

      this.logger.log(`User logged in successfully: ${user.id}`);

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
    } catch (error) {
      this.logger.error(`Error logging in user: ${error.message}`, error.stack);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to login user',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async loginAdmin(dto: LoginAdminDto) {
    try {
      this.logger.log(`Admin login attempt: ${dto.email}`);

      const admin = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });

      if (!admin) {
        throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
      }

      if (admin.role !== Role.ADMIN) {
        throw new HttpException(
          'Access denied: Admins only',
          HttpStatus.FORBIDDEN,
        );
      }

      const isPasswordValid = await bcrypt.compare(
        dto.password,
        admin.password,
      );

      if (!isPasswordValid) {
        throw new HttpException('Invalid credentials', HttpStatus.UNAUTHORIZED);
      }

      const tokens = await this.generateTokens(admin.id, admin.role);

      this.logger.log(`Admin logged in successfully: ${admin.id}`);

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
    } catch (error) {
      this.logger.error(
        `Error logging in admin: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to login admin',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async refreshTokens(refreshToken: string) {
    try {
      this.logger.log('Refreshing tokens');

      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.id },
      });

      if (!user) {
        throw new HttpException('User not found', HttpStatus.UNAUTHORIZED);
      }

      if (user.isBanned) {
        throw new HttpException('User is banned', HttpStatus.FORBIDDEN);
      }

      const tokens = await this.generateTokens(user.id, user.role);

      this.logger.log(`Tokens refreshed for user: ${user.id}`);

      return tokens;
    } catch (error) {
      this.logger.error(
        `Error refreshing tokens: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Invalid refresh token',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getProfile(userId: string) {
    try {
      this.logger.log(`Getting profile for user: ${userId}`);

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
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      return user;
    } catch (error) {
      this.logger.error(`Error getting profile: ${error.message}`, error.stack);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to get user profile',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async changePassword(userId: string, newPassword: string) {
    try {
      this.logger.log(`Changing password for user: ${userId}`);

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      await this.prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword },
      });

      this.logger.log(`Password changed successfully for user: ${userId}`);

      return { message: 'Password changed successfully' };
    } catch (error) {
      this.logger.error(
        `Error changing password: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to change password',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
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

  // ==================== GUEST AUTH ====================

  async guestAuth(dto: GuestAuthDto, ipAddress?: string) {
    try {
      this.logger.log(
        `Guest auth attempt with fingerprint: ${dto.fingerprint.substring(0, 8)}...`,
      );

      // Check if guest session already exists
      let guestSession = await this.prisma.guestSession.findUnique({
        where: { fingerprint: dto.fingerprint },
      });

      if (guestSession) {
        // Update last active time
        guestSession = await this.prisma.guestSession.update({
          where: { id: guestSession.id },
          data: {
            lastActiveAt: new Date(),
            userAgent: dto.userAgent || guestSession.userAgent,
            ipAddress: ipAddress || guestSession.ipAddress,
          },
        });

        this.logger.log(`Existing guest session found: ${guestSession.id}`);
      } else {
        // Create new guest session
        guestSession = await this.prisma.guestSession.create({
          data: {
            fingerprint: dto.fingerprint,
            userAgent: dto.userAgent,
            ipAddress: ipAddress,
          },
        });

        this.logger.log(`New guest session created: ${guestSession.id}`);
      }

      const tokens = await this.generateGuestTokens(
        guestSession.id,
        dto.fingerprint,
      );

      return {
        guest: {
          id: guestSession.id,
          fingerprint: guestSession.fingerprint,
          isGuest: true,
        },
        ...tokens,
      };
    } catch (error) {
      this.logger.error(`Error in guest auth: ${error.message}`, error.stack);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to authenticate guest',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async refreshGuestTokens(refreshToken: string) {
    try {
      this.logger.log('Refreshing guest tokens');

      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      // Check if this is a guest token
      if (!payload.isGuest) {
        throw new HttpException('Invalid guest token', HttpStatus.UNAUTHORIZED);
      }

      const guestSession = await this.prisma.guestSession.findUnique({
        where: { id: payload.id },
      });

      if (!guestSession) {
        throw new HttpException(
          'Guest session not found',
          HttpStatus.UNAUTHORIZED,
        );
      }

      // Update last active time
      await this.prisma.guestSession.update({
        where: { id: guestSession.id },
        data: { lastActiveAt: new Date() },
      });

      const tokens = await this.generateGuestTokens(
        guestSession.id,
        guestSession.fingerprint,
      );

      this.logger.log(`Guest tokens refreshed for session: ${guestSession.id}`);

      return tokens;
    } catch (error) {
      this.logger.error(
        `Error refreshing guest tokens: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Invalid refresh token',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getGuestSession(sessionId: string) {
    try {
      this.logger.log(`Getting guest session: ${sessionId}`);

      const guestSession = await this.prisma.guestSession.findUnique({
        where: { id: sessionId },
        include: {
          cartItems: {
            include: {
              product: {
                include: {
                  images: true,
                },
              },
            },
          },
        },
      });

      if (!guestSession) {
        throw new HttpException(
          'Guest session not found',
          HttpStatus.NOT_FOUND,
        );
      }

      return {
        id: guestSession.id,
        fingerprint: guestSession.fingerprint,
        isGuest: true,
        cartItems: guestSession.cartItems,
        lastActiveAt: guestSession.lastActiveAt,
        createdAt: guestSession.createdAt,
      };
    } catch (error) {
      this.logger.error(
        `Error getting guest session: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to get guest session',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async generateGuestTokens(sessionId: string, fingerprint: string) {
    const payload = {
      id: sessionId,
      fingerprint,
      isGuest: true,
      role: 'GUEST',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: '1h', // Longer for guests
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: '30d', // Longer for guests
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }
}
