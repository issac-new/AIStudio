<?php
// fixture compliant: 定义的两个路由 name 均被 controller route() 引用，双向对齐
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\UserController;

Route::get('/users', [UserController::class, 'index'])->name('users.index');
Route::get('/users/profile', [UserController::class, 'profile'])->name('users.profile');
