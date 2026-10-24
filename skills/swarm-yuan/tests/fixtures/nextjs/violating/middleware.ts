// violating fixture: middleware 未导出 config 路径匹配配置（默认拦截全站，含静态资源，性能差）
// → 触发「中间件路径匹配配置」fail 门禁（门禁 id 见本目录 README；
//   注释不写该 id 字面量：门禁为全文 grep，注释含字面量会中和触发，2026-07-20 P1 唤醒修正）
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // 无路径匹配配置：默认拦截全站（含静态资源），性能差
  return NextResponse.next();
}
