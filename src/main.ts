import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module.js'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.setGlobalPrefix('api')
  app.enableCors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' })
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))

  const config = new DocumentBuilder()
    .setTitle('Courses API')
    .setVersion('1.0')
    .addBearerAuth()
    .build()
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config))

  await app.listen(process.env.PORT ?? 3000)
}
bootstrap()