import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { User } from './user.model';

@Injectable({ providedIn: 'root' })
export class UserService {
  private http = inject(HttpClient);
  // signal 状态（非裸 Subject）
  private _users = signal<User[]>([]);
  readonly users = this._users.asReadonly();

  load() {
    // subscribe 配 takeUntilDestroyed → 自动取消，无泄漏
    this.http.get<User[]>('/api/users')
      .pipe(takeUntilDestroyed())
      .subscribe(users => this._users.set(users));
  }
}
