// violating fixture（WP-V flutter）：
//  - WebView 远程 URL 无导航拦截 → fw_flutter_webview_unrestricted(fail)
//  - shared_preferences 明文存 auth_token → fw_flutter_sharedprefs_secret(fail)
//  - 裸 print 残留 → fw_flutter_print(warn)
//  - ListView(children) + shrinkWrap:true + 无 SafeArea/const → 多条 warn
// 期望：bash tests/run-framework-fixture.sh flutter → violating 退出码 != 0（FAIL）
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:webview_flutter/webview_flutter.dart';

class HomePage extends StatelessWidget {
  Future<void> saveToken() async {
    final prefs = await SharedPreferences.getInstance();
    // 凭证明文落 shared_preferences（iOS plist / Android XML 未加密）
    prefs.setString('auth_token', 'eyJhbGciOiJIUzI1NiJ9.demo');
  }

  @override
  Widget build(BuildContext context) {
    // 调试输出进生产包
    print('build home');
    return Scaffold(
      body: Column(
        children: [
          // 加载远程收银台页面，未做源校验
          WebView(initialUrl: 'https://pay.example.com/checkout'),
          // 长列表一次性构建 + 强制全量测量
          Expanded(
            child: ListView(
              shrinkWrap: true,
              children: [Text('item-1'), Text('item-2')],
            ),
          ),
        ],
      ),
    );
  }
}
