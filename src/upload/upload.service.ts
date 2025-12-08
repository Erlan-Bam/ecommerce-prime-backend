import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class UploadService {
  private readonly allowedImageTypes = [
    'image/webp',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/svg+xml',
  ];
  private readonly maxImageSize = 5 * 1024 * 1024; // 5MB

  constructor(private configService: ConfigService) {
    // Configure Cloudinary
    cloudinary.config({
      cloudinary_url: this.configService.get<string>('CLOUDINARY_URL'),
    });
  }

  async validateImageFile(file: Express.Multer.File): Promise<void> {
    if (file.size > this.maxImageSize) {
      throw new BadRequestException(
        `Image size exceeds maximum allowed size of ${this.maxImageSize / 1024 / 1024}MB`,
      );
    }
  }

  async saveImage(
    file: Express.Multer.File,
    filename: string,
  ): Promise<string> {
    await this.validateImageFile(file);

    try {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
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
        uploadStream.end(file.buffer);
      });
    } catch (error) {
      console.error('Error uploading image to Cloudinary:', error);
      throw new BadRequestException('Failed to upload image');
    }
  }

  async getFileUrl(filename: string): Promise<string> {
    // Filename is already the full Cloudinary URL
    return filename;
  }

  async deleteFile(filename: string): Promise<void> {
    try {
      // Extract public_id from Cloudinary URL or use filename
      const publicId = filename.includes('cloudinary.com')
        ? filename.split('/').slice(-2).join('/').split('.')[0]
        : `ecommerce/${filename.split('.')[0]}`;

      await cloudinary.uploader.destroy(publicId);
    } catch (error) {
      console.log('File not found or already deleted:', filename);
    }
  }
}
