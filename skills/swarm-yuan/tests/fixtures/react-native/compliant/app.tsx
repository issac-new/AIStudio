// compliant fixture（WP-V react-native）：
//  - WebView 配 originWhitelist 收窄可信源 → fw_react_native_webview_no_whitelist pass
//  - 凭证走 react-native-keychain（Keychain/Keystore）→ fw_react_native_asyncstorage_secret pass
//  - 无 console 调试残留 / SafeAreaView / FlatList / React.memo+useMemo → 全 pass
// 期望：bash tests/run-framework-fixture.sh react-native → compliant 退出码 == 0（PASS）
import React, { useMemo } from 'react';
import { SafeAreaView, FlatList, Text } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { WebView } from 'react-native-webview';

const DATA = [{ id: '1', title: 'item-1' }];

function Row({ title }: { title: string }) {
  return <Text>{title}</Text>;
}

const MemoRow = React.memo(Row);

export function App() {
  const data = useMemo(() => DATA, []);
  // 凭证走 Keychain/Keystore 硬件级安全存储，不落 AsyncStorage
  Keychain.setGenericPassword('user', 's3cret');
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <WebView
        source={{ uri: 'https://pay.example.com/checkout' }}
        originWhitelist={['https://pay.example.com']}
      />
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MemoRow title={item.title} />}
      />
    </SafeAreaView>
  );
}
