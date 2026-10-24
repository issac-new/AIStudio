import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { User } from './user.model';

@Injectable({ providedIn: 'root' })
export class UserService {
  // 裸 BehaviorSubject 管理状态，无 signal
  private users$ = new BehaviorSubject<User[]>([]);

  constructor(private http: HttpClient) {}

  load() {
    // subscribe 无 takeUntilDestroyed/takeUntil → 泄漏风险（fw_angular_subscribe_cleanup fail 主触发）
    this.http.get<User[]>('/api/users').subscribe(users => this.users$.next(users));
  }

  getUsers() {
    return this.users$.value;
  }
}
