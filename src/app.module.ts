import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { SharedModule } from './shared/shared.module';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { CategoryModule } from './category/category.module';
import { AuthModule } from './auth/auth.module';
import { GuestModule } from './guest/guest.module';
import { ProductModule } from './product/product.module';
import { BrandModule } from './brand/brand.module';
import { SearchModule } from './search/search.module';
import { UploadModule } from './upload/upload.module';
import { PickupPointModule } from './pickup-point/pickup-point.module';
import { CouponModule } from './coupon/coupon.module';
import { OrderModule } from './order/order.module';
import { FavoriteModule } from './favorite/favorite.module';
import { BlogModule } from './blog/blog.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      envFilePath: ['.env'],
    }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public', 'images'),
      serveRoot: '/images',
      serveStaticOptions: {
        index: false,
      },
    }),
    ScheduleModule.forRoot(),
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT),
        password: process.env.REDIS_PASSWORD,
        maxRetriesPerRequest: 3,
      },
    }),
    SharedModule,
    AuthModule,
    GuestModule,
    CategoryModule,
    BrandModule,
    ProductModule,
    SearchModule,
    UploadModule,
    PickupPointModule,
    CouponModule,
    OrderModule,
    FavoriteModule,
    BlogModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
