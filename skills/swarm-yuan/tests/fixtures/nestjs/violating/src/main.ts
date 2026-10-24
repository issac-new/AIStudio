import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // 无 whitelist：DTO 未声明字段直透业务层（批量赋值风险）
  app.useGlobalPipes(new ValidationPipe());
  await app.listen(3000);
}
bootstrap();
