import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly watermarkPublicId: string;
  private readonly watermarkFilePath: string;
  private watermarkReadyPromise: Promise<string | null> | null = null;

  constructor(private configService: ConfigService) {
    cloudinary.config({
      api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
      cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
    });
    this.watermarkPublicId =
      this.configService.get<string>('CLOUDINARY_WATERMARK_PUBLIC_ID') ||
      'ecommerce/watermarks/prime-logo';
    this.watermarkFilePath = path.resolve(
      process.cwd(),
      'public',
      'watermarks',
      'prime.svg',
    );
  }

  async saveImage(
    file: Express.Multer.File,
    filename: string,
    options?: { withWatermark?: boolean },
  ): Promise<string> {
    try {
      this.logger.log(`Uploading image: ${filename}`);
      const withWatermark = options?.withWatermark === true;

      const uploadOptions: Record<string, any> = {
        public_id: filename.split('.')[0],
        folder: 'ecommerce',
      };

      if (withWatermark) {
        const watermarkId = await this.ensureWatermarkAsset();
        if (watermarkId) {
          uploadOptions.transformation =
            this.buildWatermarkTransformation(watermarkId);
        } else {
          this.logger.warn(
            'Watermark requested but asset is unavailable, uploading without watermark',
          );
        }
      }

      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          uploadOptions,
          (error, result) => {
            if (error) {
              this.logger.error(
                `Cloudinary upload error: ${error.message}`,
                error.stack,
              );
              reject(
                new HttpException(
                  'Failed to upload image to Cloudinary',
                  HttpStatus.BAD_REQUEST,
                ),
              );
            } else {
              this.logger.log(
                `Image uploaded successfully: ${result.secure_url}`,
              );
              resolve(result.secure_url);
            }
          },
        );
        stream.end(file.buffer);
      });
    } catch (error) {
      this.logger.error(`Error uploading image: ${error.message}`, error.stack);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to upload image',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private buildWatermarkTransformation(watermarkPublicId: string) {
    const overlayId = watermarkPublicId.replace(/\//g, ':');
    return [
      {
        overlay: overlayId,
        width: 0.2,
        flags: 'relative',
      },
      {
        flags: 'layer_apply',
        gravity: 'south_east',
        x: 18,
        y: 18,
        opacity: 78,
      },
    ];
  }

  private ensureWatermarkAsset(): Promise<string | null> {
    if (this.watermarkReadyPromise) {
      return this.watermarkReadyPromise;
    }

    this.watermarkReadyPromise = (async () => {
      try {
        const svg = await fs.readFile(this.watermarkFilePath, 'utf8');
        const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;

        await cloudinary.uploader.upload(dataUri, {
          public_id: this.watermarkPublicId,
          resource_type: 'image',
          overwrite: true,
          invalidate: true,
        });
        this.logger.log(`Watermark asset refreshed: ${this.watermarkPublicId}`);
        return this.watermarkPublicId;
      } catch (uploadError) {
        this.logger.warn(
          `Failed to refresh watermark asset: ${uploadError instanceof Error ? uploadError.message : uploadError}`,
        );
        return null;
      }
    })();

    return this.watermarkReadyPromise;
  }
}
