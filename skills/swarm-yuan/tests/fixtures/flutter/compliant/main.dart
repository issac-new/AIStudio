// compliant fixture（WP-V flutter）：
//  - WebView 配 navigationDelegate 源校验 → fw_flutter_webview_unrestricted pass
//  - 凭证走 flutter_secure_storage（Keychain/Keystore）→ fw_flutter_sharedprefs_secret pass
//  - const 构造 / debugPrint / SafeArea / ListView.builder → 全 pass
//  - analysis_options.yaml 接入 flutter_lints → fw_flutter_lints pass
// 期望：bash tests/run-framework-fixture.sh flutter → compliant 退出码 == 0（PASS）
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:webview_flutter/webview_flutter.dart';

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  static const _storage = FlutterSecureStorage();
  static const _items = <String>['item-1', 'item-2'];

  Future<void> saveToken() async {
    // 凭证走 Keychain/Keystore 硬件级安全存储，不落 shared_preferences
    await _storage.write(key: 'auth_token', value: 's3cret');
  }

  @override
  Widget build(BuildContext context) {
    debugPrint('build home');
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            WebView(
              initialUrl: 'https://pay.example.com/checkout',
              navigationDelegate: (request) {
                // 仅放行收银台域，其余源拦截
                if (request.url.startsWith('https://pay.example.com')) {
                  return NavigationDecision.navigate;
                }
                return NavigationDecision.prevent;
              },
            ),
            Expanded(
              child: ListView.builder(
                itemCount: _items.length,
                itemBuilder: (context, index) => Text(_items[index]),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
