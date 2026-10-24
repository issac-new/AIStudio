import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppComponent } from './app.component';
import { UserComponent } from './user.component';

// 非 standalone：Angular 17+ standalone 默认，新项目应 standalone
@NgModule({
  declarations: [AppComponent, UserComponent],
  imports: [BrowserModule],
  bootstrap: [AppComponent],
})
export class AppModule {}
