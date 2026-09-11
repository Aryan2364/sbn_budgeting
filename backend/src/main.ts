import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      // Left false deliberately. Each list endpoint declares its own
      // filters as separate @Query() params, so forbidding anything not
      // on the shared ListQueryDto would reject `isActive` and `role`
      // along with the junk.
      //
      // The protection that matters is elsewhere and is loud: an
      // undeclared sort column and an unknown filter key both 400 in
      // runListQuery. A typo'd sort never silently falls back to the
      // default, which is the failure worth preventing. A stray query
      // parameter is ignored.
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  /**
   * A comma-separated list, because the Next dev server takes whatever
   * port is free and a single hard-coded origin turns every port change
   * into a "could not reach the server" that looks like a broken API.
   */
  const origins = (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins });

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}/api`);
}

void bootstrap();
