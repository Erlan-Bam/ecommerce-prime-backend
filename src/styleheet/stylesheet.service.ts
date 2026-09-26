import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../shared/services/prisma.service';
import { UpdateStyleSheetDto } from './dto/update-stylesheet.dto';

@Injectable()
export class StyleSheetService {
  private readonly logger = new Logger(StyleSheetService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    // Find and return only first stylesheet
    const stylesheet = await this.prisma.styleSheet.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    if (!stylesheet) {
      throw new HttpException('StyleSheet not found', HttpStatus.NOT_FOUND);
    }

    return stylesheet;
  }

  async update(id: string, dto: UpdateStyleSheetDto) {
    return this.prisma.styleSheet.update({
      where: { id: id },
      data: dto,
    });
  }
}
