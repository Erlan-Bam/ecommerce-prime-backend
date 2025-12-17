import {
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(private configService: ConfigService) {
    cloudinary.config({
      cloudinary_url: this.configService.get<string>('CLOUDINARY_URL'),
    });
  }

  async saveImage(
    file: Express.Multer.File,
    filename: string,
  ): Promise<string> {
    try {
      this.logger.log(`Uploading image: ${filename}`);

      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            public_id: filename.split('.')[0],
            folder: 'ecommerce',
          },
          (error, result) => {
            if (error) {
              this.logger.error(
                `Cloudinary upload error: ${error.message}`,
                error.stack,
              );
              reject(
                new HttpException('Failed to upload image to Cloudinary', HttpStatus.BAD_REQUEST),
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
}
