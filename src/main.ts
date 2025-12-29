import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  HttpException,
  HttpStatus,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const NODE_ENV = process.env.NODE_ENV;
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://e-commerce-production-bf09.up.railway.app',
      'https://ecommerce-prime-backend-production.up.railway.app',
      'https://e-commerce-admin-production-9e9f.up.railway.app',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
    ],
    exposedHeaders: ['Authorization'],
    credentials: true,
  });

  if (NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('E-commerce API')
      .setDescription('E-commerce API endpoints')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          in: 'header',
        },
        'JWT',
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: {
        operationsSorter: (a: any, b: any) => {
          const order: Record<string, number> = {
            post: 1,
            patch: 2,
            delete: 3,
            get: 4,
          };

          const methodA = (a.get('method') as string).toLowerCase();
          const methodB = (b.get('method') as string).toLowerCase();

          const rankA = order[methodA] ?? 99;
          const rankB = order[methodB] ?? 99;

          if (rankA < rankB) return -1;
          if (rankA > rankB) return 1;
          const pathA = a.get('path') as string;
          const pathB = b.get('path') as string;
          return pathA.localeCompare(pathB);
        },
      },
    });
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        return new HttpException(errors, HttpStatus.BAD_REQUEST);
      },
    }),
  );

  const port = Number(process.env.PORT || 6001);
  await app.listen(port, '0.0.0.0');
  logger.log(`HTTP server listening on port ${port}`);
}

bootstrap();
