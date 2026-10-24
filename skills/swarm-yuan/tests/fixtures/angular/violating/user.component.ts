import { Component } from '@angular/core';
import { UserService } from './user.service';

@Component({
  selector: 'app-user',
  template: `
    <!-- 模板复杂表达式：方法调用链 + 运算 -->
    <div>{{ userService.getUsers().filter(u => u.active).length * 2 + compute() }}</div>
  `,
})
export class UserComponent {
  constructor(public userService: UserService) {}

  compute() {
    return 1;
  }
}
