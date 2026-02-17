import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './filter/http-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: true,
  });

  const isProduction = process.env.NODE_ENV === 'production';

  // Trust proxy configuration for accurate client IP detection.
  // Production (behind Traefik): TRUST_PROXY=1 (default) trusts the first proxy hop.
  // Development (no proxy, native): TRUST_PROXY=false uses the direct socket IP.
  const trustProxy = process.env.TRUST_PROXY ?? '1';
  if (trustProxy !== 'false') {
    const numericValue = Number(trustProxy);
    app.set(
      'trust proxy',
      Number.isNaN(numericValue) ? trustProxy : numericValue,
    );
  }

  app.use(
    helmet({
      contentSecurityPolicy: isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:'],
              connectSrc: ["'self'"],
              fontSrc: ["'self'"],
              objectSrc: ["'none'"],
              mediaSrc: ["'self'"],
              frameSrc: ["'none'"],
              frameAncestors: ["'none'"],
              workerSrc: ["'self'"],
              baseUri: ["'self'"],
              formAction: ["'self'"],
              upgradeInsecureRequests: [],
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      dnsPrefetchControl: { allow: false },
      frameguard: { action: 'deny' },
      hidePoweredBy: true,
      hsts: isProduction
        ? {
            maxAge: 31536000, // 1 year
            includeSubDomains: true,
            preload: true,
          }
        : false,
      ieNoOpen: true,
      noSniff: true,
      originAgentCluster: true,
      permittedCrossDomainPolicies: { permittedPolicies: 'none' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      xssFilter: true,
    }),
  );

  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/live', 'health/ready'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      disableErrorMessages: isProduction,
    }),
  );

  const allowedOrigins = (
    process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:3000']
  )
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter((o) => o.length > 0);

  for (const origin of allowedOrigins) {
    if (origin === '*') {
      if (isProduction) {
        throw new Error(
          'CORS_ORIGIN=* is not allowed in production with credentials enabled',
        );
      }
      logger.warn(
        'CORS wildcard (*) is configured — acceptable in development only',
      );
      continue;
    }

    try {
      new URL(origin);
    } catch {
      throw new Error(`Invalid CORS origin: "${origin}". Must be a valid URL.`);
    }
  }

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, server-to-server, curl)
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else if (!isProduction && allowedOrigins.includes('*')) {
        logger.warn(
          `CORS: Wildcard match for origin in development: ${origin}`,
        );
        callback(null, true);
      } else if (!isProduction) {
        logger.warn(
          `CORS: Allowing non-whitelisted origin in development: ${origin}`,
        );
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
    maxAge: 7200, // 2 hours — aligns with Chrome's preflight cache cap
  });

  app.useGlobalFilters(new HttpExceptionFilter());

  logger.log(
    `Environment: ${process.env.NODE_ENV}, isProduction: ${isProduction}`,
  );

  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('DHIS2 Server Certification API')
      .setDescription(
        'API for DHIS2 server certification Program (with W3C Verifiable Credentials)',
      )
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          description: 'Enter JWT access token',
          in: 'header',
        },
        'bearer',
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/v1/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
    logger.log('Swagger documentation available at /api/v1/docs');
  }

  const port = process.env.PORT ?? '3001';
  await app.listen(port);
  logger.log(`Application running on port ${port}`);
}

bootstrap().catch((error: unknown) => {
  console.error('Failed to bootstrap application:', error);
  process.exit(1);
});
