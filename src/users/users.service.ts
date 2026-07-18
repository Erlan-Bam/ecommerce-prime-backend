import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/services/prisma.service';
import {
  CreateAdminUserDto,
  UpdateUserDto,
  UpdateProfileDto,
  AdjustUserBonusDto,
} from './dto';
import { BonusType, Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  private normalizeBonusAmount(value: number): number {
    return Math.max(0, Math.round(value * 100) / 100);
  }

  private async calculateBonusBalance(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const db: any = tx ?? this.prisma;
    const grouped = await db.bonus.groupBy({
      by: ['type'],
      where: { userId },
      _sum: { amount: true },
    });

    let balance = 0;

    for (const entry of grouped) {
      const amount = entry._sum.amount ? Number(entry._sum.amount) : 0;
      if (entry.type === BonusType.INCREASE) {
        balance += amount;
      } else {
        balance -= amount;
      }
    }

    return this.normalizeBonusAmount(balance);
  }

  async createByAdmin(dto: CreateAdminUserDto) {
    try {
      const password = await bcrypt.hash(dto.password, 10);

      return await this.prisma.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          phone: dto.phone || null,
          password,
          role: (dto.role || Role.USER) as Role,
        },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          isBanned: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              orders: true,
              favorites: true,
            },
          },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new HttpException(
            'User with this email or phone already exists',
            HttpStatus.CONFLICT,
          );
        }
      }

      throw error;
    }
  }

  async findAll(params: {
    page?: number;
    limit?: number;
    role?: string;
    isBanned?: boolean;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const page = params.page || 1;
    const limit = params.limit || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    if (params.role) {
      where.role = params.role as Role;
    }

    if (params.isBanned !== undefined) {
      where.isBanned = params.isBanned;
    }

    if (params.search) {
      where.OR = [
        { email: { contains: params.search, mode: 'insensitive' } },
        { name: { contains: params.search, mode: 'insensitive' } },
        { phone: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.UserOrderByWithRelationInput = {};
    if (params.sortBy) {
      orderBy[params.sortBy] = params.sortOrder || 'desc';
    } else {
      orderBy.createdAt = 'desc';
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          isBanned: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              orders: true,
              favorites: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isBanned: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            orders: true,
            favorites: true,
          },
        },
      },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    return this.prisma.user.update({
      where: { id },
      data: updateUserDto,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isBanned: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            orders: true,
            favorites: true,
          },
        },
      },
    });
  }

  async ban(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { isBanned: true },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isBanned: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            orders: true,
            favorites: true,
          },
        },
      },
    });
  }

  async unban(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { isBanned: false },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isBanned: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            orders: true,
            favorites: true,
          },
        },
      },
    });
  }

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.email !== undefined && { email: dto.email }),
      },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async changePassword(userId: string, newPassword: string) {
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      throw error;
    }

    return { message: 'Password changed successfully' };
  }

  async getBonusBalance(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const balance = await this.calculateBonusBalance(userId);
    return { balance };
  }

  async accrueBonus(userId: string, dto: AdjustUserBonusDto) {
    return this.adjustBonus(userId, dto, BonusType.INCREASE);
  }

  async writeOffBonus(userId: string, dto: AdjustUserBonusDto) {
    return this.adjustBonus(userId, dto, BonusType.DECREASE);
  }

  private async adjustBonus(
    userId: string,
    dto: AdjustUserBonusDto,
    type: BonusType,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });

      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      const amount = this.normalizeBonusAmount(Number(dto.amount));
      const currentBalance = await this.calculateBonusBalance(userId, tx);

      if (type === BonusType.DECREASE && currentBalance < amount) {
        throw new HttpException(
          'Недостаточно бонусов для списания',
          HttpStatus.BAD_REQUEST,
        );
      }

      const description = dto.description?.trim()
        ? dto.description.trim()
        : type === BonusType.INCREASE
          ? 'Ручное начисление бонусов администратором'
          : 'Ручное списание бонусов администратором';

      const operation = await tx.bonus.create({
        data: {
          userId,
          amount,
          type,
          description,
        },
      });

      const nextBalance =
        type === BonusType.INCREASE
          ? currentBalance + amount
          : currentBalance - amount;

      return {
        success: true,
        balance: this.normalizeBonusAmount(nextBalance),
        operation: {
          id: operation.id,
          amount: Number(operation.amount),
          type: operation.type,
          description: operation.description,
          createdAt: operation.createdAt,
        },
      };
    });
  }
}
