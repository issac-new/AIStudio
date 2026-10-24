<?php
// fixture violating: 定义 users.index / users.legacy，但代码 route('users.profile') 引用了未定义名；
// users.legacy 定义后无人 route() 引用（僵尸 name）。
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\UserController;

Route::get('/users', [UserController::class, 'index'])->name('users.index');
Route::get('/legacy', [UserController::class, 'legacy'])->name('users.legacy');
