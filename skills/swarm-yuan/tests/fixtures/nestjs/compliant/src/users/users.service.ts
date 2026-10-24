import { Injectable } from '@nestjs/common';

// DEFAULT 单例作用域；请求态数据经方法参数传递
@Injectable()
export class UsersService {
  findAll() {
    return [];
  }
}
