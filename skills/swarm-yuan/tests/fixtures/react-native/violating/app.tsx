// violating fixture（WP-V react-native）：
//  - WebView 远程 URL 无白名单 → fw_react_native_webview_no_whitelist(fail)
//  - AsyncStorage 明文存 user_token → fw_react_native_asyncstorage_secret(fail)
//  - console.log 残留 → fw_react_native_console_log(warn)
//  - ScrollView 承载列表、无 SafeArea、无 memo → 三条 warn
// 期望：bash tests/run-framework-fixture.sh react-native → violating 退出码 != 0（FAIL）
import React from 'react';
import { ScrollView, View, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';

export function App() {
  // 凭证明文落 AsyncStorage（iOS plist / Android SQLite 未加密）
  AsyncStorage.setItem('user_token', 'eyJhbGciOiJIUzI1NiJ9.demo');
  // 调试输出进生产包
  console.log('app boot');
  return (
    <View>
      {/* 加载远程收银台页面，未收窄可信源 */}
      <WebView source={{ uri: 'https://pay.example.com/checkout' }} />
      <ScrollView>
        <Text>item-1</Text>
        <Text>item-2</Text>
      </ScrollView>
    </View>
  );
}
