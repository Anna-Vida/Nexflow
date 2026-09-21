import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { NextFunction, Request, Response } from 'express';
import { validateProductionEnv } from './config/production-env.js';

async function bootstrap() {
  validateProductionEnv();
  const app =
    await NestFactory.create(
      AppModule,
    );

  app.setGlobalPrefix('api');

  app.use((request: Request, response: Response, next: NextFunction) => {
    if (request.path.startsWith('/api/auth') || request.path.startsWith('/api/workflows')) {
      response.setHeader('Cache-Control', 'no-store');
    }
    next();
  });

  await app.listen(
    process.env.PORT ?? 3000,
  );
}

await bootstrap();
