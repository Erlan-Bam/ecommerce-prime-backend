import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../shared/services/prisma.service';
import {
  RegisterUserDto,
  LoginUserDto,
  LoginAdminDto,
  GuestAuthDto,
  TelegramAuthDto,
  EnterUserDto,
  VerifyCodeDto,
  ResendCodeDto,
} from '../dto';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { AuthRedisService } from './auth-redis.service';
import { AuthSmsService } from './auth-sms.service';
import { randomUUID } from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly authRedisService: AuthRedisService,
    private readonly authSmsService: AuthSmsService,
  ) {}

  // ==================== SMS OTP AUTH ====================

  private normalizePhone(phone: string): string {
    return phone.replace(/[\s\-\(\)]/g, '');
  }

  async enterUser(dto: EnterUserDto) {
    const phone = this.normalizePhone(dto.phone);

    try {
      // Generate and store verification code
      const code = this.authRedisService.generateCode();
      await this.authRedisService.storeCode(phone, code);

      // Send SMS with verification code
      await this.authSmsService.sendVerificationCode(phone, code);

      this.logger.log(`Verification code sent to ${phone}`);

      return {
        message: 'Verification code sent successfully',
        phone,
      };
    } catch (error) {
      this.logger.error(
        `Failed to send verification code to ${phone}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Не удалось отправить SMS. Попробуйте позже или обратитесь в поддержку.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async verifyCode(dto: VerifyCodeDto) {
    const phone = this.normalizePhone(dto.phone);
    const { code } = dto;

    try {
      // Check brute-force lockout
      const attempts = await this.authRedisService.getAttempts(phone);
      if (this.authRedisService.isLockedOut(attempts)) {
        throw new HttpException(
          'Too many failed attempts. Please request a new code.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      const isValid = await this.authRedisService.verifyCode(phone, code);
      if (!isValid) {
        await this.authRedisService.incrementAttempts(phone);
        throw new HttpException(
          'Invalid or expired code',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Delete the code and reset attempts after successful verification
      await this.authRedisService.deleteCode(phone);
      await this.authRedisService.resetAttempts(phone);

      // Create or get user
      const user = await this.prisma.user.upsert({
        where: { phone },
        update: {},
        create: { phone, name: phone, role: Role.USER },
      });

      const tokens = await this.generateTokens(user.id, user.role);

      return {
        message: 'Phone verified successfully',
        user: {
          id: user.id,
          phone: user.phone,
          email: user.email,
          name: user.name,
          role: user.role,
          avatar: user.avatar,
        },
        ...tokens,
      };
    } catch (error) {
      this.logger.error(`Failed to verify code for ${phone}`, error.stack);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to verify code. Please try again later.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async resendCode(dto: ResendCodeDto) {
    const phone = this.normalizePhone(dto.phone);

    try {
      // Check if there's an existing code and get its creation time
      const existingCode = await this.authRedisService.getCode(phone);
      if (existingCode) {
        const elapsed = Date.now() - existingCode.createdAt;
        const minResendInterval = 60 * 1000; // 1 minute minimum between resends

        if (elapsed < minResendInterval) {
          const remainingSeconds = Math.ceil(
            (minResendInterval - elapsed) / 1000,
          );
          throw new HttpException(
            `Please wait ${remainingSeconds} seconds before requesting a new code`,
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }

      // Generate new code and store it
      const code = this.authRedisService.generateCode();
      await this.authRedisService.storeCode(phone, code);

      // Send SMS with new verification code
      await this.authSmsService.sendVerificationCode(phone, code);

      return {
        message: 'Verification code resent successfully',
        phone,
      };
    } catch (error) {
      this.logger.error(
        `Failed to resend verification code to ${phone}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Не удалось отправить SMS. Попробуйте позже или обратитесь в поддержку.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  async logout(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      if (payload.jti) {
        await this.authRedisService.revokeRefreshToken(payload.id, payload.jti);
      }

      this.logger.log(`User ${payload.id} logged out, refresh token revoked`);

      return { message: 'Logged out successfully' };
    } catch (error) {
      this.logger.error(`Logout failed: ${error.message}`);
      // Even if token is invalid/expired, return success (idempotent)
      return { message: 'Logged out successfully' };
    }
  }

  async logoutAll(userId: string) {
    await this.authRedisService.revokeAllRefreshTokens(userId);
    this.logger.log(`User ${userId} logged out from all devices`);
    return { message: 'Logged out from all devices successfully' };
  }

  // ==================== USER AUTH (email/password) ====================

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

  // ==================== ADMIN AUTH ====================

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

  // ==================== TELEGRAM AUTH ====================

  async telegramAuth(dto: TelegramAuthDto) {
    try {
      this.logger.log(`Telegram auth attempt for ID: ${dto.id}`);

      // 1. Verify Telegram hash
      this.verifyTelegramHash(dto);

      // 2. Check auth_date is not too old (allow up to 1 day)
      const currentTime = Math.floor(Date.now() / 1000);
      if (currentTime - dto.auth_date > 86400) {
        throw new HttpException(
          'Telegram auth data is expired',
          HttpStatus.UNAUTHORIZED,
        );
      }

      const telegramId = String(dto.id);

      // 3. Find or create user
      let user = await this.prisma.user.findUnique({
        where: { telegramId },
      });

      if (user) {
        // Existing user — check if banned
        if (user.isBanned) {
          throw new HttpException('User is banned', HttpStatus.FORBIDDEN);
        }

        // Update avatar if changed
        if (dto.photo_url && dto.photo_url !== user.avatar) {
          user = await this.prisma.user.update({
            where: { id: user.id },
            data: { avatar: dto.photo_url },
          });
        }

        this.logger.log(`Existing Telegram user logged in: ${user.id}`);
      } else {
        // New user — create account from Telegram data
        const name = [dto.first_name, dto.last_name]
          .filter(Boolean)
          .join(' ');

        user = await this.prisma.user.create({
          data: {
            telegramId,
            name: name || `Telegram User ${dto.id}`,
            avatar: dto.photo_url || null,
            role: Role.USER,
          },
        });

        this.logger.log(`New Telegram user created: ${user.id}`);
      }

      const tokens = await this.generateTokens(user.id, user.role);

      return {
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          name: user.name,
          role: user.role,
          telegramId: user.telegramId,
          avatar: user.avatar,
        },
        ...tokens,
      };
    } catch (error) {
      this.logger.error(
        `Error in Telegram auth: ${error.message}`,
        error.stack,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to authenticate via Telegram',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private verifyTelegramHash(dto: TelegramAuthDto): void {
    const botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');

    if (!botToken) {
      throw new HttpException(
        'Telegram bot token not configured',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const { hash, ...data } = dto;

    // Build check string: key=value pairs sorted alphabetically, joined by \n
    const checkString = Object.keys(data)
      .sort()
      .map((key) => `${key}=${data[key as keyof typeof data]}`)
      .filter((pair) => !pair.endsWith('=undefined') && !pair.endsWith('=null'))
      .join('\n');

    // SHA256 hash of bot token is used as secret key
    const secretKey = crypto
      .createHash('sha256')
      .update(botToken)
      .digest();

    // HMAC-SHA256 of check string with the secret key
    const hmac = crypto
      .createHmac('sha256', secretKey)
      .update(checkString)
      .digest('hex');

    if (hmac !== hash) {
      throw new HttpException(
        'Invalid Telegram auth data',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  // ==================== TOKEN MANAGEMENT ====================

  private async generateTokens(userId: string, role: string) {
    const tokenId = randomUUID();
    const payload = { id: userId, role, jti: tokenId };

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

    // Store refresh token in Redis for revocation support
    await this.authRedisService.storeRefreshToken(userId, tokenId);

    return {
      accessToken,
      refreshToken,
    };
  }

  async refreshTokens(refreshToken: string) {
    try {
      this.logger.log('Refreshing tokens');

      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      // If token has jti, validate it against Redis
      if (payload.jti) {
        const isValid = await this.authRedisService.isRefreshTokenValid(
          payload.id,
          payload.jti,
        );
        if (!isValid) {
          throw new HttpException(
            'Refresh token has been revoked',
            HttpStatus.UNAUTHORIZED,
          );
        }
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.id },
      });

      if (!user) {
        throw new HttpException('User not found', HttpStatus.UNAUTHORIZED);
      }

      if (user.isBanned) {
        await this.authRedisService.revokeAllRefreshTokens(user.id);
        throw new HttpException('User is banned', HttpStatus.FORBIDDEN);
      }

      // Revoke old refresh token (rotation)
      if (payload.jti) {
        await this.authRedisService.revokeRefreshToken(payload.id, payload.jti);
      }

      const tokens = await this.generateTokens(user.id, user.role);

      this.logger.log(`Tokens refreshed for user: ${user.id}`);

      return {
        ...tokens,
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          name: user.name,
          role: user.role,
        },
      };
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

  // ==================== PROFILE ====================

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
          avatar: true,
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
