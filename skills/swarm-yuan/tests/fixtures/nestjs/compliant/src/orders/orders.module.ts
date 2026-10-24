import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { OrdersService } from './orders.service';

// 单向依赖：OrdersModule imports UsersModule，UsersModule 不反向引用
@Module({
  imports: [UsersModule],
  providers: [OrdersService],
})
export class OrdersModule {}
