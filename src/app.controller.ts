import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from './shared/services/prisma.service';
import { Prisma } from '@prisma/client';

@ApiTags('App')
@Controller('')
export class AppController {
  private readonly logger = new Logger(AppController.name);
  constructor(private readonly prisma: PrismaService) {}

  @Get('healthz')
  async healthCheck() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        status: 'ok',
        database: 'connected',
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          error: 'Database connection failed',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
