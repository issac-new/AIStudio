import { Injectable, Scope } from '@nestjs/common';

// REQUEST 作用域滥用：无请求态需求却声明 Scope.REQUEST，整条注入链级联请求作用域
@Injectable({ scope: Scope.REQUEST })
export class UsersService {
  findAll() {
    return [];
  }
}
