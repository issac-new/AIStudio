import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { OrdersService } from './orders.service';

// 循环依赖：OrdersModule 反向 imports UsersModule
@Module({
  imports: [UsersModule],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
