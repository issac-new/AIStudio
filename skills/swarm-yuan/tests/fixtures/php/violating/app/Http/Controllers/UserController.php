<?php
namespace App\Http\Controllers;

use Illuminate\Http\Request;

class UserController extends Controller
{
    public function index(Request $request)
    {
        // 违规 1：硬编码密钥与口令字面量（fw_php_hardcoded_secret）
        $clientSecret = "8f2b7c1e9a4d6b3f5e0c2a8d7b6e5f4c";
        $config = ['password' => 'SuperSecret2024!'];

        // 违规 2：env() 引用键未登记于 .env 样例（fw_php_env_key_drift）
        $dbPass = env('DB_PASSWORD');
        $appName = env('APP_NAME');

        // 违规 3：route() 引用未定义路由名 users.profile（fw_php_route_name）
        $profileUrl = route('users.profile');
        $listUrl = route('users.index');

        // 人工检查面（php.md 规律 7）：$request->input() 参数字符串耦合
        $userId = $request->input('user_id');

        // 违规 4：模板在用的变量未传参、传参 extra 模板未用（fw_php_view_var）
        return view('users.show', ['user' => $userId, 'extra' => 1]);
    }
}
