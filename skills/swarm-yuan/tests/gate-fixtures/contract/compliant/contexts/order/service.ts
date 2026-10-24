// order 上下文：合规——跨上下文访问经 ACL 防腐层中转，不直接 import payment 内部
import { payViaAcl } from '../../acl/payment-adapter';

export function placeOrder(id: number): string {
  return payViaAcl(id);
}
