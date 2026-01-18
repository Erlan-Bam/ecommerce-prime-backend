import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/services/prisma.service';
import { CreatePickupWindowDto, UpdatePickupWindowDto } from '../dto';
import { PaginationDto } from '../../shared/dto/pagination.dto';
import { PickupWindowCacheService } from './cache.service';

@Injectable()
export class PickupWindowService {
  private readonly logger = new Logger(PickupWindowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: PickupWindowCacheService,
  ) {}

  async create(dto: CreatePickupWindowDto) {
    const { pointId, startTime, endTime, capacity } = dto;

    this.logger.log(`Creating pickup window for point: ${pointId}`);

    // Validate pickup point exists
    const pickupPoint = await this.prisma.pickupPoint.findUnique({
      where: { id: pointId },
    });

    if (!pickupPoint) {
      throw new NotFoundException('Pickup point not found');
    }

    // Validate time range
    const start = new Date(startTime);
    const end = new Date(endTime);

    if (start >= end) {
      throw new BadRequestException('End time must be after start time');
    }

    // Check for overlapping windows
    const overlapping = await this.prisma.pickupWindow.findFirst({
      where: {
        pointId,
        OR: [
          {
            AND: [{ startTime: { lte: start } }, { endTime: { gt: start } }],
          },
          {
            AND: [{ startTime: { lt: end } }, { endTime: { gte: end } }],
          },
          {
            AND: [{ startTime: { gte: start } }, { endTime: { lte: end } }],
          },
        ],
      },
    });

    if (overlapping) {
      throw new BadRequestException(
        'This time slot overlaps with an existing window',
      );
    }

    const window = await this.prisma.pickupWindow.create({
      data: {
        pointId,
        startTime: start,
        endTime: end,
        capacity,
      },
      include: {
        pickupPoint: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
      },
    });

    await this.cacheService.invalidateByPointId(pointId);
    this.logger.log(`Created pickup window ${window.id}, cache invalidated`);

    return window;
  }

  async findAll(
    paginationDto: PaginationDto,
    filters?: {
      pointId?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const { page = 1, limit = 50 } = paginationDto;
    const skip = (page - 1) * limit;

    this.logger.log(
      `Finding all pickup windows with pagination: ${JSON.stringify(paginationDto)}`,
    );

    const cacheKey = `pickup-window:all:page:${page}:limit:${limit}:point:${filters?.pointId || 'all'}:start:${filters?.startDate || 'none'}:end:${filters?.endDate || 'none'}`;

    const cached = await this.cacheService.getCachedPickupWindows(cacheKey);
    if (cached) {
      this.logger.log(`Cache hit for ${cacheKey}`);
      return cached;
    }

    const where: any = {};

    if (filters?.pointId) {
      where.pointId = filters.pointId;
    }

    if (filters?.startDate || filters?.endDate) {
      where.startTime = {};
      if (filters.startDate) {
        where.startTime.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.startTime.lte = new Date(filters.endDate);
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.pickupWindow.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startTime: 'asc' },
        include: {
          pickupPoint: {
            select: {
              id: true,
              name: true,
              address: true,
            },
          },
        },
      }),
      this.prisma.pickupWindow.count({ where }),
    ]);

    const result = {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };

    await this.cacheService.cachePickupWindows(cacheKey, result);
    this.logger.log(`Cached result for ${cacheKey}`);

    return result;
  }

  async findOne(id: string) {
    this.logger.log(`Finding pickup window: ${id}`);

    const cached = await this.cacheService.getCachedPickupWindow(id);
    if (cached) {
      this.logger.log(`Cache hit for pickup window ${id}`);
      return cached;
    }

    const window = await this.prisma.pickupWindow.findUnique({
      where: { id },
      include: {
        pickupPoint: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
      },
    });

    if (!window) {
      throw new NotFoundException('Pickup window not found');
    }

    await this.cacheService.cachePickupWindow(id, window);
    return window;
  }

  async findAvailable(pointId: string, startDate?: string, endDate?: string) {
    this.logger.log(`Finding available windows for point: ${pointId}`);

    const cacheKey = `pickup-window:available:point:${pointId}:start:${startDate || 'none'}:end:${endDate || 'none'}`;

    const cached = await this.cacheService.getCachedPickupWindows(cacheKey);
    if (cached) {
      this.logger.log(`Cache hit for ${cacheKey}`);
      return cached;
    }

    const where: any = {
      pointId,
    };

    if (startDate || endDate) {
      where.startTime = {};
      if (startDate) {
        where.startTime.gte = new Date(startDate);
      }
      if (endDate) {
        where.startTime.lte = new Date(endDate);
      }
    }

    const windows = await this.prisma.pickupWindow.findMany({
      where,
      orderBy: { startTime: 'asc' },
    });

    const result = windows.map((window) => ({
      id: window.id,
      startTime: window.startTime,
      endTime: window.endTime,
      capacity: window.capacity,
      reserved: window.reserved,
      available: window.capacity - window.reserved,
      isFull: window.reserved >= window.capacity,
    }));

    await this.cacheService.cachePickupWindows(cacheKey, result);
    this.logger.log(`Cached result for ${cacheKey}`);

    return result;
  }

  async update(id: string, dto: UpdatePickupWindowDto) {
    const existingWindow = await this.findOne(id); // Check if exists

    const { startTime, endTime, capacity, reserved } = dto;

    // Validate time range if both provided
    if (startTime && endTime) {
      const start = new Date(startTime);
      const end = new Date(endTime);

      if (start >= end) {
        throw new BadRequestException('End time must be after start time');
      }
    }

    // Validate reserved <= capacity
    if (capacity !== undefined && reserved !== undefined) {
      if (reserved > capacity) {
        throw new BadRequestException('Reserved count cannot exceed capacity');
      }
    }

    const window = await this.prisma.pickupWindow.update({
      where: { id },
      data: {
        ...(startTime && { startTime: new Date(startTime) }),
        ...(endTime && { endTime: new Date(endTime) }),
        ...(capacity !== undefined && { capacity }),
        ...(reserved !== undefined && { reserved }),
      },
      include: {
        pickupPoint: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
      },
    });

    await this.cacheService.invalidatePickupWindow(id);
    await this.cacheService.invalidateByPointId(existingWindow.pickupPoint.id);
    this.logger.log(`Updated pickup window ${id}, cache invalidated`);

    return window;
  }

  async remove(id: string) {
    const existingWindow = await this.findOne(id); // Check if exists

    // Check if there are orders using this window
    const ordersCount = await this.prisma.order.count({
      where: { windowId: id },
    });

    if (ordersCount > 0) {
      throw new BadRequestException(
        'Cannot delete window with existing orders. Please reassign or cancel orders first.',
      );
    }

    const result = await this.prisma.pickupWindow.delete({
      where: { id },
    });

    await this.cacheService.invalidatePickupWindow(id);
    await this.cacheService.invalidateByPointId(existingWindow.pickupPoint.id);
    this.logger.log(`Deleted pickup window ${id}, cache invalidated`);

    return result;
  }

  async incrementReserved(id: string) {
    const window = await this.findOne(id);

    if (window.reserved >= window.capacity) {
      throw new BadRequestException('Pickup window is full');
    }

    const updated = await this.prisma.pickupWindow.update({
      where: { id },
      data: { reserved: { increment: 1 } },
    });

    await this.cacheService.invalidatePickupWindow(id);
    await this.cacheService.invalidateByPointId(window.pickupPoint.id);

    return updated;
  }

  async decrementReserved(id: string) {
    const window = await this.findOne(id);

    if (window.reserved <= 0) {
      throw new BadRequestException('Reserved count is already 0');
    }

    const updated = await this.prisma.pickupWindow.update({
      where: { id },
      data: { reserved: { decrement: 1 } },
    });

    await this.cacheService.invalidatePickupWindow(id);
    await this.cacheService.invalidateByPointId(window.pickupPoint.id);

    return updated;
  }
}
