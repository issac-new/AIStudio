<?php
namespace App\Http\Controllers;

use Illuminate\Http\Request;

class UserController extends Controller
{
    public function index(Request $request)
    {
        // 合规：凭据经 env() 注入，.env 样例已登记
        $appName = env('APP_NAME');
        $dbHost = env('DB_HOST');

        // 合规：路由名引用与定义双向对齐
        $profileUrl = route('users.profile');
        $listUrl = route('users.index');

        $userId = $request->input('user_id');

        // 合规：视图传参与模板变量双向对齐
        return view('users.show', ['user' => $userId, 'title' => $appName]);
    }

    public function profile(Request $request)
    {
        return redirect()->route('users.index');
    }
}
