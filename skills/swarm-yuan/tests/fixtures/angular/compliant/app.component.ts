import { Component, ChangeDetectionStrategy } from '@angular/core';
import { UserComponent } from './user.component';

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UserComponent],
  template: '<app-user></app-user>',
})
export class AppComponent {}
