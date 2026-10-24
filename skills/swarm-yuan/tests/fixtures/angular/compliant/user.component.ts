import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { UserService } from './user.service';

// standalone 组件（无 NgModule）+ OnPush + signal 状态
@Component({
  selector: 'app-user',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- 简单模板表达式：直接读 signal -->
    <div>{{ activeCount() }}</div>
  `,
})
export class UserComponent {
  private userService = inject(UserService);
  // signal 状态 + computed 派生
  users = this.userService.users;
  activeCount = computed(() => this.users().filter(u => u.active).length);
}
