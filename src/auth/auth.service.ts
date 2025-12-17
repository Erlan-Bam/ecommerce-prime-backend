import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../shared/services/prisma.service';
import { RegisterUserDto, LoginUserDto, LoginAdminDto } from './dto';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';

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
          role: 'USER',
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

      if (admin.role !== 'ADMIN') {
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
