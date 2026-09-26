import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { StyleSheetService } from './stylesheet.service';
import { AdminGuard } from '../shared/guards/admin.guard';
import { UpdateStyleSheetDto } from './dto/update-stylesheet.dto';

@ApiTags('stylesheets')
@Controller('stylesheet')
export class StyleSheetController {
  constructor(private readonly stylesheetService: StyleSheetService) {}

  @Get()
  @ApiOperation({ summary: 'Get stylesheet' })
  findAll() {
    return this.stylesheetService.findAll();
  }

  @Put(':id')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update stylesheet (admin)' })
  update(@Param('id') id: string, @Body() dto: UpdateStyleSheetDto) {
    return this.stylesheetService.update(id, dto);
  }
}
