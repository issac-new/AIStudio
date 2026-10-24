'use client';

// violating fixture 追加（2026-07-20 P1 唤醒）：Client Component 调用 next/headers 的 cookies()
// → fw_nextjs_headers_server_only(fail)
// 已知交叉触发：本文件的 'next/headers' 导入含 'next/head' 子串，
// 会同时触发 fw_nextjs_metadata_api(warn) 误报（warn 级，门禁启发式局限，见 README 登记）。
import { useState } from 'react';
import { cookies } from 'next/headers';

export function ClientCookie() {
  const jar = cookies();
  const [theme] = useState(jar.get('theme')?.value ?? 'light');
  return <div>theme: {theme}</div>;
}
