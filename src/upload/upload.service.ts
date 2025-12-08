import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class UploadService {
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
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            public_id: filename.split('.')[0],
            folder: 'ecommerce',
          },
          (error, result) => {
            if (error) {
              reject(
                new BadRequestException('Failed to upload image to Cloudinary'),
              );
            } else {
              resolve(result.secure_url);
            }
          },
        );
        stream.end(file.buffer);
      });
    } catch (error) {
      console.error('Error uploading image to Cloudinary:', error);
      throw new BadRequestException('Failed to upload image');
    }
  }
}
