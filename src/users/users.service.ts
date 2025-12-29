import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/services/prisma.service';
import { UpdateUserDto } from './dto';
import { Prisma, Role } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

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
}
