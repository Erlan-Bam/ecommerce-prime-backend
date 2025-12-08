import {
  Controller,
  Post,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UploadService } from './upload.service';
import { ApiTags, ApiConsumes, ApiBody, ApiOperation } from '@nestjs/swagger';

@ApiTags('upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('image')
  @ApiOperation({
    summary: 'Upload a single image file',
    description:
      'Upload image files. Supports WEBP, JPEG, PNG, and SVG formats.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter: (req, file, callback) => {
        const allowedTypes = [
          'image/webp',
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/svg+xml',
        ];
        if (allowedTypes.includes(file.mimetype)) {
          callback(null, true);
        } else {
          callback(
            new BadRequestException(
              `Invalid image type. Allowed types: ${allowedTypes.join(', ')}`,
            ),
            false,
          );
        }
      },
    }),
  )
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const ext = file.originalname.substring(file.originalname.lastIndexOf('.'));
    const filename = `${Math.floor(Math.random() * 100000)}_${Date.now()}${ext}`;
    const url = await this.uploadService.saveImage(file, filename);

    return {
      filename,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      url,
    };
  }

  @Post('images')
  @ApiOperation({
    summary: 'Upload multiple image files',
    description:
      'Upload multiple image files. Supports WEBP, JPEG, PNG, and SVG formats. Max 10 files.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: memoryStorage(),
      fileFilter: (req, file, callback) => {
        const allowedTypes = [
          'image/webp',
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/svg+xml',
        ];
        if (allowedTypes.includes(file.mimetype)) {
          callback(null, true);
        } else {
          callback(
            new BadRequestException(
              `Invalid image type. Allowed types: ${allowedTypes.join(', ')}`,
            ),
            false,
          );
        }
      },
    }),
  )
  async uploadImages(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files uploaded');
    }

    return Promise.all(
      files.map(async (file) => {
        const ext = file.originalname.substring(
          file.originalname.lastIndexOf('.'),
        );
        const filename = `${Math.floor(Math.random() * 100000)}_${Date.now()}${ext}`;
        const url = await this.uploadService.saveImage(file, filename);

        return {
          filename,
          originalName: file.originalname,
          size: file.size,
          mimetype: file.mimetype,
          url,
        };
      }),
    );
  }
}
