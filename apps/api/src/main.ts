import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { config } from './common/config';
import { AuthService } from './auth/auth.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    })
  );

  // Set global prefix
  app.setGlobalPrefix('api/v1');

  // OpenAPI Swagger configuration
  const swaggerConfig = new DocumentBuilder()
    .setTitle('GateFlow API')
    .setDescription(
      'Workforce attendance and visitor access platform anchored on the Stellar blockchain'
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  // Seed default admin if none exists
  const authService = app.get(AuthService);
  await authService.createInitialAdmin('admin@gateflow.example', 'Admin12345!');

  await app.listen(config.port);
  console.log(`GateFlow API running on http://localhost:${config.port}/api/v1`);
  console.log(`Swagger documentation available at http://localhost:${config.port}/api/docs`);
}

bootstrap();
