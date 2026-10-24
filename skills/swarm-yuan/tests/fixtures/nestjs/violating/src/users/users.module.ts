import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { UsersService } from './users.service';

@Module({
  imports: [OrdersModule],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
