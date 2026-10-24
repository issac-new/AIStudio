import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from './users/users.module';
import { OrdersModule } from './orders/orders.module';

// violating fixture 追加：TypeORM synchronize: true（启动即改生产库结构，数据丢失风险 CWE-672）
// → fw_nest_typeorm_sync(fail) 主触发
@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: 'postgres://localhost:5432/app',
      autoLoadEntities: true,
      synchronize: true,
    }),
    UsersModule,
    OrdersModule,
  ],
})
export class AppModule {}
