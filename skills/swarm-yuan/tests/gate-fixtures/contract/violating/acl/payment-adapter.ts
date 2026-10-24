// ACL 防腐层适配器：已就位但被 order 上下文绕过（§2 检测要求 ACL 目录存在才启用跨上下文检查）
import { pay } from '../contexts/payment/gateway';

export function payViaAcl(id: number): string {
  return pay(id);
}
