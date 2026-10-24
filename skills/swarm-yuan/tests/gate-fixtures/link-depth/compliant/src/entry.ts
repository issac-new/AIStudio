// 浅调用链入口：一跳到 service，service 含真实逻辑（非纯转发）
import { loadOrder } from './order-service';

export function handle(): string {
  const label = loadOrder(1);
  return `handle:${label}`;
}
